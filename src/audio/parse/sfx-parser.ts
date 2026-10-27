import {
  SAMPLE_TABLE,
  SFX_FILE_HEADER_BYTES,
  sampleIdToMidiProgram,
  getSampleName,
} from '../constants.js';
import { brrByteOffsetToSampleIndex } from '../brr/decode.js';
import type { SampleMeta } from '../types.js';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Locate `sfxNN.sfx` regardless of hex letter casing (`sfx0B` vs `sfx0b`). */
export function resolveSfxPath(sfxDir: string, sampleId: number): string | undefined {
  const hex = sampleId.toString(16).padStart(2, '0');
  const candidates = [
    join(sfxDir, `sfx${hex}.sfx`),
    join(sfxDir, `sfx${hex.toUpperCase()}.sfx`),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  const suffix = `sfx${hex}.sfx`;
  for (const name of readdirSync(sfxDir)) {
    if (name.toLowerCase() === suffix) return join(sfxDir, name);
  }
  return undefined;
}

/**
 * Extract BRR block data from an IoG `.sfx` file.
 * The file is pure BRR data (no header) — every file is an exact multiple of 9 bytes.
 * `expectedFileLength` comes from the Data Crystal SampleLength column (`.sfx` file size).
 */
export function extractBrrFromSfx(file: Uint8Array, expectedFileLength?: number): Uint8Array {
  const fileLen = expectedFileLength ?? file.length;
  const brrEnd = Math.min(file.length, fileLen);
  const brr = file.subarray(SFX_FILE_HEADER_BYTES, brrEnd);
  const blocks = Math.floor(brr.length / 9);
  return brr.subarray(0, blocks * 9);
}

/**
 * Data Crystal LoopStartOffset is a byte offset into the BRR data (the `.sfx` file
 * contains pure BRR blocks with no header). Convert to a PCM sample index.
 * When loopStartOffset == sampleLength the sample does not loop (returns pcm.length).
 */
export function loopStartOffsetToSampleIndex(fileOffset: number): number {
  if (fileOffset <= 0) return 0;
  return brrByteOffsetToSampleIndex(fileOffset);
}

export function parseSfx(data: Uint8Array, id: number): SampleMeta {
  const tableEntry = SAMPLE_TABLE[id];
  if (!tableEntry) {
    throw new Error(`Unknown sample ID $${id.toString(16)}`);
  }

  return {
    id,
    name: tableEntry.name,
    definitionBytes: new Uint8Array(tableEntry.definitionBytes),
    sampleLength: data.length,
    loopStartOffset: tableEntry.loopStartOffset,
    gmProgram: tableEntry.gmProgram,
    isPercussion: false,
    brrData: extractBrrFromSfx(data, tableEntry.sampleLength),
  };
}

export function buildSampleMap(): Map<number, SampleMeta> {
  const map = new Map<number, SampleMeta>();
  for (const entry of SAMPLE_TABLE) {
    map.set(entry.id, {
      id: entry.id,
      name: entry.name,
      definitionBytes: new Uint8Array(entry.definitionBytes),
      sampleLength: entry.sampleLength,
      loopStartOffset: entry.loopStartOffset,
      gmProgram: entry.gmProgram,
      isPercussion: false,
      brrData: new Uint8Array(0),
    });
  }
  return map;
}

export function slotToSampleId(
  slot: number,
  spcSlots: number[],
  sampleIds: number[],
): number | undefined {
  const index = spcSlots.indexOf(slot);
  if (index >= 0 && index < sampleIds.length) {
    return sampleIds[index]!;
  }
  const offset = slot - 0x0e;
  if (offset >= 0 && offset < sampleIds.length) {
    return sampleIds[offset]!;
  }
  return undefined;
}

export function sampleIdToGmProgram(sampleId: number): number {
  return SAMPLE_TABLE[sampleId]?.gmProgram ?? 0;
}

export { sampleIdToMidiProgram, getSampleName };
