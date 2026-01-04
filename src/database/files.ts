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
    this.name = data.name ?? '';
    this.type = data.type ?? '';
    this.start = data.start ?? undefined;
    this.end = data.end ?? 0;
    this.compressed = data.compressed ?? undefined;
    this.upper = data.upper ?? undefined;
    this.group = data.group || undefined;
    this.scene = data.scene || undefined;

    if(!this.name) throw new Error('Name is required');
    if(!this.type) throw new Error('Type is required');
    if(this.start === undefined) throw new Error('Start is required');
    if(!this.end) throw new Error('End is required');
  }
} 

export class DbFileType {
  public name: string;
  public extension: string;
  public type: string;
  public isPatch: boolean;
  public isBlock: boolean;
  public header: number;

  constructor(data: Partial<DbFileType>) {
    this.name = data.name ?? '';
    this.extension = data.extension ?? '';
    this.type = data.type ?? '';
    this.isPatch = data.isPatch ?? false;
    this.isBlock = data.isBlock ?? false;
    this.header = data.header ?? 0;
    
    if(!this.name) throw new Error('Name is required');
    if(!this.extension) throw new Error('Extension is required');
    if(!this.type) throw new Error('Type is required');
  }
}