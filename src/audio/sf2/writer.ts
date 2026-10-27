import {
  BRR_SAMPLE_RATE,
  instrumentPitch,
  SAMPLE_TABLE,
  SPC_FREQ_TABLE_C,
} from '../constants.js';

/**
 * Compute the exact DSP pitch register value for a given instrument at C4.
 *
 * From SPC engine disassembly (ARAM $0592–$05F0):
 *   1. freq_shifted = (freqTable[semitone] × 2) >> (6 − octave)
 *      The code doubles via ASL+ROL *before* the right-shift loop.
 *   2. DSP_pitch = (freq_shifted × instPitch) >> 8   (middle 16 bits)
 *
 * At C4 (octave 3, semitone 0):
 *   freq_shifted = (freqTable[0] × 2) >> 3 = freqTable[0] >> 2 = 535
 *   Equivalently: DSP_pitch ≈ (freqTable[0] × instPitch) >> 10
 */
function dspPitchAtC4(instPitch: number): number {
  const freqShifted = SPC_FREQ_TABLE_C >> 2;
  return ((freqShifted * instPitch) >>> 8) & 0xffff;
}
import {
  decodeBrr,
  pcmToWav,
} from '../brr/decode.js';
import {
  extractBrrFromSfx,
  loopStartOffsetToSampleIndex,
  resolveSfxPath,
} from '../parse/sfx-parser.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface DecodedSample {
  id: number;
  name: string;
  pcm: Int16Array;
  loopStart: number;
  /** Always BRR_SAMPLE_RATE — PCM is decoded at native DSP rate. */
  sampleRate: number;
  rootKey: number;
  /** Fine-tune correction in cents (−99 to +99) for integer rootKey rounding. */
  pitchCorrection: number;
  /** SNES DSP ADSR1 byte. */
  adsr1: number;
  /** SNES DSP ADSR2 byte. */
  adsr2: number;
}

/*
 * SNES DSP ADSR → SF2 envelope conversion.
 *
 * SF2 uses timecents (1200 × log₂(seconds)) for attack/decay/release.
 * 0 timecents = 1 second, 1200 = 2 seconds, -1200 = 0.5 seconds, etc.
 *
 * SNES DSP attack rates (fullsnes documentation):
 *   Rate 15: ~0ms (instant), Rate 0: ~4.1s
 *   Formula: time ≈ 64 × (15 - rate + 1) / 1000 for rate > 0
 *
 * SNES DSP decay/sustain rates:
 *   Rate 0: infinite (no decay), Rate 31: ~1ms
 *   These use an exponential envelope.
 */

/**
 * SNES DSP internal rate → approximate milliseconds for full envelope traversal.
 * Index = internal rate (0–31). Rate 0 = never, rate 31 = fastest.
 *
 * Field-to-internal-rate mapping:
 *   Attack field (0–15) → internal rate = field × 2 + 1  (range 1–31)
 *   Decay  field (0–7)  → internal rate = field × 2 + 16 (range 16–30)
 *   Sustain rate  (0–31) → internal rate directly
 */
const RATE_TO_MS: readonly number[] = [
  Infinity, 38000, 28000, 24000, 19000, 14000, 12000, 9400,
  7100,     5900,  4700,  3500,  2900,  2400,  1800,  1500,
  1200,      880,   740,   590,   440,   370,   290,   220,
   180,      150,   110,    92,    74,    55,    37,    18,
];

/**
 * SNES DSP step interval (ticks at 32 kHz) per internal rate.
 * Attack is LINEAR: each step adds 32 to the 11-bit envelope (0→2047).
 * Full attack = 64 steps × step_interval / 32000 seconds.
 * (Rate 31 is special: adds 1024 per step, so only 2 steps.)
 *
 * Decay/sustain are EXPONENTIAL and take much longer for the same rate.
 * Do NOT use RATE_TO_MS for attack; it gives decay times.
 */
