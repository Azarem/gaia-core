import { MemberType } from '../types/members';

/**
 * Database string command definition
 * Converted from GaiaLib/Database/DbStringCommand.cs
 */
export class DbStringCommand {
  public id: number;
  public name: string;
  public types: string[];
  public delimiter?: number;
  public halt: boolean;
  public dictionary?: DbStringDictionary;

  constructor(data: Partial<DbStringCommand>) {
    if(typeof data.id !== 'number') throw new Error('Id is required');
    if(!data.name) throw new Error('Name is required');

    this.id = data.id;
    this.name = data.name;
    this.types = data.types ?? [];
    this.delimiter = data.delimiter ?? undefined;
    this.halt = data.halt ?? false;
    this.dictionary = data.dictionary ?? undefined;
  }
}

/**
 * Database string layer definition
 * Converted from GaiaLib/Database/DbStringLayer.cs
 */
export interface DbStringLayer {
  base?: number;
  range?: number;
  on?: number;
  shiftBit?: number;
  map: string[];
}

export class DbStringDictionary {
  //public base?: number;
  //public range: number;
  public command?: number;
  public commandName?: string;
  public name: string;
  //public suffix: string;
  public entries: string[];

  constructor(data: Partial<DbStringDictionary>) {
    if(typeof data.command !== 'number') throw new Error('Command is required');
    if(!data.name) throw new Error('Name is required');
    if(!data.entries || data.entries.length === 0) throw new Error('Entries is required');

    //this.base = data.base ?? undefined;
    //this.range = data.range ?? 0;
    this.command = data.command ?? undefined;
    this.commandName = data.commandName ?? undefined;
    this.name = data.name;
    this.entries = data.entries;
    //this.suffix = data.suffix ?? '';

    //if(this.base !== undefined) this.range = this.base + this.entries.length;
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
  public commands: Record<string, DbStringCommand>;
  public commandLookup: Record<number, DbStringCommand>;
  public layers: DbStringLayer[];
  public greedyTerminator: boolean;
  public dictionaries: Record<string, DbStringDictionary>;
  public dictionaryLookup: { text: string, id: number }[];

  constructor(data: Partial<DbStringType>) {
    if(!data.name) throw new Error('Name is required');
    if(!data.delimiter) throw new Error('Delimiter is required');
    if(typeof data.terminator !== 'number') throw new Error('Terminator is required');
    if(!data.layers || !data.layers.length) throw new Error('Layers are required');

    this.name = data.name;
    this.delimiter = data.delimiter;
    this.terminator = data.terminator;
    this.commands = data.commands ?? {};
    this.layers = data.layers;
    this.greedyTerminator = data.greedyTerminator ?? false;
    this.dictionaries = data.dictionaries ?? {};
    this.commandLookup = Object.values(this.commands).reduce((acc, x) => {
      acc[x.id] = x;
      return acc;
    }, {} as Record<number, DbStringCommand>);
    this.dictionaryLookup = Object.values(this.dictionaries)
      .flatMap((y) => y.entries.map((z, ix) => ({ text: z, id: ((y.command ?? 0) << 8) | ix })))
      //.map((y, z) => ({ text: y.entries[z], id: (y.command << 8) | (y.base + z) }))
      .sort((a, b) => b.text.length - a.text.length);
  }
}
