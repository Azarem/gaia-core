import { describe, it, expect } from 'vitest';
import { binaryToUtf8String, bytesToHex, hexToBytes } from '../index';

describe('Utility Functions', () => {
  describe('binaryToUtf8String', () => {
    it('should convert simple ASCII text correctly', () => {
      const binaryData = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
      const result = binaryToUtf8String(binaryData);
      expect(result).toBe('Hello World');
    });

    it('should handle empty Uint8Array', () => {
      const binaryData = new Uint8Array([]);
      const result = binaryToUtf8String(binaryData);
      expect(result).toBe('');
    });

    it('should handle null/undefined input', () => {
      expect(binaryToUtf8String(null as any)).toBe('');
      expect(binaryToUtf8String(undefined as any)).toBe('');
    });

    it('should convert UTF-8 multi-byte characters correctly', () => {
      // Test with UTF-8 encoded "café" (c3 a9 is é in UTF-8)
      const binaryData = new Uint8Array([99, 97, 102, 195, 169]);
      const result = binaryToUtf8String(binaryData);
      expect(result).toBe('café');
    });

    it('should handle emoji and 4-byte UTF-8 sequences', () => {
      // Test with UTF-8 encoded "😀" (f0 9f 98 80)
      const binaryData = new Uint8Array([240, 159, 152, 128]);
      const result = binaryToUtf8String(binaryData);
      expect(result).toBe('😀');
    });

    it('should handle mixed ASCII and UTF-8 characters', () => {
      // "Hello 世界" - Hello World in English and Chinese
      const binaryData = new Uint8Array([72, 101, 108, 108, 111, 32, 228, 184, 150, 231, 149, 140]);
      const result = binaryToUtf8String(binaryData);
      expect(result).toBe('Hello 世界');
    });

    it('should throw error for invalid UTF-8 sequences', () => {
      // Invalid UTF-8: start byte without proper continuation
      const invalidData = new Uint8Array([0xC0, 0x20]); // Invalid continuation byte
      expect(() => binaryToUtf8String(invalidData)).toThrow('Failed to decode UTF-8 binary data');
    });

    it('should throw error for incomplete UTF-8 sequences', () => {
      // Incomplete UTF-8: two-byte sequence with missing second byte
      const incompleteData = new Uint8Array([0xC3]); // Missing continuation byte
      expect(() => binaryToUtf8String(incompleteData)).toThrow('Failed to decode UTF-8 binary data');
    });

    it('should handle special characters and symbols', () => {
      // Test with various special characters: "©®™"
      const binaryData = new Uint8Array([194, 169, 194, 174, 226, 132, 162]);
      const result = binaryToUtf8String(binaryData);
      expect(result).toBe('©®™');
    });

    it('should handle newlines and control characters', () => {
      // Test with "Hello\nWorld\t!"
      const binaryData = new Uint8Array([72, 101, 108, 108, 111, 10, 87, 111, 114, 108, 100, 9, 33]);
      const result = binaryToUtf8String(binaryData);
      expect(result).toBe('Hello\nWorld\t!');
    });
  });

  describe('bytesToHex', () => {
    it('should convert bytes to hex string correctly', () => {
      const bytes = new Uint8Array([255, 0, 128, 16]);
      const result = bytesToHex(bytes);
      expect(result).toBe('ff008010');
    });

    it('should handle empty array', () => {
      const bytes = new Uint8Array([]);
      const result = bytesToHex(bytes);
      expect(result).toBe('');
    });
  });

  describe('hexToBytes', () => {
    it('should convert hex string to bytes correctly', () => {
      const hex = 'ff008010';
      const result = hexToBytes(hex);
      expect(Array.from(result)).toEqual([255, 0, 128, 16]);
    });

    it('should handle empty string', () => {
      const hex = '';
      const result = hexToBytes(hex);
      expect(result.length).toBe(0);
    });
  });

  describe('round-trip conversion', () => {
    it('should maintain data integrity through binary->string->binary conversion', () => {
      const originalText = 'Hello 世界! 😀 ©®™';
      
      // Convert string to binary using TextEncoder
      const encoder = new TextEncoder();
      const binaryData = encoder.encode(originalText);
      
      // Convert binary to string using our function
      const convertedText = binaryToUtf8String(binaryData);
      
      // Should match original
      expect(convertedText).toBe(originalText);
    });
  });
});