const STEP_INTERVAL: readonly number[] = [
  0, 2048, 1536, 1280, 1024, 768, 640, 512,
  256, 192, 160, 128, 64, 48, 40, 32,
  16, 12, 10, 8, 4, 3, 2, 2,
  1, 1, 1, 1, 1, 1, 1, 1,
];

/** Attack field (0–15) → milliseconds (LINEAR envelope, 64 steps of +32). */
function attackMs(field: number): number {
  const rate = field * 2 + 1;
  if (rate >= 31) return 0.06; // instant (2 steps of 1024)
  return 64 * STEP_INTERVAL[rate]! / 32; // ms = 64 × interval / 32000 × 1000
}

/** Decay field (0–7) → milliseconds via internal rate = field × 2 + 16. */
function decayMs(field: number): number {
  return RATE_TO_MS[field * 2 + 16]!;
}

/** Sustain rate (0–31) → milliseconds (direct internal rate). */
function sustainRateMs(field: number): number {
  return RATE_TO_MS[field]!;
}

function msToTimecents(ms: number): number {
  if (ms <= 0 || !isFinite(ms)) return -32768; // instant / minimum
  const seconds = ms / 1000;
  return Math.round(1200 * Math.log2(seconds));
}

/** SNES sustain level (0-7) → SF2 sustainVolEnv in centibels of attenuation. */
function snesSustainToCb(sustainLevel: number): number {
  // SNES: 0 = 1/8 volume, 7 = 8/8 (full). SF2: 0 = no attenuation, 1000 = max.
  if (sustainLevel >= 7) return 0;  // full sustain = no attenuation
  const fraction = (sustainLevel + 1) / 8;
  return Math.round(-200 * Math.log10(fraction)); // centibels
}

const SF2_SAMPLE_PAD = 46;

function writePaddedString(str: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  out.set(new TextEncoder().encode(str).subarray(0, length - 1));
  return out;
}

function u32(value: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, value >>> 0, true);
  return b;
}

function u16(value: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, value & 0xffff, true);
  return b;
}

function i16(value: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setInt16(0, value, true);
  return b;
}

function chunk(id: string, body: Uint8Array): Uint8Array {
  const idBytes = new TextEncoder().encode(id);
  const out = new Uint8Array(8 + body.length);
  out.set(idBytes);
  out.set(u32(body.length), 4);
  out.set(body, 8);
  return out;
}

