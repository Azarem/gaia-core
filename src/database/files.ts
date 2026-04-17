import { BinType } from '../types/resources';

export class DbFile {
  //public id?: string;
  public name: string;
  public type: string;
  public start: number;
  public end: number;
  public compressed?: boolean;
  public upper?: boolean;
  public group?: string;
  public scene?: string;
  public base?: number;

  constructor(data: Partial<DbFile>) {
    if(!data.name) throw new Error('Name is required');
    if(!data.type) throw new Error('Type is required');
    if(typeof data.start !== 'number') throw new Error('Start is required');
    if(typeof data.end !== 'number') throw new Error('End is required');

    this.name = data.name;
    this.type = data.type;
    this.start = data.start;
    this.end = data.end;
    this.compressed = data.compressed ?? undefined;
    this.upper = data.upper ?? undefined;
    this.group = data.group || undefined;
    this.scene = data.scene || undefined;
    this.base = data.base ?? undefined;
  }
} 

export class DbFileType {
  public name: string;
  public extension: string;
  public type: string;
  public isPatch: boolean;
  public isBlock: boolean;
  public header: number;
  public compressed?: boolean;
  public struct?: string;
  public base?: number;

  constructor(data: Partial<DbFileType>) {
    if(!data.name) throw new Error('Name is required');
    if(!data.extension) throw new Error('Extension is required');
    if(!data.type) throw new Error('Type is required');

    this.name = data.name;
    this.extension = data.extension;
    this.type = data.type;
    this.isPatch = data.isPatch ?? false;
    this.isBlock = data.isBlock ?? false;
    this.header = data.header ?? 0;
    this.compressed = data.compressed ?? undefined;
    this.struct = data.struct ?? undefined;
    this.base = data.base ?? undefined;
  }
}