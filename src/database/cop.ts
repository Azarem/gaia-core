
/**
 * COP instruction definition
 * Converted from GaiaLib/Database/CopDef.cs
 */
export class CopDef {
  public id: number;
  public name: string;
  public size: number;
  public parts: string[];
  public halt: boolean;

  constructor(data: Partial<CopDef>) {
    if(!data.name) throw new Error('Name is required');
    if(typeof data.id !== 'number') throw new Error('ID is required');

    this.name = data.name;
    this.id = data.id;
    this.parts = data.parts ?? [];
    this.halt = data.halt ?? false;
    this.size = data.size ?? 0;
  }
}
