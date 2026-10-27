/**
 * SNES BRR → 16-bit PCM decoder.
 *
 * Matches snes2asm/brr.py — standard SPC700 BRR (clamp + int16 wrap).
 */
import { BRR_SAMPLE_RATE, WAV_EXPORT_SAMPLE_RATE } from '../constants.js';

export interface BrrDecodeResult {
  pcm: Int16Array;
  loopSample: number;
}

const CLAMP_MASK = ~0x7ff;

function clamp15(value: number): number {
  if (value > 0x7fff) return 0x7fff;
  if (value < -0x7fff) return -0x7fff;
  return value;
}

function toInt16(value: number): number {
  return (value << 16) >> 16;
}

function sampleFilter(
  sample: number,
  filter: number,
  last1: number,
  last2: number,
): number {
  switch (filter) {
    case 0:
      return sample;
    case 1:
      return sample + last2 - (last2 >> 4);
    case 2:
      return (
        sample +
        (last2 << 1) +
        ((-(last2 + (last2 << 1))) >> 5) -
        last1 +
        (last1 >> 4)
      );
    case 3:
      return (
        sample +
        (last2 << 1) +
        ((-(last2 + (last2 << 2) + (last2 << 3))) >> 6) -
        last1 +
        ((last1 + (last1 << 1)) >> 4)
      );
    default:
      return sample;
  }
}

function decodeNibble(
  nibble: number,
  shift: number,
  filter: number,
  state: { last1: number; last2: number },
): number {
  let sample = nibble >= 8 ? nibble - 16 : nibble;

  if (shift > 12) {
    sample = sample & CLAMP_MASK;
  } else {
    sample = (sample << shift) >> 1;
  }

  sample = sampleFilter(sample, filter, state.last1, state.last2);
  sample = clamp15(sample);

  state.last1 = state.last2;
  state.last2 = sample;

  return toInt16(sample * 2);
}

/** Convert a byte offset within BRR data to a PCM sample index. */
export function brrByteOffsetToSampleIndex(byteOffset: number): number {
  if (byteOffset <= 0) return 0;
  return Math.floor(byteOffset / 9) * 16;
}

export function decodeBrr(brrData: Uint8Array): BrrDecodeResult {
  const trimmed = brrData.subarray(0, Math.floor(brrData.length / 9) * 9);
  const samples: number[] = [];
  const state = { last1: 0, last2: 0 };
  let loopSample = 0;
  let sawLoopFlag = false;

  for (let blockOffset = 0; blockOffset < trimmed.length; blockOffset += 9) {
    const header = trimmed[blockOffset]!;
    const filter = (header & 0x0c) >> 2;
    const shift = header >> 4;
    const loopFlag = (header & 0x02) !== 0;

    if (loopFlag && !sawLoopFlag) {
      loopSample = samples.length;
      sawLoopFlag = true;
    }

    for (let i = 0; i < 8; i++) {
      const byte = trimmed[blockOffset + 1 + i]!;
      samples.push(decodeNibble(byte >> 4, shift, filter, state));
      samples.push(decodeNibble(byte & 0x0f, shift, filter, state));
    }
  }

  return { pcm: new Int16Array(samples), loopSample };
}

/** SNES Gaussian interpolation (BRRtools apply_gauss_filter / -g flag). */
export function applyGaussianFilter(pcm: Int16Array): Int16Array {
  if (pcm.length < 2) return pcm.slice();
  const out = new Int16Array(pcm.length);
  let prev = (372 + 1304) * pcm[0]! + 372 * pcm[1]!;
  for (let i = 1; i < pcm.length - 1; i++) {
    const k0 = 372 * (pcm[i - 1]! + pcm[i + 1]!);
    const k = 1304 * pcm[i]!;
    out[i - 1] = prev >> 11;
    prev = k0 + k;
  }
  const last = 372 * pcm[pcm.length - 2]! + (1304 + 372) * pcm[pcm.length - 1]!;
  out[pcm.length - 2] = prev >> 11;
  out[pcm.length - 1] = last >> 11;
  return out;
}

/** Linear resample for WAV export (BRR native rate → playback rate). */
export function resampleLinear(pcm: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate || pcm.length === 0) return pcm.slice();
  const outLen = Math.max(1, Math.round((pcm.length * toRate) / fromRate));
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = (i * fromRate) / toRate;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = pcm[Math.min(idx, pcm.length - 1)]!;
    const s1 = pcm[Math.min(idx + 1, pcm.length - 1)]!;
    out[i] = Math.round(s0 + frac * (s1 - s0));
  }
  return out;
}

export function pcmToWav(pcm: Int16Array, sampleRate: number): Uint8Array {
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    view.setInt16(offset, pcm[i]!, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

/**
 * Loop the tail of a decoded sample for WAV preview (IoG instruments need looping).
 * Plays the full decode once, then repeats from `loopStart` until `targetLength`.
 */
export function extendLoopedPreview(
  pcm: Int16Array,
  loopStart: number,
  targetLength: number,
): Int16Array {
  if (pcm.length >= targetLength) return pcm.subarray(0, targetLength);
  if (loopStart <= 0 || loopStart >= pcm.length) return pcm.slice();

  const out = new Int16Array(targetLength);
  out.set(pcm);
  const loopLen = pcm.length - loopStart;
  for (let i = pcm.length; i < targetLength; i++) {
    out[i] = pcm[loopStart + ((i - loopStart) % loopLen)]!;
  }
  return out;
}

/** Decode BRR → PCM and resample for PC WAV playback (raw decode, no Gaussian). */
export function decodeBrrForWav(
  brrData: Uint8Array,
  exportRate: number = WAV_EXPORT_SAMPLE_RATE,
  decodeRate: number = BRR_SAMPLE_RATE,
): Int16Array {
  const { pcm } = decodeBrr(brrData);
  return resampleLinear(pcm, decodeRate, exportRate);
}
