/**
 * Lightweight ROM state placeholder used during early development.
 * This stub will be expanded as the ROM extraction pipeline matures.
 */
export class RomState {
  // Basic memory buffers
  public readonly cgram = new Uint8Array(0x200); // Color palette RAM
  public readonly vram = new Uint8Array(0x10000); // Video RAM

  /**
   * Create ROM state from scene metadata.
   * Parameters are currently unused but kept for future implementation.
   */
  public static async fromScene(
    _baseDir: string,
    _root: unknown,
    _metaFile: string,
    _id: number
  ): Promise<RomState> {
    return new RomState();
  }
}

/**
 * Utility helpers for working with RomState.
 */
export class RomStateUtils {
  /** Create an empty ROM state */
  public static createEmpty(): RomState {
    return new RomState();
  }

  /** Clear all data in the given ROM state */
  public static clear(state: RomState): void {
    state.cgram.fill(0);
    state.vram.fill(0);
  }
}
