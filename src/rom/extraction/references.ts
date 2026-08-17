import { AddressType, Address } from '../../types';
import { BlockReaderConstants } from '../../types/constants';
import type { DbRoot } from '../../database';
import { ChunkFileUtils } from '../../types/files';
import type { ChunkFile } from '../../types/files';

/**
 * Manages references, chunks, and markers during ROM analysis
 * Converted from GaiaLib/Rom/Extraction/ReferenceManager.cs
 */
export class ReferenceManager {
  public readonly structTable = new Map<number, string>();
  public readonly markerTable = new Map<number, number>();
  public readonly nameTable = new Map<number, string>();
  public readonly fileTable = new Map<number, string>();
  private readonly root: DbRoot;

  constructor(root: DbRoot) {
    if (!root) {
      throw new Error('root cannot be null');
    }
    this.root = root;
  }

  // Struct management
  public tryGetStruct(location: number): { found: boolean; chunkType?: string, isSoft?: boolean } {
    let chunkType = this.structTable.get(location);
    const found = chunkType !== undefined;
    let isSoft : boolean | undefined;
    if(chunkType) {
      if(chunkType[0] === '~') {
        isSoft = true;
        chunkType = chunkType.substring(1);
      }
      else isSoft = false;
    }
    return { found, chunkType, isSoft };
  }

  public tryAddStruct(location: number, chunkType: string): boolean {
    const existingStruct = this.tryGetStruct(location);
    const isSoft = chunkType[0] === '~';
    if (existingStruct.isSoft === false || (existingStruct.found && isSoft)) {
      return false;
    }

    this.structTable.set(location, chunkType);
    return true;
  }

  public containsStruct(location: number): boolean {
    return this.structTable.has(location);
  }

  // Name management
  public tryGetName(location: number): { found: boolean; referenceName?: string; isSoft?: boolean } {
    let referenceName = this.nameTable.get(location);
    const found = referenceName !== undefined;
    let isSoft : boolean | undefined;
    if(referenceName) {
      if(referenceName[0] === '~') {
        isSoft = true;
        referenceName = referenceName.substring(1);
      }
      else isSoft = false;
    }
    return { found, referenceName, isSoft };
  }

  public tryAddName(location: number, referenceName: string): boolean {
    const existingName = this.tryGetName(location);
    const isSoft = referenceName[0] === '~';
    if (existingName.isSoft === false || (existingName.found && isSoft)) {
      return false;
    }
    this.nameTable.set(location, referenceName);
    return true;
  }

  // Marker management
  public tryGetMarker(location: number): { found: boolean; offset?: number } {
    const offset = this.markerTable.get(location);
    return { found: offset !== undefined, offset };
  }

  public setMarker(location: number, offset: number): void {
    this.markerTable.set(location, offset);
  }

  // Label creation
  public createBranchLabel(location: number): string {
    // const adrs = Address.fromInt(location, this.root.config.memoryMode);
    // const name = `loc_${adrs.toString()}`;
    const name = `loc_${location.toString(16).toUpperCase().padStart(6, '0')}`;
    this.nameTable.set(location, name);
    return name;
  }

  public createTypeName(type: string, location: number): string {
    let name = type.toLowerCase();
    const isSoft = type[0] === '~';
    if(isSoft) name = name.substring(1);

    if (name === "branch") name = 'loc';
    
    // Handle pointer characters
    while (name.length > 0 && BlockReaderConstants.POINTER_CHARACTERS.includes(name[0])) {
      name = name.substring(1) + '_list';
    }

    //const adrs = Address.fromInt(location, this.root.config.memoryMode);
    //return `${name}_${adrs.toString()}`;
    return `${name}_${location.toString(16).toUpperCase().padStart(6, '0')}`;
  }

  public createFallbackName(location: number): string {
    const fileMatch = this.root.files.find(x =>
      x.start <= location && x.end > location
    );

    if (fileMatch) {
      const offset = location - fileMatch.start;
      return fileMatch.name + (offset !== 0 ? `+${offset.toString(16).toUpperCase()}` : '');
    }

    // const adrs = Address.fromInt(location, this.root.config.memoryMode);
    // return adrs.toString(); 
    return location.toString(16).toUpperCase().padStart(6, '0');
  }

