
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
    this.name = data.name ?? undefined;
    this.id = data.id ?? undefined;
    this.parts = data.parts ?? [];
    this.halt = data.halt ?? false;
    this.size = data.size ?? 0;

    if(!this.name) throw new Error('Name is required');
    if(this.id === undefined) throw new Error('ID is required');
  }
}
