/**
 * Database structure definition
 * Converted from GaiaLib/Database/DbStruct.cs
 */
export class DbStruct {
  public name: string;
  public types?: string[];
  public parent?: string;
  public delimiter?: number;
  public discriminator?: number;
  public discriminatorLogic?: string;
  public discriminatorSize?: number;
  public null?: number;
  public tail?: number;

  constructor(data: Partial<DbStruct>) {
    this.name = data.name ?? '';
    this.types = data.types ?? undefined;
    this.parent = data.parent ?? undefined;
    this.delimiter = data.delimiter ?? undefined;
    this.discriminator = data.discriminator ?? undefined;
    this.discriminatorLogic = data.discriminatorLogic ?? undefined;
    this.discriminatorSize = data.discriminatorSize ?? undefined;
    this.null = data.null ?? undefined;
    this.tail = data.tail ?? undefined;
    
    if(!this.name) throw new Error('Name is required');
  }
} 