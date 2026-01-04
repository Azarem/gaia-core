import type { DbStringType } from '../database/strings';
import { AsmBlock } from './assembly';

/**
 * String marker for positioning
 * Converted from GaiaLib/Types/StringMarker.cs
 */
export interface StringMarker {
  offset: number;
}

/**
 * String wrapper with type and location information
 * Converted from GaiaLib/Types/StringWrapper.cs
 */
export interface StringWrapper {
  string: string;
  type: DbStringType;
  marker: number;
  location: number;
}

/**
 * String entry (commented out in original C# code)
 * Converted from GaiaLib/Types/StringEntry.cs
 */
export interface StringEntry {
  block: AsmBlock;
  index: number;
  size: number;
  data: Uint8Array;
}

/**
 * String size comparer utility
 * Converted from GaiaLib/Types/StringSizeComparer.cs
 */
export class StringSizeComparer {
  /**
   * Compare two strings by length
   */
  static compare(a: string, b: string): number {
    if (a.length < b.length) return -1;
    if (a.length > b.length) return 1;
    return a.localeCompare(b);
  }
  
  /**
   * Compare two StringWrapper objects by string length
   */
  static compareWrappers(a: StringWrapper, b: StringWrapper): number {
    return this.compare(a.string, b.string);
  }
} 