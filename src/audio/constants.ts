/**
 * Data Crystal sample table (Illusion of Gaia / Notes — Music data format).
 * https://datacrystal.tcrf.net/wiki/Illusion_of_Gaia/Notes#Music_data_format
 *
 * GM programs are fallback only when SF2 is unavailable. Accurate playback
 * requires the bundled SoundFont built from temp/sfx/*.sfx BRR samples.
 */
export const ARAM_SONG_BASE_STANDARD = 0x5532;
export const ARAM_SONG_BASE_EXTENDED = 0x1400;
export const ARAM_INSTRUMENT_DEF = 0x1254;
export const ARAM_DRIVER_INIT = 0x1200;
export const ARAM_VELOCITY_TABLE = 0x1300;
export const ARAM_SAMPLE_DIR = 0x1038;
export const ARAM_SAMPLE_DIR_EXTENDED = 0x1000;
export const ARAM_SONG_BASE_PTR = 0x0ffc;
export const ARAM_SAMPLE_END_PTR = 0x0ffe;
export const ARAM_SPC_SLOTS = 0x0fe0;

export const SPC_SLOT_BASE = 0x0e;

/**
 * IoG N-SPC uses 24 ticks per quarter note.
 * Verified from note durations: 12=eighth (most common), 24=quarter, 48=half, 96=whole.
 */
export const NSPC_TICKS_PER_QUARTER = 24;
export const MIDI_PPQN = 480;

/** SNES DSP mixer rate; BRR pitch 0x1000 plays decoded samples at this rate. */
export const BRR_SAMPLE_RATE = 32000;

/**
 * IoG SPC engine frequency table — first entry (C) at ARAM $0E59.
 * 13 values covering C through C+ (one octave + wrap). Each is a 14-bit
 * pitch register base value. The engine (ARAM $0592–$05F0) computes:
 *
 *   1. octave = noteIndex / 12,  semitone = noteIndex % 12
 *   2. freq_shifted = (freqTable[semitone] × 2) >> (6 − octave)
 *      The code doubles via ASL+ROL before the right-shift loop.
 *   3. DSP_pitch = middle_16_bits( freq_shifted × instrumentPitch )
 *              = (freq_shifted × instrumentPitch) >> 8
 *
 * Effectively: DSP_pitch ≈ (freqTable[semitone] × instPitch) >> (13 − octave)
 *
 * At C4 (octave 3): DSP_pitch = ((freqTable[0] >> 2) × instPitch) >> 8
 * Since freqTable[0]/1024 ≈ 2.093, this doubles the raw instPitch at C4.
 *
 * Extracted from spc_sound_engine binary at ROM offset 168078 + 2653.
 */
export const SPC_FREQ_TABLE: readonly number[] = [
  0x085f, 0x08de, 0x0965, 0x09f4, 0x0a8c, 0x0b2c,
  0x0bd6, 0x0c8b, 0x0d4a, 0x0e14, 0x0eea, 0x0fcd,
  0x10be,
];

/** Frequency table value for C (semitone 0) — used for rootKey calculation. */
export const SPC_FREQ_TABLE_C = SPC_FREQ_TABLE[0]!; // 0x085F = 2143

/** WAV export rate — 44100 Hz (verified working in VLC; 32000 Hz often glitches on PC). */
export const WAV_EXPORT_SAMPLE_RATE = 44100;

/** ROM-only uint16 size word before each sample blob — NOT present in `.sfx` files. */
export const SFX_ROM_SIZE_PREFIX_BYTES = 2;

/**
 * IoG `.sfx` files are pure BRR block data — no header.
 * Every file is an exact multiple of 9 bytes (one BRR block = 1 header byte + 8 data bytes).
 * The first block is typically a warmup block (shift=0, filter=0) with the loop flag
 * set (byte 0 = 0x02) for looping samples or clear (byte 0 = 0x00) for one-shot samples.
 */
export const SFX_FILE_HEADER_BYTES = 0;

/** 14-bit pitch from IoG instrument definition bytes 3–4 (PITCHL, PITCHH). */
export function instrumentPitch(definitionBytes: readonly number[]): number {
  const pitch = (definitionBytes[3]! << 8) | definitionBytes[4]!;
  return Math.max(0x100, Math.min(0x3fff, pitch));
}

/** Playback sample rate for a BRR sample at its default instrument pitch. */
export function instrumentSampleRate(definitionBytes: readonly number[]): number {
  return Math.round((BRR_SAMPLE_RATE * instrumentPitch(definitionBytes)) / 4096);
}

