/**
 * Interface for compression providers
 */
export interface ICompressionProvider {
  /**
   * Expand (decompress) data
   * @param srcData Source data buffer
   * @param srcPosition Starting position in source data
   * @param srcLen Length of source data to process
   * @returns Expanded data
   */
  expand(srcData: Uint8Array, srcPosition?: number, srcLen?: number): Uint8Array;

  /**
   * Compact (compress) data
   * @param srcData Source data to compress
   * @returns Compressed data
   */
  compact(srcData: Uint8Array): Uint8Array;
}
