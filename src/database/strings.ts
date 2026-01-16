import { MemberType } from '../types/members';

/**
 * Database string command definition
 * Converted from GaiaLib/Database/DbStringCommand.cs
 */
export class DbStringCommand {
  public id: number;
  public name: string;
  public types: MemberType[];
  public delimiter?: number;
  public halt: boolean;

  constructor(data: Partial<DbStringCommand>) {
    this.id = data.id ?? undefined;
    this.name = data.name ?? '';
    this.types = data.types ?? [];
    this.delimiter = data.delimiter ?? undefined;
    this.halt = data.halt ?? false;

    if(!this.id && this.id !== 0) throw new Error('Id is required');
    if(!this.name) throw new Error('Name is required');
  }
}

/**
 * Database string layer definition
 * Converted from GaiaLib/Database/DbStringLayer.cs
 */
export interface DbStringLayer {
  base: number;
  map: string[];
}

export class DbStringDictionary {
  public base: number;
  public range: number;
  public command: number;
  public name: string;
  public suffix: string;
  public entries: string[];

  constructor(data: Partial<DbStringDictionary>) {
    this.base = data.base ?? undefined;
    this.range = data.range ?? 0;
    this.command = data.command ?? undefined;
    this.name = data.name ?? '';
    this.entries = data.entries ?? undefined;
    this.suffix = data.suffix ?? '';

    if(this.base === undefined && this.command === undefined) throw new Error('Base or command is required');
    if(!this.name) throw new Error('Name is required');
    if(!this.entries) throw new Error('Entries is required');

    if(this.base !== undefined) this.range = this.base + this.entries.length;
  }
}

/**
 * Database string type definition
 * Converted from GaiaLib/Database/DbStringType.cs
 */
export class DbStringType {
  public name: string;
  public delimiter: string;
  public terminator: number;
  public shiftType?: string;
  public characterMap: string[];
  public commands: Record<string, DbStringCommand>;
  public commandLookup: Record<number, DbStringCommand>;
  public layers: DbStringLayer[];
  public greedyTerminator: boolean;
  public dictionaries: Record<string, DbStringDictionary>;

  constructor(data: Partial<DbStringType>) {
    this.name = data.name ?? '';
    this.delimiter = data.delimiter ?? '';
    this.terminator = data.terminator ?? 0;
    this.shiftType = data.shiftType ?? undefined;
    this.characterMap = data.characterMap;
    this.commands = data.commands ?? {};
    this.layers = data.layers ?? [];
    this.greedyTerminator = data.greedyTerminator ?? false;
    this.dictionaries = data.dictionaries ?? {};
    this.commandLookup = Object.values(this.commands).reduce((acc, x) => {
      acc[x.id] = x;
      return acc;
    }, {} as Record<number, DbStringCommand>);

    if(!this.name) throw new Error('Name is required');
    if(!this.delimiter) throw new Error('Delimiter is required');
    if(!this.terminator && this.terminator !== 0) throw new Error('Terminator is required');
    if(!this.characterMap) throw new Error('Character map is required');
  }
}

/**
 * String type utilities
 */
export class DbStringTypeUtils {
  // Shift functions (simplified versions of C# implementation)
  private static readonly shiftDownFunctions: Record<string, (x: number) => number> = {
    '': (x) => x,
    'h2': (x) => (((x & 0xE0) >> 1) | (x & 0x0F)),
    'wh2': (x) => (((x & 0x70) >> 1) | (x & 0x07))
  };

  private static readonly shiftUpFunctions: Record<string, (x: number) => number> = {
    '': (x) => x,
    'h2': (x) => (((x & 0x70) << 1) | (x & 0x0F)),
    'wh2': (x) => (((x & 0x38) << 1) | (x & 0x07))
  };

  public static getShiftDown(shiftType?: string): (x: number) => number {
    return this.shiftDownFunctions[shiftType || ''] || this.shiftDownFunctions[''];
  }

  public static getShiftUp(shiftType?: string): (x: number) => number {
    return this.shiftUpFunctions[shiftType || ''] || this.shiftUpFunctions[''];
  }
} 