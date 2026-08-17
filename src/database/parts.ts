
/**
 * Database part definition
 * Converted from GaiaLib/Database/DbPart.cs
 */
export class DbPart {
  public name: string;
  public start: number;
  public end: number;
  public type: string;
  //public bank?: number;
  public order?: number;

  constructor(data: Partial<DbPart>) {
    if(typeof data.start !== 'number') throw new Error('Start is required');
    if(!data.name) throw new Error('Name is required');
    if(!data.end) throw new Error('End is required');
    if(!data.type) throw new Error('Struct is required');

    this.name = data.name;
    this.start = data.start;
    this.end = data.end;
    this.type = data.type;
    //this.bank = data.bank ?? undefined;
    this.order = data.order ?? undefined;
  }
}
