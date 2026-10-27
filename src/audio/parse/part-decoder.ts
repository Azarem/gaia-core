import {
  ARAM_DRIVER_INIT,
  ARAM_INSTRUMENT_DEF,
  ARAM_SAMPLE_DIR,
  ARAM_SAMPLE_DIR_EXTENDED,
  ARAM_SAMPLE_END_PTR,
  ARAM_SONG_BASE_EXTENDED,
  ARAM_SONG_BASE_PTR,
  ARAM_SONG_BASE_STANDARD,
  ARAM_SPC_SLOTS,
  ARAM_VELOCITY_TABLE,
  EXTENDED_SONG_BASENAMES,
  MINIMAL_SONG_BASENAMES,
  SPC_SLOT_BASE,
  VELOCITY_TABLE_A,
  VELOCITY_TABLE_B,
} from '../constants.ts';
import type {
  BgmFile,
  DecodedBgm,
  InstrumentDefinition,
  SampleDirEntry,
} from '../types.ts';
import { findBlockByAddr } from './bgm-parser.ts';
import { disassembleSong } from './nspc-disassembler.ts';

function blocksMatchTable(payload: Uint8Array, table: Uint8Array): boolean {
  if (payload.length !== table.length) return false;
  for (let i = 0; i < table.length; i++) {
    if (payload[i] !== table[i]) return false;
  }
  return true;
}

function readU16LE(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8);
}

function classifyLayout(bgm: BgmFile, basename?: string): DecodedBgm['layout'] {
  if (bgm.blocks.length === 5) return 'restart';
  if (basename && MINIMAL_SONG_BASENAMES.has(basename)) return 'minimal';
  if (basename && EXTENDED_SONG_BASENAMES.has(basename)) return 'extended';
  if (findBlockByAddr(bgm.blocks, ARAM_SONG_BASE_EXTENDED)) return 'extended';
  return 'standard';
}

function decodeInstrumentDefinitions(payload: Uint8Array): InstrumentDefinition[] {
  const instruments: InstrumentDefinition[] = [];
  if (payload.length % 6 !== 0) {
    throw new Error(`Instrument definition payload length ${payload.length} is not a multiple of 6`);
  }
  for (let i = 0; i < payload.length; i += 6) {
    instruments.push({
      slot: payload[i]!,
      definitionBytes: payload.slice(i + 1, i + 6),
    });
  }
  return instruments;
}

function decodeSampleDir(payload: Uint8Array): SampleDirEntry[] {
  const entries: SampleDirEntry[] = [];
  if (payload.length % 4 !== 0) {
    throw new Error(`Sample DIR payload length ${payload.length} is not a multiple of 4`);
  }
  for (let i = 0; i < payload.length; i += 4) {
    entries.push({
      start: readU16LE(payload, i),
      loop: readU16LE(payload, i + 2),
    });
  }
  return entries;
}

export function decodeBgm(bgm: BgmFile, basename?: string): DecodedBgm {
  const layout = classifyLayout(bgm, basename);
  const part0 = findBlockByAddr(bgm.blocks, ARAM_INSTRUMENT_DEF)
    ?? findBlockByAddr(bgm.blocks, ARAM_DRIVER_INIT);
  const part1 = findBlockByAddr(bgm.blocks, ARAM_VELOCITY_TABLE);

  const songBasePtr =
    layout === 'extended' || layout === 'restart'
      ? ARAM_SONG_BASE_EXTENDED
      : ARAM_SONG_BASE_STANDARD;

  const part2 = findBlockByAddr(bgm.blocks, songBasePtr);
  if (!part2) {
    throw new Error(`Missing song data block at $${songBasePtr.toString(16)}`);
  }

  const sampleDirAddr =
    layout === 'extended' || layout === 'restart'
      ? ARAM_SAMPLE_DIR_EXTENDED
      : ARAM_SAMPLE_DIR;

  const part3 = findBlockByAddr(bgm.blocks, sampleDirAddr);
  const part4 = findBlockByAddr(bgm.blocks, ARAM_SONG_BASE_PTR);
  const part5 = findBlockByAddr(bgm.blocks, ARAM_SAMPLE_END_PTR);
  const part6 = findBlockByAddr(bgm.blocks, ARAM_SPC_SLOTS);

  let instruments: InstrumentDefinition[] = [];
  let driverInitScript: Uint8Array | null = null;

  if (part0) {
    if (part0.spcRamTargetAddr === ARAM_DRIVER_INIT) {
      driverInitScript = part0.payload;
    } else {
      instruments = decodeInstrumentDefinitions(part0.payload);
    }
  }

  let velocityTable: Uint8Array = VELOCITY_TABLE_A;
  if (part1) {
    if (blocksMatchTable(part1.payload, VELOCITY_TABLE_B)) {
      velocityTable = VELOCITY_TABLE_B;
    } else if (!blocksMatchTable(part1.payload, VELOCITY_TABLE_A)) {
      velocityTable = new Uint8Array(part1.payload);
    }
  }

  const sampleDir = part3 ? decodeSampleDir(part3.payload) : [];
  const decodedSongBase = part4 ? readU16LE(part4.payload, 0) : songBasePtr;
  const sampleEndPtr = part5 ? readU16LE(part5.payload, 0) : bgm.spcRamSampleAddr;
  const spcSlots = part6
    ? Array.from(part6.payload)
    : Array.from({ length: bgm.instrumentCount }, (_, i) => SPC_SLOT_BASE + i);

  const song = disassembleSong(
    part2.payload,
    decodedSongBase,
    velocityTable,
    layout === 'minimal' ? 'minimal' : layout === 'extended' || layout === 'restart' ? 'extended' : 'standard',
  );

  return {
    layout,
    instruments,
    driverInitScript,
    velocityTable,
    song,
    sampleDir,
    songBasePtr: decodedSongBase,
    sampleEndPtr,
    spcSlots,
    sampleIds: bgm.instrumentIds,
  };
}
