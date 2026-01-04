/**
 * Base64 encoding and decoding utilities for Uint8Arrays
 * Works in both Node.js and browser environments
 */

// Platform detection
const isNode = typeof process !== 'undefined' && process.versions?.node;

// Base64 character set
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Create lookup table for decoding
const BASE64_LOOKUP: { [key: string]: number } = {};
for (let i = 0; i < BASE64_CHARS.length; i++) {
  BASE64_LOOKUP[BASE64_CHARS[i]] = i;
}

/**
 * Custom base64 encoding implementation that handles large data without call stack overflow
 * @param data The binary data to encode
 * @returns Base64 encoded string
 */
function customBase64Encode(data: Uint8Array): string {
  let result = '';
  let i = 0;

  // Process 3 bytes at a time
  while (i < data.length) {
    const byte1 = data[i++];
    const byte2 = i < data.length ? data[i++] : 0;
    const byte3 = i < data.length ? data[i++] : 0;

    // Convert 3 bytes to 4 base64 characters
    const bitmap = (byte1 << 16) | (byte2 << 8) | byte3;

    result += BASE64_CHARS[(bitmap >> 18) & 63];
    result += BASE64_CHARS[(bitmap >> 12) & 63];
    result += BASE64_CHARS[(bitmap >> 6) & 63];
    result += BASE64_CHARS[bitmap & 63];
  }

  // Add padding if necessary
  const padding = data.length % 3;
  if (padding === 1) {
    result = result.slice(0, -2) + '==';
  } else if (padding === 2) {
    result = result.slice(0, -1) + '=';
  }

  return result;
}

/**
 * Custom base64 decoding implementation that handles large data without call stack overflow
 * @param base64String The base64 string to decode
 * @returns Decoded binary data as Uint8Array
 * @throws {Error} If the input contains invalid base64 characters
 */
function customBase64Decode(base64String: string): Uint8Array {
  // Remove padding for calculation
  const cleanString = base64String.replace(/=/g, '');
  const outputLength = Math.floor((cleanString.length * 3) / 4);
  const result = new Uint8Array(outputLength);

  let resultIndex = 0;
  let i = 0;

  // Process 4 characters at a time
  while (i < cleanString.length) {
    const char1 = cleanString[i++];
    const char2 = i < cleanString.length ? cleanString[i++] : 'A';
    const char3 = i < cleanString.length ? cleanString[i++] : 'A';
    const char4 = i < cleanString.length ? cleanString[i++] : 'A';

    // Validate characters
    if (!(char1 in BASE64_LOOKUP) || !(char2 in BASE64_LOOKUP) ||
        !(char3 in BASE64_LOOKUP) || !(char4 in BASE64_LOOKUP)) {
      throw new Error('Invalid base64 character encountered');
    }

    // Convert 4 base64 characters to 3 bytes
    const bitmap = (BASE64_LOOKUP[char1] << 18) |
                   (BASE64_LOOKUP[char2] << 12) |
                   (BASE64_LOOKUP[char3] << 6) |
                   BASE64_LOOKUP[char4];

    if (resultIndex < result.length) {
      result[resultIndex++] = (bitmap >> 16) & 255;
    }
    if (resultIndex < result.length) {
      result[resultIndex++] = (bitmap >> 8) & 255;
    }
    if (resultIndex < result.length) {
      result[resultIndex++] = bitmap & 255;
    }
  }

  return result;
}

/**
 * Encode a Uint8Array to a base64 string
 * @param data The binary data to encode
 * @returns Base64 encoded string
 */
export function encodeBase64(data: Uint8Array): string {
  if (!data || data.length === 0) {
    return '';
  }

  if (isNode) {
    // Node.js environment - use Buffer
    return Buffer.from(data).toString('base64');
  } else {
    // Browser environment - custom base64 encoding implementation
    return customBase64Encode(data);
  }
}

/**
 * Decode a base64 string to a Uint8Array
 * @param base64String The base64 string to decode
 * @returns Decoded binary data as Uint8Array
 * @throws {Error} If the input is not a valid base64 string
 */
export function decodeBase64(base64String: string): Uint8Array {
  if (!base64String || base64String.length === 0) {
    return new Uint8Array(0);
  }

  // Validate base64 format
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64String)) {
    throw new Error('Invalid base64 string format');
  }

  if (isNode) {
    // Node.js environment - use Buffer
    try {
      const buffer = Buffer.from(base64String, 'base64');
      return new Uint8Array(buffer);
    } catch (error) {
      throw new Error(`Failed to decode base64 string: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    // Browser environment - custom base64 decoding implementation
    try {
      return customBase64Decode(base64String);
    } catch (error) {
      throw new Error(`Failed to decode base64 string: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Check if a string is valid base64
 * @param str The string to validate
 * @returns True if the string is valid base64, false otherwise
 */
export function isValidBase64(str: string): boolean {
  if (typeof str !== 'string') {
    return false;
  }

  // Empty string is valid base64
  if (str === '') {
    return true;
  }

  // Check format with regex
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str)) {
    return false;
  }

  // Check length (must be multiple of 4)
  if (str.length % 4 !== 0) {
    return false;
  }

  try {
    // Try to decode to verify it's actually valid
    decodeBase64(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Encode a string to base64 (convenience function)
 * @param text The text string to encode
 * @returns Base64 encoded string
 */
export function encodeBase64String(text: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  return encodeBase64(data);
}

/**
 * Decode a base64 string to text (convenience function)
 * @param base64String The base64 string to decode
 * @returns Decoded text string
 * @throws {Error} If the input is not a valid base64 string or doesn't contain valid UTF-8
 */
export function decodeBase64String(base64String: string): string {
  const data = decodeBase64(base64String);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  
  try {
    return decoder.decode(data);
  } catch (error) {
    throw new Error(`Failed to decode base64 string as UTF-8 text: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