  /**
   * Finds a reference location by its assigned name.
   */
  public findLocationByName(name: string): number | undefined {
    for (const [loc, refName] of this.nameTable) {
      if (refName === name) {
        return loc;
      }
    }
    return undefined;
  }

  public resolveName(location: number, type: AddressType, isBranch: boolean, block?: ChunkFile): string {
    const prefix = Address.codeFromType(type);
    let name: string | undefined;
    let label: string | undefined;

    // Handle rewrites first
    const rewrite = !block?.compressed ? this.root.rewrites[location] : undefined;
    if (rewrite !== undefined) {
      name = this.tryGetName(rewrite).referenceName;
      if (!name) throw new Error('Rewrite reference not found');
      label = this.processClosestMatch(location, rewrite);
    }

    //name = ChunkFileUtils.isOutside(block, resolvedLocation) && this.fileTable.get(resolvedLocation) || null;
    // if(block) {
    //   name = this.fileTable.get(block.location);
    //   if(name && block.includes?.has(name)) name = undefined;
    // }

    // Try to get existing reference
    if (!name) name = this.tryGetName(location).referenceName;

    if (!name) {
      if (isBranch) name = this.createBranchLabel(location);
      else {
        const closestReference = this.findClosestReference(location);
        if (closestReference) { name = closestReference.name; label = closestReference.label; }
        else name = this.createFallbackName(location);
      }
    }
    
    return `${prefix || ''}${name}${label || ''}`;
  }

  public findClosestReference(location: number): { name: string; label: string } | undefined {
    let closestDistance = BlockReaderConstants.REF_SEARCH_MAX_RANGE;
    let name: string | undefined;
    let closestLocation: number | undefined;

    for (const [entryKey, entryValue] of this.nameTable) {
      if (entryKey > location) continue;

      const distance = location - entryKey;
      if (distance >= closestDistance) continue;

      closestDistance = distance;
      name = entryValue;
      closestLocation = entryKey;

      if (closestDistance === 1) break;
    }

    return name ? { name, label: this.processClosestMatch(location, closestLocation!) } : undefined;
  }

  // private processRewrite(location: number, rewrite: number): { location: number; label?: string } {
  //   const offset = location - rewrite;
  //   const cmd = offset < 0 ? '-' : '+';
  //   const absOffset = Math.abs(offset);

  //   let label: string | undefined;
  //   const structType = this.tryGetStruct(rewrite);
  //   const isString = structType.found && this.root.stringTypes[structType.chunkType!];
    
  //   if (isString) {
  //     this.markerTable.set(rewrite, absOffset);
  //     this.markerTable.set(location, absOffset);
  //     label = cmd === '-' ? BlockReaderConstants.NEGATIVE_MARKER_FORMAT : BlockReaderConstants.MARKER_FORMAT;
  //   } else {
  //     const formatString = cmd === '-' ? BlockReaderConstants.NEGATIVE_OFFSET_FORMAT : BlockReaderConstants.OFFSET_FORMAT;
  //     label = formatString.replace('{0:X}', absOffset.toString(16).toUpperCase());
  //   }

  //   return { location: rewrite, label };
  // }

  public processClosestMatch( location: number, closestLocation: number ) : string {
    const offset = location - closestLocation;
    if(!offset) return '';

    let structType = this.tryGetStruct(closestLocation);

    if(!structType.found) {
      let structDistance = BlockReaderConstants.REF_SEARCH_MAX_RANGE;
      let structName: string | undefined;
      let structLocation: number | undefined;

      for (const [entryKey, entryValue] of this.structTable) {
        if (entryKey > closestLocation) continue;

        const distance = closestLocation - entryKey;
        if (distance >= structDistance) continue;

        structDistance = distance;
        structName = entryValue;
        structLocation = entryKey;

        if (structDistance === 1) break;
      }

      if (structName) structType = { found: true, chunkType: structName, isSoft: false };
    }

    const isString = structType.found && this.root.stringTypes[structType.chunkType!];

    if (isString) {
      if(offset < 0) throw new Error('String offset is negative, unable to mark');
      this.markerTable.set(closestLocation, offset);
      this.markerTable.set(location, offset);
      return BlockReaderConstants.MARKER_FORMAT;
    } else {
      return `${offset < 0 ? '-' : '+'}${Math.abs(offset).toString(16).toUpperCase()}`;
    }
  }
} 