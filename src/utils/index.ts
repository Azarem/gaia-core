// Utility functions and helpers

// File utilities
export * from './file';
export * from './crc';
export * from './base64';

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Convert binary data (Uint8Array) to UTF-8 string representation
 *
 * This function properly decodes UTF-8 encoded binary data to avoid corruption
 * of special characters and multi-byte sequences.
 *
 * @param binaryData - The binary data as Uint8Array containing UTF-8 encoded text
 * @returns The decoded UTF-8 string
 * @throws {Error} If the binary data contains invalid UTF-8 sequences
 *
 * @example
 * ```typescript
 * const binaryData = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
 * const text = binaryToUtf8String(binaryData);
 * console.log(text); // "Hello World"
 *
 * // Handle UTF-8 multi-byte characters
 * const utf8Data = new Uint8Array([240, 159, 152, 128]); // 😀 emoji
 * const emoji = binaryToUtf8String(utf8Data);
 * console.log(emoji); // "😀"
 * ```
 */
export function binaryToUtf8String(binaryData: Uint8Array): string {
  if (!binaryData || binaryData.length === 0) {
    return '';
  }

  try {
    // Use TextDecoder for proper UTF-8 decoding with error handling
    if (typeof TextDecoder !== 'undefined') {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      return decoder.decode(binaryData);
    }

    // Node.js fallback using Buffer
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(binaryData).toString('utf8');
    }

    // Manual UTF-8 decoding fallback (less robust but works in all environments)
    let result = '';
    let i = 0;

    while (i < binaryData.length) {
      let byte1 = binaryData[i++];

      // Single-byte character (ASCII)
      if (byte1 < 0x80) {
        result += String.fromCharCode(byte1);
      }
      // Two-byte character
      else if ((byte1 & 0xE0) === 0xC0) {
        if (i >= binaryData.length) {
          throw new Error(`Invalid UTF-8 sequence: incomplete two-byte character at position ${i - 1}`);
        }
        const byte2 = binaryData[i++];
        if ((byte2 & 0xC0) !== 0x80) {
          throw new Error(`Invalid UTF-8 sequence: invalid continuation byte at position ${i - 1}`);
        }
        const codePoint = ((byte1 & 0x1F) << 6) | (byte2 & 0x3F);
        result += String.fromCharCode(codePoint);
      }
      // Three-byte character
      else if ((byte1 & 0xF0) === 0xE0) {
        if (i + 1 >= binaryData.length) {
          throw new Error(`Invalid UTF-8 sequence: incomplete three-byte character at position ${i - 1}`);
        }
        const byte2 = binaryData[i++];
        const byte3 = binaryData[i++];
        if ((byte2 & 0xC0) !== 0x80 || (byte3 & 0xC0) !== 0x80) {
          throw new Error(`Invalid UTF-8 sequence: invalid continuation bytes at position ${i - 2}`);
        }
        const codePoint = ((byte1 & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F);
        result += String.fromCharCode(codePoint);
      }
      // Four-byte character
      else if ((byte1 & 0xF8) === 0xF0) {
        if (i + 2 >= binaryData.length) {
          throw new Error(`Invalid UTF-8 sequence: incomplete four-byte character at position ${i - 1}`);
        }
        const byte2 = binaryData[i++];
        const byte3 = binaryData[i++];
        const byte4 = binaryData[i++];
        if ((byte2 & 0xC0) !== 0x80 || (byte3 & 0xC0) !== 0x80 || (byte4 & 0xC0) !== 0x80) {
          throw new Error(`Invalid UTF-8 sequence: invalid continuation bytes at position ${i - 3}`);
        }
        const codePoint = ((byte1 & 0x07) << 18) | ((byte2 & 0x3F) << 12) | ((byte3 & 0x3F) << 6) | (byte4 & 0x3F);
        // Use surrogate pairs for code points > 0xFFFF
        if (codePoint > 0xFFFF) {
          const surrogate1 = 0xD800 + ((codePoint - 0x10000) >> 10);
          const surrogate2 = 0xDC00 + ((codePoint - 0x10000) & 0x3FF);
          result += String.fromCharCode(surrogate1, surrogate2);
        } else {
          result += String.fromCharCode(codePoint);
        }
      }
      // Invalid UTF-8 start byte
      else {
        throw new Error(`Invalid UTF-8 sequence: invalid start byte 0x${byte1.toString(16)} at position ${i - 1}`);
      }
    }

    return result;
  } catch (error) {
    throw new Error(`Failed to decode UTF-8 binary data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Safely get nested object property
 */
export function getNestedProperty(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}


export function indexOfAny(str: string, chars: string[], startIndex = 0): number {
  for (let i = startIndex; i < str.length; i++) {
    if (chars.includes(str[i])) {
      return i;
    }
  }
  return -1;
}

