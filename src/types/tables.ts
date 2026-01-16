
export class TableEntry {
  location: number;
  object: unknown;

  constructor(location: number) {
    this.location = location ?? undefined;

    if(this.location === undefined) throw new Error('Location is required');
  }
}
