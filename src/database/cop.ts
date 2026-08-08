
/**
 * COP instruction definition
 * Converted from GaiaLib/Database/CopDef.cs
 */
export class CopDef {
  public id: number;
  public name: string;
  public parts: string[];
  public halt: boolean;
  public conditions?: CopCondition[];

  constructor(data: Partial<CopDef>) {
    if(!data.name) throw new Error('Name is required');
    if(typeof data.id !== 'number') throw new Error('ID is required');

    this.name = data.name;
    this.id = data.id;
    this.parts = data.parts ?? [];
    this.halt = data.halt ?? false;
    this.conditions = data.conditions ?? [];
  }
}

export interface CopCondition {
  offset: number;
  value: number;
  parts: string[];
  logic?: string;
}