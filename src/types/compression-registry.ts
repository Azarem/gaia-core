import type { ICompressionProvider } from './compression';

/**
 * Registry for compression providers
 * Allows registration of compression implementations by string ID
 */
export class CompressionRegistry {
  private static providers = new Map<string, () => ICompressionProvider>();

  /**
   * Register a compression provider
   * @param id String identifier for the compression type
   * @param factory Factory function that creates the compression provider
   */
  public static register(id: string, factory: () => ICompressionProvider): void {
    this.providers.set(id, factory);
  }

  /**
   * Get a compression provider by ID
   * @param id String identifier for the compression type
   * @returns Compression provider instance
   */
  public static get(id: string): ICompressionProvider {
    const factory = this.providers.get(id);
    if (!factory) {
      throw new Error(`No compression provider registered for type: ${id}`);
    }
    return factory();
  }

  /**
   * Check if a compression provider is registered
   * @param id String identifier for the compression type
   * @returns True if provider is registered
   */
  public static has(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * Get list of registered provider IDs
   * @returns Array of registered provider IDs
   */
  public static getRegisteredIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Clear all registered providers (mainly for testing)
   */
  public static clear(): void {
    this.providers.clear();
  }
}
