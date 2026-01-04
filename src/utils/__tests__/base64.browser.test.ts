import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Base64 Browser Implementation', () => {
  let originalProcess: any;

  beforeEach(() => {
    // Mock browser environment by removing process.versions.node
    originalProcess = global.process;
    global.process = {} as any;
  });

  afterEach(() => {
    // Restore original process
    global.process = originalProcess;
  });

  it('should use custom implementation in browser environment', async () => {
    // Dynamically import to get fresh module with mocked environment
    const { encodeBase64, decodeBase64 } = await import('../base64');
    
    const testData = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]); // "Hello World"
    const encoded = encodeBase64(testData);
    const decoded = decodeBase64(encoded);

    expect(encoded).toBe('SGVsbG8gV29ybGQ=');
    expect(decoded).toEqual(testData);
  });

  it('should handle large data in browser environment without call stack overflow', async () => {
    const { encodeBase64, decodeBase64 } = await import('../base64');
    
    // Test with 100KB of data
    const largeData = new Uint8Array(100000);
    for (let i = 0; i < largeData.length; i++) {
      largeData[i] = i % 256;
    }

    const encoded = encodeBase64(largeData);
    const decoded = decodeBase64(encoded);

    expect(decoded).toEqual(largeData);
    expect(encoded.length).toBeGreaterThan(0);
    expect(decoded.length).toBe(largeData.length);
  });

  it('should handle edge cases in browser environment', async () => {
    const { encodeBase64, decodeBase64 } = await import('../base64');
    
    // Test various data lengths
    const testCases = [
      new Uint8Array([]), // empty
      new Uint8Array([1]), // 1 byte
      new Uint8Array([1, 2]), // 2 bytes
      new Uint8Array([1, 2, 3]), // 3 bytes
      new Uint8Array([1, 2, 3, 4]), // 4 bytes
      new Uint8Array([255, 254, 253, 252, 251]), // high values
    ];

    testCases.forEach((testData) => {
      const encoded = encodeBase64(testData);
      const decoded = decodeBase64(encoded);
      expect(decoded).toEqual(testData);
    });
  });

  it('should handle all possible byte values in browser environment', async () => {
    const { encodeBase64, decodeBase64 } = await import('../base64');
    
    const allBytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      allBytes[i] = i;
    }

    const encoded = encodeBase64(allBytes);
    const decoded = decodeBase64(encoded);

    expect(decoded).toEqual(allBytes);
    // Verify all byte values are preserved
    for (let i = 0; i < 256; i++) {
      expect(decoded[i]).toBe(i);
    }
  });
});
