import { BinType } from './resources';
import { AsmBlock, AsmBlockUtils } from './assembly';
import { DbFile, DbFileType } from '../database/files';
import { DbBlock } from '../database/blocks';
import { ICompressionProvider } from './compression';
import { MemoryMapMode } from './addressing';
import { ReferenceManager } from '../rom/extraction/references';

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
  base?: number;
  referenceManager?: ReferenceManager;
  isFile: boolean;

  constructor(type: DbFileType, name: string, size: number = 0, location: number = 0) {
    this.type = type;
    this.name = name;
    this.size = size;
    this.location = location;
    this.mnemonics = {};
    this.compressed = type.compressed;
    this.isFile = !type.isBlock;
  }
  
  public enrichWithRawDataFromDbFile(file: DbFile, rom: Uint8Array, compression: ICompressionProvider | undefined): void {
    this.upper = file.upper ?? this.upper;
    this.size = file.end - file.start;
    this.location = file.start;
    this.base = file.base ?? this.type.base ?? this.base;
    this.group = file.group ?? this.group;
    this.scene = file.scene ?? this.scene;
    this.compressed = file.compressed ?? this.type.compressed ?? this.compressed;
    this.isFile = true;

    let start = this.location;
    let header: Uint8Array | null = null;
    const fileType = this.type;

    if(fileType.header) {
      header = new Uint8Array(rom.slice(start, start + fileType.header));
      start += fileType.header;
    }
    let length = this.size;
    let fileData: Uint8Array;
    if (this.compressed === true && compression) {
      const expanded = compression.expand(rom, start, length);
      fileData = combineHeader(expanded, 0, expanded.length, header, fileType.type as BinType);
    } else {
      if (this.compressed !== undefined) {
        start += 2; length -= 2; // skip zero-compression header
      }
      fileData = combineHeader(rom, start, length, header, fileType.type as BinType);
    }
    
    this.rawData = fileData;
    this.size = fileData.length;
  }
  
  public enrichWithAsmBlocksFromDbBlock(block: DbBlock, memoryMode: MemoryMapMode): void {
    // Create assembly ChunkFile
    //const chunkFile = new ChunkFile(fileType, undefined, block.name);
    //chunkFile.id = block.id;
    this.group = block.group;
    this.scene = block.scene;
    this.base = block.base;
    this.isFile = false;
    
    // Enrich with AsmBlock parts
    this.parts = [];
    this.size = 0;
    if(!block.parts?.length) {
      throw new Error(`Block ${block.name} has no parts`);
    }
    this.location = block.parts[0].start;
    this.bank = block.movable ? undefined : (memoryMode === MemoryMapMode.Lo ? this.location >> 15 : this.location >> 16);
    this.transforms = block.transforms;
    this.postProcess = block.postProcess;
    
    for (const part of block.parts) {
      const asmBlock = new AsmBlock(
        part.start,
        part.end - part.start,
        false, // isString will be determined during processing
        part.name,
        part.type || undefined,
        part.bank
      );
      this.size += asmBlock.size;
      this.parts.push(asmBlock);
    }
  }

}



export function combineHeader(
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
    let size = 0;
    if (chunkFile.rawData) {
      size = chunkFile.rawData.length;
      if (chunkFile.type.header === -2 || chunkFile.compressed === false) size += 2;
    } else if(chunkFile.parts) {
      for (let x = 0; x < chunkFile.parts.length; x++) {
        const block = chunkFile.parts[x];
        if (x > 0 && !block.label) break;
        size += block.size || 0;
      }
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
      if (otherBlock !== block && !otherBlock.type.struct) {
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