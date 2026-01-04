import { Registers } from '../../assembly';

export class MapExt<K, V> extends Map<K, V> {

  constructor() {
    super();
  }

  public tryAdd(key: K, value: V): boolean {
    if (this.has(key)) {
      return false;
    }
    this.set(key, value);
    return true;
  }

  public setFlag(key: K, flag: number, value: boolean = true): void {
    if (!value) this.clearFlag(key, flag);
    else this.set(key, (((this.get(key) as number) ?? 0) | flag) as V);
  }

  public clearFlag(key: K, flag: number): void {
    this.set(key, (((this.get(key) as number) ?? 0) & ~flag) as V);
  }
}

/**
 * Manages CPU processor state during ROM analysis
 * Converted from GaiaLib/Rom/Extraction/ProcessorStateManager.cs
 */
export class ProcessorStateManager {
  // public readonly accumulatorFlags = new MapExt<number, boolean | null>();
  // public readonly indexFlags = new MapExt<number, boolean | null>();
  // public readonly bankNotes = new MapExt<number, number | null>();
  public readonly stackPositions = new MapExt<number, number>();

  private readonly _buckets: Record<string, MapExt<number, number>> = {};

  public get(key: string): MapExt<number, number> {
    return this._buckets[key] ?? (this._buckets[key] = new MapExt<number, number>());
  }

  /**
   * Hydrate processor registers with stored state
   * Uses Registers from gaia-core/assembly for processor state management
   */
  public hydrateRegisters(position: number, reg: Registers): void {

    for (const [key, value] of Object.entries(this._buckets)) {
      const val = value.get(position);
      if (val !== undefined) {
        reg.value[key] = val;
      }
    }

    // const acc = this.accumulatorFlags.get(position);
    // if (acc !== undefined) {
    //   reg.accumulatorFlag = acc ?? undefined;
    // }

    // const ind = this.indexFlags.get(position);
    // if (ind !== undefined) {
    //   reg.indexFlag = ind ?? undefined;
    // }

    // const bnk = this.bankNotes.get(position);
    // if (bnk !== undefined) {
    //   reg.dataBank = bnk ?? undefined;
    // }

    const stack = this.stackPositions.get(position);
    if (stack !== undefined) {
      reg.stack.location = stack;
    }
  }

  // // Accumulator flag methods
  // public getAccumulatorFlag(location: number): boolean | null | undefined {
  //   return this.accumulatorFlags.get(location);
  // }

  // public setAccumulatorFlag(location: number, value: boolean | null): void {
  //   this.accumulatorFlags.set(location, value);
  // }

  // public tryAddAccumulatorFlag(location: number, value: boolean | null): boolean {
  //   if (this.accumulatorFlags.has(location)) {
  //     return false;
  //   }
  //   this.accumulatorFlags.set(location, value);
  //   return true;
  // }

  // // Index flag methods
  // public getIndexFlag(location: number): boolean | null | undefined {
  //   return this.indexFlags.get(location);
  // }

  // public setIndexFlag(location: number, value: boolean | null): void {
  //   this.indexFlags.set(location, value);
  // }

  // public tryAddIndexFlag(location: number, value: boolean | null): boolean {
  //   if (this.indexFlags.has(location)) {
  //     return false;
  //   }
  //   this.indexFlags.set(location, value);
  //   return true;
  // }

  // // Bank note methods
  // public getBankNote(location: number): number | null | undefined {
  //   return this.bankNotes.get(location);
  // }

  // public setBankNote(location: number, value: number | null): void {
  //   this.bankNotes.set(location, value);
  // }

  // Stack position methods
  public getStackPosition(location: number): number | undefined {
    return this.stackPositions.get(location);
  }

  public setStackPosition(location: number, value: number): void {
    this.stackPositions.set(location, value);
  }

  public tryAddStackPosition(location: number, value: number): boolean {
    if (this.stackPositions.has(location)) {
      return false;
    }
    this.stackPositions.set(location, value);
    return true;
  }
} 