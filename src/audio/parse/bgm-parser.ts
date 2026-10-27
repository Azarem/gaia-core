import type { BgmBlock, BgmFile } from '../types';

export class BgmParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BgmParseError';
  }
}

function readU16LE(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8);
}

export function parseBgm(data: Uint8Array): BgmFile {
  const blocks: BgmBlock[] = [];
  let offset = 0;

  while (offset + 4 <= data.length) {
    const payloadSize = readU16LE(data, offset);
    const spcRamTargetAddr = readU16LE(data, offset + 2);
    offset += 4;

    if (offset + payloadSize > data.length) {
      throw new BgmParseError(
        `Block payload overruns file at offset ${offset - 4}: size=${payloadSize}`,
      );
    }

    const payload = data.slice(offset, offset + payloadSize);
    offset += payloadSize;

    blocks.push({ payloadSize, spcRamTargetAddr, payload });

    if (payloadSize === 0) {
      break;
    }
  }

  if (blocks.length === 0 || blocks[blocks.length - 1]!.payloadSize !== 0) {
    throw new BgmParseError('Missing terminator block (PayloadSize == 0)');
  }

  if (offset >= data.length) {
    throw new BgmParseError('Missing instrument trailer after terminator');
  }

  const instrumentCount = data[offset]!;
  offset += 1;

  if (offset + instrumentCount > data.length) {
    throw new BgmParseError('Instrument trailer overruns file');
  }

  const instrumentIds = Array.from(data.slice(offset, offset + instrumentCount));
  offset += instrumentCount;

  const expectedSize = offset;
  if (expectedSize !== data.length) {
    throw new BgmParseError(
      `File size mismatch: expected ${expectedSize} bytes, got ${data.length}`,
    );
  }

  const spcRamSampleAddr = blocks[blocks.length - 1]!.spcRamTargetAddr;

  return { blocks, instrumentCount, instrumentIds, spcRamSampleAddr };
}

export function findBlockByAddr(blocks: BgmBlock[], addr: number): BgmBlock | undefined {
  return blocks.find((b) => b.spcRamTargetAddr === addr);
}
