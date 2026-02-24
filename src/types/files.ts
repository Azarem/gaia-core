import { BinType } from './resources';
import { AsmBlock, AsmBlockUtils } from './assembly';
import { DbFile, DbFileType } from '../database/files';
import { DbBlock } from '../database/blocks';
import { ICompressionProvider } from './compression';
import { MemoryMapMode } from './addressing';

/**
 * Types that should have a compression header by default but should not be compressed
 */
const UNCOMPRESSED_TYPES = ['Bitmap', 'Tilemap', 'Tileset', 'Spritemap', 'Meta17'] as const;

/**
 * Type guard to check if a type is an uncompressed type
 * Works with both BinType enum values and string values
 */
function isUncompressedType(type: BinType | string): boolean {
  // Since BinType is a string enum, we can directly check the value
  return UNCOMPRESSED_TYPES.includes(type as any);
}

/**
 * Chunk file for ROM processing
 * Converted from GaiaLib/Types/ChunkFile.cs
 */
export class ChunkFile {
  //id?: string;
  name: string;
  size: number;
  location: number;
  type: DbFileType;
  parts?: AsmBlock[];
  includes?: Set<string>;
  includeLookup?: Map<string, AsmBlock>;
  bank?: number;
  compressed?: boolean;
  upper?: boolean;
  rawData?: Uint8Array | null;
  textData?: string;
  transforms?: { key: string; value: string }[];
  postProcess?: string;
  mnemonics: Record<number, string>;
  group?: string;
  scene?: string;

  constructor(name: string, size: number, location: number, type: DbFileType) {
    this.name = name;
    this.size = size;
    this.location = location;
    this.mnemonics = {};
    this.compressed = isUncompressedType(type.type) ? false : undefined;
    this.type = type;
  }

  // public getExtension() : string {
  //   switch(this.type) {
  //     case BinType.Assembly:
  //     case BinType.Patch:
  //       return 'asm';
  //     case BinType.Music:
  //       return 'bgm';
  //     case BinType.Sound:
  //       return 'sfx';
  //     case BinType.Bitmap:
  //       return 'bin';
  //     case BinType.Tilemap:
  //       return 'map';
  //     case BinType.Tileset:
  //       return 'set';
  //     case BinType.Spritemap:
  //       return 'spm';
  //     case BinType.Palette:
  //       return 'pal';
  //     case BinType.Meta17:
  //       return 'dmp';
  //   }
  // }
}

// /**
//  * Creates a new ChunkFile
//  */
// export function createChunkFile(name: string, size: number, location: number, type: BinType): ChunkFile {
//   return {
//     name,
//     size,
//     location,
//     type,
//     mnemonics: {}
//   };
// }

export function createChunkFileFromDbFile(rom: Uint8Array, compression: ICompressionProvider, dbFile: DbFile, fileType: DbFileType): ChunkFile {
  // Create ChunkFile with the DbFile's type
  const chunkFile = new ChunkFile(dbFile.name, dbFile.end - dbFile.start, dbFile.start, fileType);
  //chunkFile.id = dbFile.id;
  chunkFile.compressed = dbFile.compressed;
  chunkFile.upper = dbFile.upper;
  chunkFile.group = dbFile.group;
  chunkFile.scene = dbFile.scene;

  
  // Enrich with raw binary data
  enrichWithRawDataFromDbFile(rom, chunkFile, compression, dbFile, fileType);

  return chunkFile;
}

export function createChunkFileFromDbBlock(block: DbBlock, fileType: DbFileType, memoryMode: MemoryMapMode): ChunkFile {
  // Create assembly ChunkFile
  const chunkFile = new ChunkFile(block.name, 0, 0, fileType);
  //chunkFile.id = block.id;
  chunkFile.group = block.group;
  chunkFile.scene = block.scene;
  
  // Enrich with AsmBlock parts
  enrichWithPartsFromDbBlock(chunkFile, block, memoryMode);
  
  return chunkFile;
}


