
export class TableEntry {
  location: number;
  object: unknown;
  name?: string;

  constructor(location: number, object?: unknown, name?: string) {
    if(typeof location !== 'number') throw new Error('Location is required');
    this.location = location;
    this.object = object;
    this.name = name;
  }
}