/**
 * Root MIDI key for a looped sample (B+21 cent tuning convention).
 * See https://nesdoug.com/2022/01/27/why-b21-cents/
 */
export function loopRootMidiNote(
  pcmLength: number,
  loopStart: number,
  pitch: number,
): number {
  if (loopStart <= 0 || loopStart >= pcmLength) return 60;
  const loopLen = pcmLength - loopStart;
  // B+21 cent rule applies to short sustain loops (16–1024 samples), not full-sample loops.
  if (loopLen < 16 || loopLen > 1024) return 60;
  const freq = (BRR_SAMPLE_RATE * pitch) / 4096 / loopLen;
  const midi = 69 + 12 * Math.log2(freq / 440);
  return Math.max(0, Math.min(127, Math.round(midi)));
}

export const VELOCITY_TABLE_A = new Uint8Array([
  0x32, 0x65, 0x7f, 0x98, 0xb2, 0xcb, 0xe5, 0xfc,
  0x0a, 0x19, 0x28, 0x3c, 0x50, 0x64, 0x7d, 0x96,
  0xaa, 0xb9, 0xc8, 0xd4, 0xe1, 0xeb, 0xf5, 0xff,
]);

export const VELOCITY_TABLE_B = new Uint8Array([
  0x32, 0x65, 0x7f, 0x98, 0xb2, 0xcb, 0xe5, 0xfc,
  0x19, 0x32, 0x4c, 0x65, 0x72, 0x7f, 0x8c, 0x98,
  0xa5, 0xb2, 0xbf, 0xcb, 0xd8, 0xe5, 0xf2, 0xfc,
]);

