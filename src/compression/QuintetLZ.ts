import { BitStream } from '../types/bitstream';
import { type ICompressionProvider } from '../types/compression';

/**
 * QuintetLZ compression algorithm implementation
 * Dictionary-based compression used in Quintet games
 */
export class QuintetLZ implements ICompressionProvider {
  public static readonly DICTIONARY_SIZE = 0x100;
  public static readonly DICTIONARY_INIT = 0x20;
  public static readonly DICTIONARY_OFFSET = 0xEF;
  private static readonly DEFAULT_PAGE_SIZE = 0x8000;

  /**
   * Expand (decompress) data using QuintetLZ algorithm
   * @param srcData Source data buffer
   * @param srcPosition Starting position in source data
   * @param srcLen Length of source data to process
   * @returns Expanded data
   */
  public expand(srcData: Uint8Array, srcPosition: number = 0, srcLen: number = QuintetLZ.DEFAULT_PAGE_SIZE): Uint8Array {
    const bitStream = new BitStream(srcData, srcPosition);
    const srcStop = srcPosition + srcLen;

    // Initialize dictionary with spaces (0x20)
    const dictionary = new Uint8Array(QuintetLZ.DICTIONARY_SIZE);
    dictionary.fill(QuintetLZ.DICTIONARY_INIT);

    // Initialize positions
    let dictPosition = QuintetLZ.DICTIONARY_OFFSET;
    let outPosition = 0;

    // First two bytes is decompressed size
    let dstLen = bitStream.readShort();

    if(dstLen === 0){
      return srcData.slice(srcPosition + 2, srcStop);
    } else if(dstLen & 0x8000) {
      dstLen = 0x10000 - dstLen;
    }

    // Create output buffer with the expected size
    const outBuffer = new Uint8Array(dstLen);

    while (bitStream.currentPosition < srcStop && outPosition < dstLen) {
      // If current bit is set, read byte and add to output buffer and dictionary
      if (bitStream.readBit()) {
        // Read byte from bitstream
        const sample = bitStream.readByte();

        // Add byte to output buffer and increment
        if (outPosition < dstLen) {
          outBuffer[outPosition++] = sample;
        }

        // Add byte to dictionary
        dictionary[dictPosition] = sample;

        // Wrap dictionary index
        dictPosition = (dictPosition + 1) & 0xFF;
      }
      // If current bit is not set, read sequence from dictionary
      else {
        // Read wordIndex and wordLength from bitstream
        let wordIndex = bitStream.readByte();
        let wordLength = bitStream.readNibble() + 2;

        // Continue while there are remaining bytes to copy
        while (wordLength-- > 0) {
          // Read byte at wordIndex
          const sample = dictionary[wordIndex];

          // Wrap dictionary index
          wordIndex = (wordIndex + 1) & 0xFF;

          // Copy byte to output buffer and increment, but only if there is space
          if (outPosition < dstLen) {
            outBuffer[outPosition++] = sample;
          }

          // Add byte to dictionary and increment
          dictionary[dictPosition] = sample;

          // Wrap dictionary index
          dictPosition = (dictPosition + 1) & 0xFF;
        }
      }
    }

    // Return only the used portion of the buffer
    if (outPosition < dstLen) {
      return outBuffer.slice(0, outPosition);
    }

    return outBuffer;
  }

  /**
   * Compact (compress) data using QuintetLZ algorithm
   * @param srcData Source data to compress
   * @returns Compressed data
   */
  public compact(srcData: Uint8Array, srcPosition?: number, srcLen?: number): Uint8Array {
    // Initialize dictionary with spaces
    const dictionary = new Uint8Array(QuintetLZ.DICTIONARY_SIZE);
    dictionary.fill(QuintetLZ.DICTIONARY_INIT);

    let offset = QuintetLZ.DICTIONARY_OFFSET;
    let srcIx = srcPosition ?? 0;
    let dstIx = 0;

    if(!srcLen) srcLen = srcData.length - srcIx;

    //const srcLen = srcData.length;
    const outputBuffer = new Uint8Array(srcLen * 2); // Allocate extra space for safety

    // Write header (16-bit length in little-endian)
    outputBuffer[dstIx++] = srcLen & 0xFF;
    outputBuffer[dstIx++] = (srcLen >> 8) & 0xFF;

    const bitStream = new BitStream(outputBuffer, 2); // Start after header

    /**
     * Find the best match in the dictionary
     * @returns Tuple of [startByte, length]
     */
    const getCommand = (): [number, number] => {
      const maxLen = Math.min(srcLen - srcIx, 17);
      if (maxLen < 2) {
        return [0, 0];
      }

      let startByte = 0;
      let bestLen = 0;
      let bx = offset;

      for (let i = 0; i < 0x100; i++, bx = (bx + 1) & 0xFF) {
        let size = 0;
        let bix = bx;

        while (size < maxLen && dictionary[bix] === srcData[srcIx + size]) {
          bix = (bix + 1) & 0xFF;
          if (bix === offset) {
            bix = bx;
          }
          size++;
        }

        if (size > bestLen) {
          startByte = bx;
          bestLen = size;

          if (bestLen >= maxLen) {
            break;
          }
        }
      }

      return [startByte, bestLen];
    };

    while (srcIx < srcLen) {
      const [cmdStart, cmdLen] = getCommand();

      if (cmdLen >= 2) {
        // Write dictionary reference
        bitStream.writeBit(false);
        bitStream.writeByte(cmdStart);
        bitStream.writeNibble(cmdLen - 2);

        // Copy bytes to dictionary
        for (let i = 0; i < cmdLen; i++) {
          dictionary[offset] = srcData[srcIx++];
          offset = (offset + 1) & 0xFF;
        }
      } else {
        // Write literal byte
        bitStream.writeBit(true);
        const val = srcData[srcIx++];
        bitStream.writeByte(val);
        dictionary[offset] = val;
        offset = (offset + 1) & 0xFF;
      }
    }
    bitStream.flush();

    // Get the final size including the bit stream data
    const finalSize = Math.max(dstIx, bitStream.currentPosition);
    return outputBuffer.slice(0, finalSize);
  }
} 