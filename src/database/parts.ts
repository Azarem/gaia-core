
/**
 * Database part definition
 * Converted from GaiaLib/Database/DbPart.cs
 */
export class DbPart {
  public name: string;
  public start: number;
  public end: number;
  public type: string;
  public bank?: number;
  public order?: number;

  constructor(data: Partial<DbPart>) {
    this.name = data.name ?? '';
    this.start = data.start ?? 0;
    this.end = data.end ?? 0;
    this.type = data.type ?? '';
    this.bank = data.bank ?? undefined;
    this.order = data.order ?? undefined;

    if(!this.name) throw new Error('Name is required');
    if(!this.start) throw new Error('Start is required');
    if(!this.end) throw new Error('End is required');
    if(!this.type) throw new Error('Struct is required');
  }
}