export const SAMPLE_TABLE: ReadonlyArray<{
  id: number;
  name: string;
  definitionBytes: readonly number[];
  sampleLength: number;
  loopStartOffset: number;
  /** Fallback GM program when SF2 is not loaded. */
  gmProgram: number;
}> = [
  { id: 0x00, name: 'SFX', definitionBytes: [0xff, 0xe0, 0xb8, 0x03, 0x90], sampleLength: 0x065d, loopStartOffset: 0x0009, gmProgram: 127 },
  { id: 0x01, name: 'SFX', definitionBytes: [0x8f, 0xe0, 0xb8, 0x04, 0x00], sampleLength: 0x0063, loopStartOffset: 0x003f, gmProgram: 127 },
  { id: 0x02, name: 'SFX', definitionBytes: [0x8f, 0xf4, 0xb8, 0x03, 0xc0], sampleLength: 0x09e1, loopStartOffset: 0x09e1, gmProgram: 127 },
  { id: 0x03, name: 'SFX', definitionBytes: [0x8f, 0xe9, 0xb8, 0x06, 0xf0], sampleLength: 0x0051, loopStartOffset: 0x0012, gmProgram: 127 },
  { id: 0x04, name: 'SFX', definitionBytes: [0xff, 0xe0, 0xb8, 0x04, 0x80], sampleLength: 0x034e, loopStartOffset: 0x034e, gmProgram: 127 },
  { id: 0x05, name: 'SFX', definitionBytes: [0xff, 0xe0, 0xb8, 0x02, 0x80], sampleLength: 0x022e, loopStartOffset: 0x022e, gmProgram: 127 },
  { id: 0x06, name: 'SFX', definitionBytes: [0x8f, 0xf6, 0xb8, 0x0f, 0x70], sampleLength: 0x0492, loopStartOffset: 0x0264, gmProgram: 127 },
  { id: 0x07, name: 'SFX', definitionBytes: [0x8f, 0xe0, 0xb8, 0x04, 0x00], sampleLength: 0x0063, loopStartOffset: 0x003f, gmProgram: 127 },
  { id: 0x08, name: 'SFX', definitionBytes: [0xff, 0xe0, 0xb8, 0x03, 0xd0], sampleLength: 0x0585, loopStartOffset: 0x0585, gmProgram: 127 },
  { id: 0x09, name: 'SFX', definitionBytes: [0xff, 0xe0, 0xb8, 0x03, 0xd0], sampleLength: 0x0585, loopStartOffset: 0x0585, gmProgram: 127 },
  { id: 0x0a, name: 'SFX', definitionBytes: [0xff, 0xe4, 0xb8, 0x0a, 0xe0], sampleLength: 0x0dd1, loopStartOffset: 0x0438, gmProgram: 127 },
  { id: 0x0b, name: 'SFX', definitionBytes: [0x8f, 0xeb, 0xb8, 0x01, 0x00], sampleLength: 0x001b, loopStartOffset: 0x0012, gmProgram: 127 },
  { id: 0x0c, name: 'SFX', definitionBytes: [0xff, 0x8e, 0xb8, 0x01, 0xf0], sampleLength: 0x0105, loopStartOffset: 0x00f3, gmProgram: 127 },
  { id: 0x0d, name: 'SFX', definitionBytes: [0xff, 0x91, 0xb8, 0x03, 0xd0], sampleLength: 0x0585, loopStartOffset: 0x0585, gmProgram: 127 },
  { id: 0x0e, name: 'Electric guitar 1', definitionBytes: [0xff, 0xe0, 0xb8, 0x0d, 0xa0], sampleLength: 0x12ea, loopStartOffset: 0x0480, gmProgram: 29 },
  { id: 0x0f, name: 'Strings 1', definitionBytes: [0xfb, 0xe0, 0xb8, 0x04, 0x90], sampleLength: 0x19bc, loopStartOffset: 0x0009, gmProgram: 48 },
  { id: 0x10, name: 'Flute 1', definitionBytes: [0xff, 0x88, 0xb8, 0x03, 0xf0], sampleLength: 0x05a9, loopStartOffset: 0x0585, gmProgram: 73 },
  { id: 0x11, name: 'Glockenspiel', definitionBytes: [0xff, 0x8e, 0xb8, 0x03, 0xf0], sampleLength: 0x02be, loopStartOffset: 0x029a, gmProgram: 9 },
  { id: 0x12, name: 'Snare 1', definitionBytes: [0xff, 0xe0, 0xb8, 0x05, 0x50], sampleLength: 0x03de, loopStartOffset: 0x03de, gmProgram: 38 },
  { id: 0x13, name: 'Jingle bell', definitionBytes: [0xff, 0xe0, 0xb8, 0x05, 0xb0], sampleLength: 0x13cb, loopStartOffset: 0x13cb, gmProgram: 14 },
  { id: 0x14, name: 'Acoustic guitar 1', definitionBytes: [0xff, 0x70, 0xb8, 0x0d, 0x00], sampleLength: 0x0804, loopStartOffset: 0x078f, gmProgram: 25 },
  { id: 0x15, name: 'Pan flute', definitionBytes: [0xf8, 0x8a, 0xb8, 0x08, 0xf0], sampleLength: 0x0b37, loopStartOffset: 0x0ae6, gmProgram: 75 },
  { id: 0x16, name: 'Woodblock 1', definitionBytes: [0xff, 0xe0, 0xb8, 0x07, 0xa0], sampleLength: 0x07b3, loopStartOffset: 0x07b3, gmProgram: 115 },
  { id: 0x17, name: 'Bongo', definitionBytes: [0xff, 0xe0, 0xb8, 0x07, 0xa0], sampleLength: 0x07b3, loopStartOffset: 0x07b3, gmProgram: 116 },
  { id: 0x18, name: 'Chirp 1', definitionBytes: [0xff, 0xe0, 0xb8, 0x02, 0xa0], sampleLength: 0x0747, loopStartOffset: 0x0747, gmProgram: 122 },
  { id: 0x19, name: 'Chirp 2', definitionBytes: [0xff, 0xe0, 0xb8, 0x02, 0x80], sampleLength: 0x0747, loopStartOffset: 0x0747, gmProgram: 122 },
  { id: 0x1a, name: 'Choir 1', definitionBytes: [0xf8, 0xe0, 0xb8, 0x02, 0xf0], sampleLength: 0x141c, loopStartOffset: 0x0009, gmProgram: 52 },
  { id: 0x1b, name: 'Pizzicato strings 1', definitionBytes: [0xbf, 0x6c, 0xb8, 0x04, 0xf0], sampleLength: 0x046e, loopStartOffset: 0x0441, gmProgram: 45 },
  { id: 0x1c, name: 'Strings 2', definitionBytes: [0xf9, 0xe0, 0xb8, 0x08, 0xf0], sampleLength: 0x10a1, loopStartOffset: 0x039f, gmProgram: 48 },
  { id: 0x1d, name: 'Tom-tom 1', definitionBytes: [0xff, 0xf1, 0xb8, 0x03, 0xd0], sampleLength: 0x15f9, loopStartOffset: 0x15f9, gmProgram: 117 },
  { id: 0x1e, name: 'Synth brass 1', definitionBytes: [0xff, 0xa8, 0xb8, 0x03, 0xf0], sampleLength: 0x0786, loopStartOffset: 0x0762, gmProgram: 62 },
  { id: 0x1f, name: 'Horn 1', definitionBytes: [0xff, 0xa8, 0xb8, 0x04, 0x70], sampleLength: 0x0615, loopStartOffset: 0x0573, gmProgram: 60 },
  { id: 0x20, name: 'Strings 3', definitionBytes: [0xfc, 0xe0, 0xb8, 0x04, 0x70], sampleLength: 0x1e96, loopStartOffset: 0x019e, gmProgram: 49 },
  { id: 0x21, name: 'Trumpet 1', definitionBytes: [0xaf, 0x88, 0xb8, 0x02, 0xf0], sampleLength: 0x044a, loopStartOffset: 0x042f, gmProgram: 56 },
  { id: 0x22, name: 'Piccolo', definitionBytes: [0xf8, 0xa8, 0xb8, 0x03, 0xf0], sampleLength: 0x04e3, loopStartOffset: 0x04bf, gmProgram: 72 },
  { id: 0x23, name: 'Muted trumpet 1', definitionBytes: [0xfc, 0xaa, 0xb8, 0x05, 0xf0], sampleLength: 0x042f, loopStartOffset: 0x03f9, gmProgram: 59 },
  { id: 0x24, name: 'Orchestra hit 1', definitionBytes: [0xff, 0xe0, 0xb8, 0x02, 0x80], sampleLength: 0x0d14, loopStartOffset: 0x0d14, gmProgram: 55 },
  { id: 0x25, name: 'Koto', definitionBytes: [0xcf, 0x52, 0xb8, 0x04, 0x70], sampleLength: 0x040b, loopStartOffset: 0x03ba, gmProgram: 107 },
  { id: 0x26, name: 'Orchestra hit 2', definitionBytes: [0xff, 0xe0, 0xb8, 0x01, 0xf0], sampleLength: 0x0b01, loopStartOffset: 0x0b01, gmProgram: 55 },
  { id: 0x27, name: 'Choir 2', definitionBytes: [0xf9, 0xa8, 0xb8, 0x03, 0x50], sampleLength: 0x2eb9, loopStartOffset: 0x0009, gmProgram: 52 },
  { id: 0x28, name: 'Electric piano', definitionBytes: [0xff, 0x8c, 0xb8, 0x03, 0xf0], sampleLength: 0x095a, loopStartOffset: 0x0936, gmProgram: 4 },
  { id: 0x29, name: 'Trumpet 2', definitionBytes: [0xaf, 0x88, 0xb8, 0x02, 0xf0], sampleLength: 0x0465, loopStartOffset: 0x044a, gmProgram: 56 },
  { id: 0x2a, name: 'Piano', definitionBytes: [0xff, 0x8c, 0xb8, 0x04, 0x70], sampleLength: 0x0dd1, loopStartOffset: 0x0d80, gmProgram: 0 },
  { id: 0x2b, name: 'Bass', definitionBytes: [0x9f, 0x68, 0xb8, 0x19, 0x00], sampleLength: 0x049b, loopStartOffset: 0x03ba, gmProgram: 32 },
  { id: 0x2c, name: 'Acoustic guitar 2', definitionBytes: [0xaf, 0x4c, 0xb8, 0x09, 0x00], sampleLength: 0x0e10, loopStartOffset: 0x0615, gmProgram: 25 },
  { id: 0x2d, name: 'Cymbal 1', definitionBytes: [0xff, 0x8d, 0xb8, 0x03, 0xd0], sampleLength: 0x20fa, loopStartOffset: 0x20fa, gmProgram: 49 },
  { id: 0x2e, name: 'Electric guitar 2', definitionBytes: [0xf9, 0xe0, 0xb8, 0x08, 0xf0], sampleLength: 0x10a1, loopStartOffset: 0x039f, gmProgram: 29 },
  { id: 0x2f, name: 'Tom-tom 2', definitionBytes: [0xff, 0xf1, 0xb8, 0x03, 0xd0], sampleLength: 0x15f9, loopStartOffset: 0x15f9, gmProgram: 117 },
  { id: 0x30, name: 'Cymbal 2', definitionBytes: [0xff, 0x8d, 0xb8, 0x03, 0xd0], sampleLength: 0x20fa, loopStartOffset: 0x20fa, gmProgram: 49 },
  { id: 0x31, name: 'Snare 2', definitionBytes: [0xff, 0xe0, 0xb8, 0x05, 0x50], sampleLength: 0x03de, loopStartOffset: 0x03de, gmProgram: 38 },
  { id: 0x32, name: 'Horn 2', definitionBytes: [0xff, 0xa8, 0xb8, 0x04, 0x70], sampleLength: 0x0615, loopStartOffset: 0x0573, gmProgram: 60 },
  { id: 0x33, name: 'Synth brass 2', definitionBytes: [0xff, 0xa8, 0xb8, 0x03, 0xf0], sampleLength: 0x0786, loopStartOffset: 0x0762, gmProgram: 62 },
  { id: 0x34, name: 'Muted Trumpet 2', definitionBytes: [0xfc, 0xab, 0xb8, 0x05, 0xf0], sampleLength: 0x042f, loopStartOffset: 0x03f9, gmProgram: 59 },
  { id: 0x35, name: 'Strings 4', definitionBytes: [0xfc, 0xe0, 0xb8, 0x04, 0x70], sampleLength: 0x1e96, loopStartOffset: 0x019e, gmProgram: 49 },
  { id: 0x36, name: 'Pizzicato strings 2', definitionBytes: [0xbf, 0x6c, 0xb8, 0x04, 0xf0], sampleLength: 0x046e, loopStartOffset: 0x0441, gmProgram: 45 },
  { id: 0x37, name: 'Flute 2', definitionBytes: [0xff, 0x88, 0xb8, 0x03, 0xf0], sampleLength: 0x05a9, loopStartOffset: 0x0585, gmProgram: 73 },
  { id: 0x38, name: 'Choir 3', definitionBytes: [0xff, 0xca, 0xb8, 0x04, 0x70], sampleLength: 0x138c, loopStartOffset: 0x0e46, gmProgram: 52 },
  { id: 0x39, name: 'Woodblock 2', definitionBytes: [0xff, 0xfe, 0xb8, 0x07, 0xa0], sampleLength: 0x026d, loopStartOffset: 0x026d, gmProgram: 115 },
  { id: 0x3a, name: 'Waterdrop', definitionBytes: [0xff, 0xe0, 0xb8, 0x03, 0xd0], sampleLength: 0x0585, loopStartOffset: 0x0585, gmProgram: 78 },
  { id: 0x3b, name: 'Squawk', definitionBytes: [0xff, 0xe0, 0xb8, 0x02, 0x40], sampleLength: 0x09ea, loopStartOffset: 0x09ea, gmProgram: 122 },
];

