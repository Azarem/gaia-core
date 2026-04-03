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

  constructor(data: Partial<DbFileType>) {
    this.name = data.name ?? '';
    this.extension = data.extension ?? '';
    this.type = data.type ?? '';
    this.isPatch = data.isPatch ?? false;
    this.isBlock = data.isBlock ?? false;
    this.header = data.header ?? 0;
    this.compressed = data.compressed ?? undefined;
    
    if(!this.name) throw new Error('Name is required');
    if(!this.extension) throw new Error('Extension is required');
    if(!this.type) throw new Error('Type is required');
  }
}