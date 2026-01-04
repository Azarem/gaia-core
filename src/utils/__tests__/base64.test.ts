import { describe, it, expect } from 'vitest';
import {
  encodeBase64,
  decodeBase64,
  isValidBase64,
  encodeBase64String,
  decodeBase64String
} from '../base64';

describe('Base64 Utilities', () => {
  describe('encodeBase64', () => {
    it('should encode empty Uint8Array to empty string', () => {
      const data = new Uint8Array(0);
      const result = encodeBase64(data);
      expect(result).toBe('');
    });

    it('should encode simple binary data', () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = encodeBase64(data);
      expect(result).toBe('SGVsbG8=');
    });

    it('should encode larger binary data', () => {
      const data = new Uint8Array(1000);
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 256;
      }
      const result = encodeBase64(data);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should handle very large arrays', () => {
      const data = new Uint8Array(100000);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.floor(Math.random() * 256);
      }
      const result = encodeBase64(data);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('decodeBase64', () => {
    it('should decode empty string to empty Uint8Array', () => {
      const result = decodeBase64('');
      expect(result).toEqual(new Uint8Array(0));
    });

    it('should decode simple base64 string', () => {
      const result = decodeBase64('SGVsbG8=');
      expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it('should throw error for invalid base64 string', () => {
      expect(() => decodeBase64('invalid!')).toThrow('Invalid base64 string format');
    });

    it('should handle padding correctly', () => {
      const result1 = decodeBase64('SGVsbG8='); // with padding
      expect(result1).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });
  });

  describe('isValidBase64', () => {
    it('should return true for valid base64 strings', () => {
      expect(isValidBase64('SGVsbG8=')).toBe(true);
      expect(isValidBase64('SGVsbG8gV29ybGQ=')).toBe(true);
      expect(isValidBase64('')).toBe(true); // empty string is valid
    });

    it('should return false for invalid base64 strings', () => {
      expect(isValidBase64('invalid!')).toBe(false);
      expect(isValidBase64('SGVsbG8')).toBe(false); // wrong length
      expect(isValidBase64(null as any)).toBe(false);
      expect(isValidBase64(undefined as any)).toBe(false);
      expect(isValidBase64(123 as any)).toBe(false);
    });
  });

  describe('encodeBase64String', () => {
    it('should encode text string to base64', () => {
      const result = encodeBase64String('Hello');
      expect(result).toBe('SGVsbG8=');
    });

    it('should handle UTF-8 characters', () => {
      const result = encodeBase64String('Hello 世界');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should handle empty string', () => {
      const result = encodeBase64String('');
      expect(result).toBe('');
    });
  });

  describe('decodeBase64String', () => {
    it('should decode base64 to text string', () => {
      const result = decodeBase64String('SGVsbG8=');
      expect(result).toBe('Hello');
    });

    it('should handle UTF-8 characters', () => {
      const encoded = encodeBase64String('Hello 世界');
      const decoded = decodeBase64String(encoded);
      expect(decoded).toBe('Hello 世界');
    });

    it('should throw error for invalid UTF-8', () => {
      // Create invalid UTF-8 sequence
      const invalidUtf8 = new Uint8Array([0xFF, 0xFE]);
      const base64 = encodeBase64(invalidUtf8);
      expect(() => decodeBase64String(base64)).toThrow();
    });
  });

  describe('round-trip encoding/decoding', () => {
    it('should maintain data integrity for binary data', () => {
      const originalData = new Uint8Array(256);
      for (let i = 0; i < originalData.length; i++) {
        originalData[i] = i;
      }

      const encoded = encodeBase64(originalData);
      const decoded = decodeBase64(encoded);

      expect(decoded).toEqual(originalData);
    });

    it('should maintain data integrity for text strings', () => {
      const originalText = 'Hello, World! 🌍 This is a test with UTF-8 characters: 你好世界';

      const encoded = encodeBase64String(originalText);
      const decoded = decodeBase64String(encoded);

      expect(decoded).toBe(originalText);
    });

    it('should handle large random data', () => {
      const originalData = new Uint8Array(10000);
      for (let i = 0; i < originalData.length; i++) {
        originalData[i] = Math.floor(Math.random() * 256);
      }

      const encoded = encodeBase64(originalData);
      const decoded = decodeBase64(encoded);

      expect(decoded).toEqual(originalData);
    });

    it('should handle very large data without call stack overflow', () => {
      // Test with 200KB of data to ensure no call stack issues
      const originalData = new Uint8Array(200000);
      for (let i = 0; i < originalData.length; i++) {
        originalData[i] = i % 256;
      }

      const encoded = encodeBase64(originalData);
      const decoded = decodeBase64(encoded);

      expect(decoded).toEqual(originalData);
      expect(encoded.length).toBeGreaterThan(0);
      expect(decoded.length).toBe(originalData.length);
    });

    it('should handle edge case data lengths (not multiples of 3)', () => {
      // Test with lengths that require different padding
      const testCases = [
        new Uint8Array([1]), // 1 byte - requires ==
        new Uint8Array([1, 2]), // 2 bytes - requires =
        new Uint8Array([1, 2, 3]), // 3 bytes - no padding
        new Uint8Array([1, 2, 3, 4]), // 4 bytes - requires ==
        new Uint8Array([1, 2, 3, 4, 5]), // 5 bytes - requires =
      ];

      testCases.forEach((testData) => {
        const encoded = encodeBase64(testData);
        const decoded = decodeBase64(encoded);
        expect(decoded).toEqual(testData);
      });
    });

    it('should handle all possible byte values', () => {
      const originalData = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        originalData[i] = i;
      }

      const encoded = encodeBase64(originalData);
      const decoded = decodeBase64(encoded);

      expect(decoded).toEqual(originalData);
      // Verify all byte values are preserved
      for (let i = 0; i < 256; i++) {
        expect(decoded[i]).toBe(i);
      }
    });
  });
});