function list(type: string, ...children: Uint8Array[]): Uint8Array {
  return chunk('LIST', concat(new TextEncoder().encode(type), ...children));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** SF2 sample header — 46 bytes per SoundFont 2.04 spec. */
function writeSampleHeader(
  name: string,
  start: number,
  end: number,
  loopStart: number,
  loopEnd: number,
  sampleRate: number,
  rootKey: number,
  pitchCorrection: number,
  sampleType: number,
): Uint8Array {
  return concat(
    writePaddedString(name, 20),
    u32(start),
    u32(end),
    u32(loopStart),
    u32(loopEnd),
    u32(sampleRate),
    new Uint8Array([rootKey & 0x7f]),
    new Uint8Array([(pitchCorrection & 0xff)]), // pitch correction in cents
    u16(0), // sample link
    u16(sampleType), // 1=mono, 0=ROM
  );
}

export function loadSamplesFromSfxDir(sfxDir: string): DecodedSample[] {
  const samples: DecodedSample[] = [];
  for (const entry of SAMPLE_TABLE) {
    const path = resolveSfxPath(sfxDir, entry.id);
    if (!path) continue;

    const file = readFileSync(path);
    const brr = extractBrrFromSfx(file, entry.sampleLength);
    const { pcm } = decodeBrr(brr);

    const loopStartSample = loopStartOffsetToSampleIndex(entry.loopStartOffset);
    const loopStart =
      loopStartSample > 0 && loopStartSample < pcm.length ? loopStartSample : 0;

    /*
     * PCM is decoded at BRR_SAMPLE_RATE (32 kHz). The SF2 sampleRate MUST match
     * the decode rate so the player reads the waveform at the correct speed.
     *
     * The IoG SPC engine (ARAM $0592–$05F0) computes DSP pitch at C4 as:
     *   freq_shifted = (freqTable[0] × 2) >> 3 = freqTable[0] >> 2  (octave 3)
     *   DSP_pitch    = (freq_shifted × instPitch) >> 8
     *   playback_rate = BRR_SAMPLE_RATE × DSP_pitch / 4096
     *
     * For the SF2 to match at MIDI note 60 (C4):
     *   rootKey = 60 − 12 × log₂(DSP_pitch / 4096)
     */
    const instPitch = instrumentPitch(entry.definitionBytes);
    const dsp = dspPitchAtC4(instPitch);
    const exactRootKey = 60 - 12 * Math.log2(dsp / 4096);
    const rootKey = Math.max(0, Math.min(127, Math.round(exactRootKey)));
    const pitchCorrection = Math.max(-99, Math.min(99,
      Math.round((rootKey - exactRootKey) * 100)));

    samples.push({
      id: entry.id,
      name: entry.name,
      pcm,
      loopStart,
      sampleRate: BRR_SAMPLE_RATE,
      rootKey,
      pitchCorrection,
      adsr1: entry.definitionBytes[0]!,
      adsr2: entry.definitionBytes[1]!,
    });
  }
  return samples;
}

/** Build SF2: preset number = IoG sample ID, one zone per preset. */
export function buildSoundFont(samples: DecodedSample[]): Uint8Array {
  // --- smpl chunk ---
  // SF2 spec requires 46 zero-padded samples after each sample for interpolation.
  let smplOffset = SF2_SAMPLE_PAD;
  const pcmParts: { data: Int16Array; offset: number }[] = [
    { data: new Int16Array(SF2_SAMPLE_PAD), offset: 0 },
  ];

  interface ShdrEntry {
    name: string;
    start: number;
    end: number;
    loopStart: number;
    loopEnd: number;
    sampleRate: number;
    rootKey: number;
    pitchCorrection: number;
    sampleType: number;
  }
  const shdrEntries: ShdrEntry[] = [];

  for (const s of samples) {
    const start = smplOffset;
    const end = smplOffset + s.pcm.length;
    const hasLoop = s.loopStart > 0 && s.loopStart < s.pcm.length;
    const loopStart = hasLoop ? smplOffset + s.loopStart : end;
    shdrEntries.push({
      name: s.name,
      start,
      end,
      loopStart,
      loopEnd: end,
      sampleRate: s.sampleRate,
      rootKey: s.rootKey,
      pitchCorrection: s.pitchCorrection,
      sampleType: 1, // SF_SAMPLE_MONO
    });
    pcmParts.push({ data: s.pcm, offset: smplOffset });
    smplOffset += s.pcm.length;
    // 46-sample zero padding after each sample (required by SF2 spec for interpolation)
    pcmParts.push({ data: new Int16Array(SF2_SAMPLE_PAD), offset: smplOffset });
    smplOffset += SF2_SAMPLE_PAD;
  }

  const smpl = new Int16Array(smplOffset);
  for (const p of pcmParts) {
    smpl.set(p.data, p.offset);
  }
  const smplBytes = new Uint8Array(smpl.length * 2);
  const dv = new DataView(smplBytes.buffer);
  for (let i = 0; i < smpl.length; i++) dv.setInt16(i * 2, smpl[i]!, true);

  // --- pdta chunk ---
  const phdr: Uint8Array[] = [];
  const pbag: Uint8Array[] = [];
  const pgen: Uint8Array[] = [];
  const inst: Uint8Array[] = [];
  const ibag: Uint8Array[] = [];
  const igen: Uint8Array[] = [];

  let pgenIdx = 0;
  let igenIdx = 0;

  for (let presetId = 0; presetId < 60; presetId++) {
    const sample = samples.find((s) => s.id === presetId);
    const name = sample?.name ?? `Unused $${presetId.toString(16).toUpperCase()}`;

    phdr.push(concat(
      writePaddedString(name, 20),
      u16(presetId),
      u16(0),
      u16(pbag.length),
      u32(0),
      u32(0),
      u16(0),
      u16(0), // pad to 38 bytes
    ));
    pbag.push(concat(u16(pgenIdx), u16(0)));

    if (sample) {
      const instIdx = inst.length;
      pgen.push(concat(u16(41), i16(instIdx))); // genInstrument
      pgenIdx += 1;

      inst.push(concat(writePaddedString(name, 20), u16(ibag.length)));
      ibag.push(concat(u16(igenIdx), u16(0)));

      const shdrIdx = samples.indexOf(sample);
      const hasLoop = sample.loopStart > 0 && sample.loopStart < sample.pcm.length;

      // ADSR envelope generators (from SNES DSP ADSR1/ADSR2 bytes)
      const adsrMode = (sample.adsr1 >> 7) & 1;
      if (adsrMode) {
        const attackField = sample.adsr1 & 0x0f;
        const decayField = (sample.adsr1 >> 4) & 7;
        const sustainLevel = (sample.adsr2 >> 5) & 7;
        const sustainRateField = sample.adsr2 & 0x1f;

        // Gen 33: attackVolEnv (timecents)
        const attackTc = msToTimecents(attackMs(attackField));
        igen.push(concat(u16(33), i16(attackTc)));

        /*
         * Gen 35: decayVolEnv + Gen 36: sustainVolEnv
         *
         * SNES quirk: after the decay phase reaches the sustain level, the
         * envelope continues to DECREASE at sustainRate while the key is held.
         * SF2 has no sustain-phase fade — its sustain level is constant.
         *
         * Approximation strategy:
         *   • If sustainRate > 0 (SNES envelope fades during sustain):
         *     Merge the SNES decay + sustain phases into the SF2 decay phase.
         *     Set SF2 sustain very low (960 cB ≈ silence) so the SF2 decay
         *     covers the entire envelope trajectory from peak to near-zero.
         *     The combined decay time = SNES decay time + sustain fade time.
         *   • If sustainRate = 0 (infinite sustain, no fade):
         *     Use the normal SNES decay time and sustain level as-is.
         */
        let decayTotalMs = decayMs(decayField);
        let sustainCb = snesSustainToCb(sustainLevel);

        if (sustainRateField > 0) {
          const fadeMs = sustainRateMs(sustainRateField);
          if (isFinite(fadeMs) && fadeMs > 0) {
            // The sustain-phase fade halves amplitude every fadeMs ms.
            // Time from sustain level to ~−96 dB silence needs many halvings.
            // The sustain level fraction = (sustainLevel+1)/8.
            // Additional halvings to reach 0.1% ≈ 10 halvings from full scale.
            // From sustain level: halvings_needed = log2(sustainFraction / 0.001)
            const sustainFraction = (sustainLevel + 1) / 8;
            const halvingsNeeded = Math.max(1, Math.log2(sustainFraction / 0.001));
            const sustainFadeMs = halvingsNeeded * fadeMs;
            decayTotalMs += sustainFadeMs;
          }
          sustainCb = 960; // effectively silent — decay covers the full fade
        }

        const decTc = msToTimecents(decayTotalMs);
        igen.push(concat(u16(35), i16(decTc)));
        igen.push(concat(u16(36), i16(sustainCb)));

        // Gen 38: releaseVolEnv
        // SNES DSP release is FIXED: envelope decreases by 8 per sample at 32 kHz.
        // From max (2047) to zero: 256 samples ≈ 8ms. ALL instruments release
        // in ~8ms on real hardware. Use a short constant to match this behavior.
        // A tiny minimum (10ms) avoids click artifacts in the SF2 player.
        igen.push(concat(u16(38), i16(msToTimecents(10))));

        igenIdx += 4;
      }

      // Gen 52: fineTune (cents) — use this instead of SHDR pitchCorrection
      // for maximum SF2 player compatibility (some players ignore SHDR correction).
      if (sample.pitchCorrection !== 0) {
        igen.push(concat(u16(52), i16(sample.pitchCorrection)));
        igenIdx += 1;
      }

      igen.push(concat(u16(54), i16(hasLoop ? 1 : 0))); // gen 54 = sampleModes (1=loop)
      igen.push(concat(u16(53), i16(shdrIdx))); // gen 53 = sampleID (must be last in zone)
      igenIdx += 2;
    }
  }

  // Terminal records (required)
  phdr.push(concat(writePaddedString('EOP', 20), u16(65535), u16(0), u16(pbag.length), u32(0), u32(0), u16(0), u16(0)));
  pbag.push(concat(u16(pgenIdx), u16(0)));
  pgen.push(concat(u16(0), i16(0)));

  inst.push(concat(writePaddedString('EOI', 20), u16(ibag.length)));
  ibag.push(concat(u16(igenIdx), u16(0)));
  igen.push(concat(u16(0), i16(0)));

  // SHDR pitchCorrection is zeroed — correction lives in gen 52 (fineTune)
  // in the instrument zone, for maximum player compatibility.
  const shdrChunks: Uint8Array[] = shdrEntries.map((s) =>
    writeSampleHeader(
      s.name,
      s.start,
      s.end,
      s.loopStart,
      s.loopEnd,
      s.sampleRate,
      s.rootKey,
      0, // pitchCorrection = 0 (moved to gen 52)
      s.sampleType,
    ),
  );
  shdrChunks.push(
    writeSampleHeader('EOS', smplOffset, smplOffset, smplOffset, smplOffset, BRR_SAMPLE_RATE, 60, 0, 0),
  );

  const pdta = concat(
    chunk('phdr', concat(...phdr)),
    chunk('pbag', concat(...pbag)),
    chunk('pmod', new Uint8Array(10)), // terminal modulator list
    chunk('pgen', concat(...pgen)),
    chunk('inst', concat(...inst)),
    chunk('ibag', concat(...ibag)),
    chunk('imod', new Uint8Array(10)), // terminal modulator list
    chunk('igen', concat(...igen)),
    chunk('shdr', concat(...shdrChunks)),
  );

  const sdta = chunk('smpl', smplBytes);
  const infoList = list('INFO',
    chunk('ifil', concat(u16(2), u16(4))),
    chunk('INAM', writePaddedString('Illusion of Gaia', 20)),
  );
  const body = concat(infoList, list('sdta', sdta), list('pdta', pdta));

  return concat(
    new TextEncoder().encode('RIFF'),
    u32(4 + body.length),
    new TextEncoder().encode('sfbk'),
    body,
  );
}

export function buildSoundFontFromSfxDir(sfxDir: string): Uint8Array {
  return buildSoundFont(loadSamplesFromSfxDir(sfxDir));
}

/**
 * Export raw BRR→PCM as 32 kHz WAV files (lossless, round-trip safe).
 *
 * NO resampling, NO loop extension. The WAV contains the exact decoded
 * BRR PCM at the native DSP rate. This allows re-encoding back to
 * identical BRR data.
 */
export function exportSampleWavs(sfxDir: string, outputDir: string): number {
  mkdirSync(outputDir, { recursive: true });
  const sfxWavDir = join(sfxDir, 'wav');
  mkdirSync(sfxWavDir, { recursive: true });
  let count = 0;
  for (const entry of SAMPLE_TABLE) {
    const path = resolveSfxPath(sfxDir, entry.id);
    if (!path) continue;
    const file = readFileSync(path);
    const brr = extractBrrFromSfx(file, entry.sampleLength);
    const { pcm } = decodeBrr(brr);

    const wav = pcmToWav(pcm, BRR_SAMPLE_RATE);
    const hex = entry.id.toString(16).padStart(2, '0');
    const safe = entry.name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').toLowerCase();
    writeFileSync(join(outputDir, `sfx${hex}_${safe}.wav`), wav);
    writeFileSync(join(sfxWavDir, `sfx${hex}.wav`), wav);
    count += 1;
  }
  return count;
}