function combineHeader(
  data: Uint8Array,
  position: number,
  length: number,
  header: Uint8Array | null,
  type: BinType
): Uint8Array {
  let totalLength = length + (header ? header.length : 0);
  if (type === BinType.Palette && length < 0x200) {
    totalLength += (0x200 - length);
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  if (header) { result.set(header, offset); offset += header.length; }
  result.set(data.slice(position, position + length), offset);
  offset += length;
  if (type === BinType.Palette && length < 0x200) {
    result.fill(0, offset, offset + (0x200 - length));
  }
  return result;
}

/**
 * Enriches ChunkFile with raw binary data from DbFile
 */
function enrichWithRawDataFromDbFile(rom: Uint8Array, chunkFile: ChunkFile, compression: ICompressionProvider, dbFile: DbFile, fileType: DbFileType): void {
  
  // Extract raw data (uncompressed) with headers for specific types
  let start = dbFile.start;
  let header: Uint8Array | null = null;
  if(fileType.header) {
    header = new Uint8Array(rom.slice(start, start + fileType.header));
    start += fileType.header;
  }
  let length = dbFile.end - start;
  let fileData: Uint8Array;
  if (dbFile.compressed === true) {
    const expanded = compression.expand(rom, start, length);
    fileData = combineHeader(expanded, 0, expanded.length, header, fileType.type as BinType);
  } else {
    if (dbFile.compressed !== undefined) {
      start += 2; length -= 2; // skip zero-compression header
    }
    fileData = combineHeader(rom, start, length, header, fileType.type as BinType);
  }
  
  //const hasSizePrefix = chunkFile.compressed !== undefined || dbFile.type === BinType.Sound;

  // Binary files get rawData
  chunkFile.rawData = fileData;
  chunkFile.size = fileData.length;// + (hasSizePrefix ? 2 : 0);

}

/**
 * Enriches ChunkFile with AsmBlock parts from DbBlock
 */
function enrichWithPartsFromDbBlock(chunkFile: ChunkFile, block: DbBlock, memoryMode: MemoryMapMode): void {
  chunkFile.parts = [];
  chunkFile.size = 0;
  if(!block.parts?.length) {
    throw new Error(`Block ${block.name} has no parts`);
  }
  chunkFile.location = block.parts[0].start;
  chunkFile.bank = block.movable ? undefined : (memoryMode === MemoryMapMode.Lo ? chunkFile.location >> 15 : chunkFile.location >> 16);
  chunkFile.transforms = block.transforms;
  chunkFile.postProcess = block.postProcess;
  
  for (const part of block.parts) {
    const asmBlock = new AsmBlock(
      part.start,
      part.end - part.start,
      false, // isString will be determined during processing
      part.name,
      part.type || undefined,
      part.bank
    );
    chunkFile.size += asmBlock.size;
    chunkFile.parts.push(asmBlock);
  }
}

/**
 * Chunk file utilities
 */
export class ChunkFileUtils {
  /**
   * Rebase blocks to a new location
   */
  static rebase(chunkFile: ChunkFile, newLocation?: number): void {
    if (newLocation !== undefined) {
      chunkFile.location = newLocation;
    }

    if (!chunkFile.parts) {
      return;
    }

    let loc = chunkFile.location;
    for (let x = 0; x < chunkFile.parts.length; x++) {
      const block = chunkFile.parts[x];
      if (x > 0 && !block.label) {
        break;
      }
      block.location = loc;
      loc += block.size || 0;
    }
  }

  /**
   * Calculate the total size of all blocks
   */
  static calculateSize(chunkFile: ChunkFile): number {
    if (!chunkFile.parts) {
      let size = chunkFile.rawData?.length ?? chunkFile.size;
      if (chunkFile.type.header === -2 || chunkFile.compressed === false){
        size += 2;
        chunkFile.size = size;
      }
      return size;
    }

    let size = 0;
    for (let x = 0; x < chunkFile.parts.length; x++) {
      const block = chunkFile.parts[x];
      if (x > 0 && !block.label) {
        break;
      }
      size += block.size || 0;
    }
    
    chunkFile.size = size;
    return size;
  }

    /**
   * Check if a location is outside this block and return the part (matches C# IsOutside)
   * Returns [isOutside, part] where part is the part containing the location
   */
  static isOutsideWithPart(root: ChunkFile[], block: ChunkFile, location: number): [boolean, ChunkFile | null, AsmBlock | null] {
    const [isInside, part] = this.isInsideWithPart(block, location);
    if (isInside) {
      return [false, block, part];
    }

    // Find chunk this reference belongs to
    for (const otherBlock of root) {
      if (otherBlock !== block) {
        const [otherIsInside, otherPart] = this.isInsideWithPart(otherBlock, location);
        if (otherIsInside) {
          return [true, otherBlock, otherPart];
        }
      }
    }

    return [true, null, null];
  }

  /**
   * Check if a location is inside this block and return the part (matches C# IsInside)
   * Returns [isInside, part] where part is the part containing the location
   */
  static isInsideWithPart(block: ChunkFile, location: number): [boolean, AsmBlock | null] {
    for (const part of block?.parts || []) {
      if (AsmBlockUtils.isInside(part, location)) {
        return [true, part];
      }
    }
    return [false, null];
  }

  /**
   * Check if a location is outside this block (shorthand version)
   */
  static isOutside(block: ChunkFile, location: number): boolean {
    return !this.isInside(block, location);
  }

  /**
   * Check if a location is inside this block (shorthand version)
   */
  static isInside(block: ChunkFile, location: number): boolean {
    for (const part of block?.parts || []) {
      if (AsmBlockUtils.isInside(part, location)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all included blocks
   */
  static getIncludes(chunkFile: ChunkFile): ChunkFile[] {
    if(!chunkFile.parts) return [];
    const includes: ChunkFile[] = [];
    const seen = new Set<ChunkFile>();

    for (const part of chunkFile.parts) {
      if (part?.includes) {
        for (const includedPart of part.includes) {
          if (!seen.has(includedPart.block)) {
            includes.push(includedPart.block);
            seen.add(includedPart.block);
          }
        }
      }
    }

    return includes;
  }
} 