/** MIDI program number = sample ID so SF2 presets align with $E0 instrument indices. */
export function sampleIdToMidiProgram(sampleId: number): number {
  return sampleId & 0x7f;
}

export function getSampleName(sampleId: number): string {
  return SAMPLE_TABLE[sampleId]?.name ?? `Sample $${sampleId.toString(16).toUpperCase()}`;
}

/** Standard N-SPC pitch byte ($80–$C7) → MIDI note number. */
export function nspcPitchToMidi(pitchByte: number): number {
  return pitchByte - 0x80 + 24;
}

/** N-SPC pan ($00–$14) → MIDI CC 10 (0=hard left, 64=center, 127=hard right). */
export function nspcPanToMidi(pan: number): number {
  const clamped = Math.max(0, Math.min(20, pan & 0x1f));
  return Math.round((clamped / 20) * 127);
}

/**
 * $F4 tuning byte → 14-bit MIDI pitch bend.
 *
 * N-SPC tuning interpolates between adjacent frequency table entries:
 *   tuning 0 = exact semitone, tuning 255 = almost next semitone.
 * So tuning 256 = 1 semitone.
 *
 * MIDI pitch bend: center = 8192, range ±8191.
 * Default bend range = ±2 semitones → 1 semitone = 4096 units.
 */
export function nspcTuningToPitchBend(tuning: number): number {
  return Math.max(0, Math.min(16383, 8192 + Math.round((tuning / 256) * 4096)));
}

/** Percussion opcodes $CA–$DF — generic GM drum fallback. */
export const PERCUSSION_TO_GM_DRUM: Record<number, number> = {
  0xca: 36, 0xcb: 37, 0xcc: 38, 0xcd: 39, 0xce: 40, 0xcf: 41,
  0xd0: 42, 0xd1: 43, 0xd2: 44, 0xd3: 45, 0xd4: 46, 0xd5: 47,
  0xd6: 48, 0xd7: 49, 0xd8: 50, 0xd9: 51, 0xda: 52, 0xdb: 53,
  0xdc: 54, 0xdd: 55, 0xde: 56, 0xdf: 57,
};

export const MINIMAL_SONG_BASENAMES = new Set([
  'bgm_lolas_melody',
  'bgm_lost_incan_melody',
  'bgm_melody_of_memories',
  'bgm_no_music',
]);

export const EXTENDED_SONG_BASENAMES = new Set([
  'bgm_bittersweet_victory',
  'bgm_illusion_of_gaia',
  'bgm_rebirth',
]);

export const SF2_FILENAME = 'iog-instruments.sf2';
