/**
 * A map that sorts keys by length in descending order, then alphabetically
 * This is used for tag replacement where longer tags should be replaced first
 * to avoid conflicts (e.g., "ABCD" should be replaced before "ABC")
 */
export class SortedMap<V> {
  private map = new Map<string, V>();
  private _keys: string[] = [];

  public get size(): number {
    return this.map.size;
  }

  public set(key: string, value: V): this {
    if (!this.map.has(key)) {
      this._keys.push(key);
      this.sortKeys();
    }
    this.map.set(key, value);
    return this;
  }

  public get(key: string): V | undefined {
    return this.map.get(key);
  }

  public has(key: string): boolean {
    return this.map.has(key);
  }

  public delete(key: string): boolean {
    const result = this.map.delete(key);
    if (result) {
      const index = this._keys.indexOf(key);
      if (index >= 0) {
        this._keys.splice(index, 1);
      }
    }
    return result;
  }

  public clear(): void {
    this.map.clear();
    this._keys.length = 0;
  }

  public keys(): string[] {
    return [...this._keys];
  }

  public values(): V[] {
    return this._keys.map(key => this.map.get(key)!);
  }

  public entries(): [string, V][] {
    return this._keys.map(key => [key, this.map.get(key)!]);
  }

  public *[Symbol.iterator](): Generator<[string, V], void, unknown> {
    for (const key of this._keys) {
      yield [key, this.map.get(key)!];
    }
  }

  private sortKeys(): void {
    this._keys.sort((a, b) => {
      // Sort by length descending first
      if (a.length !== b.length) {
        return b.length - a.length;
      }
      // Then alphabetically
      return a.localeCompare(b);
    });
  }
}
