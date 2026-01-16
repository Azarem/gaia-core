import { AddressType, Address } from '../../types';
import { BlockReaderConstants } from '../../types/constants';
import type { DbRoot } from '../../database';

/**
 * Manages references, chunks, and markers during ROM analysis
 * Converted from GaiaLib/Rom/Extraction/ReferenceManager.cs
 */
export class ReferenceManager {
  public readonly structTable = new Map<number, string>();
  public readonly markerTable = new Map<number, number>();
  public readonly nameTable = new Map<number, string>();
  private readonly root: DbRoot;

  constructor(root: DbRoot) {
    if (!root) {
      throw new Error('root cannot be null');
    }
    this.root = root;
  }

  // Struct management
  public tryGetStruct(location: number): { found: boolean; chunkType?: string } {
    const chunkType = this.structTable.get(location);
    return { found: chunkType !== undefined, chunkType };
  }

  public tryAddStruct(location: number, chunkType: string): boolean {
    if (this.structTable.has(location)) {
      return false;
    }
    this.structTable.set(location, chunkType);
    return true;
  }

  public containsStruct(location: number): boolean {
    return this.structTable.has(location);
  }

  // Name management
  public tryGetName(location: number): { found: boolean; referenceName?: string } {
    const referenceName = this.nameTable.get(location);
    return { found: referenceName !== undefined, referenceName };
  }

  public tryAddName(location: number, referenceName: string): boolean {
    if (this.nameTable.has(location)) {
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

  public resolveName(location: number, type: AddressType, isBranch: boolean): string {
    const prefix = Address.codeFromType(type);
    let name: string;
    let label: string | null = null;
    let resolvedLocation = location;

    // Handle rewrites first
    const rewrite = this.root.rewrites[location];
    if (rewrite !== undefined) {
      const result = this.processRewrite(location, rewrite);
      resolvedLocation = result.location;
      label = result.label;
    }

    // Try to get existing reference
    const existingName = this.nameTable.get(resolvedLocation);
    if (existingName) {
      name = existingName;
    } else {
      name = isBranch ? 
        this.createBranchLabel(resolvedLocation) : 
        this.findClosestReference(resolvedLocation) || this.createFallbackName(resolvedLocation);
    }

    return `${prefix || ''}${name}${label || ''}`;
  }

  public findClosestReference(location: number): string | null {
    let closestDistance = BlockReaderConstants.REF_SEARCH_MAX_RANGE;
    let closestName: string | null = null;
    let closestLocation: number | null = null;

    for (const [entryKey, entryValue] of this.nameTable) {
      if (entryKey > location) {
        continue;
      }

      const distance = location - entryKey;
      if (distance >= closestDistance) {
        continue;
      }

      closestDistance = distance;
      closestName = entryValue;
      closestLocation = entryKey;

      if (closestDistance === 1) {
        break;
      }
    }

    return this.processClosestMatch(location, closestName, closestLocation, closestDistance);
  }

  private processRewrite(location: number, rewrite: number): { location: number; label: string | null } {
    const offset = location - rewrite;
    const cmd = offset < 0 ? '-' : '+';
    const absOffset = Math.abs(offset);

    let label: string | null = null;
    const structType = this.structTable.get(rewrite);
    
    if (structType === BlockReaderConstants.WIDE_STRING_TYPE) {
      this.markerTable.set(rewrite, absOffset);
      this.markerTable.set(location, absOffset);
      label = cmd === '-' ? BlockReaderConstants.NEGATIVE_MARKER_FORMAT : BlockReaderConstants.MARKER_FORMAT;
    } else {
      const formatString = cmd === '-' ? BlockReaderConstants.NEGATIVE_OFFSET_FORMAT : BlockReaderConstants.OFFSET_FORMAT;
      label = formatString.replace('{0:X}', absOffset.toString(16).toUpperCase());
    }

    return { location: rewrite, label };
  }

  private processClosestMatch(
    location: number, 
    closestName: string | null, 
    closestLocation: number | null, 
    closestDistance: number
  ): string | null {
    if (!closestName || closestLocation === null) {
      return null;
    }

    let result = closestName;
    const structType = this.structTable.get(closestLocation);

    if (structType === BlockReaderConstants.WIDE_STRING_TYPE) {
      this.markerTable.set(closestLocation, closestDistance);
      this.markerTable.set(location, closestDistance);
      result += BlockReaderConstants.MARKER_FORMAT;
    } else {
      result += `+${closestDistance.toString(16).toUpperCase()}`;
    }

    return result;
  }
} 