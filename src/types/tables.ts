
export class TableEntry {
  location: number;
  object: unknown;

  constructor(location: number) {
    if(typeof location !== 'number') throw new Error('Location is required');
    this.location = location;
  }
}
