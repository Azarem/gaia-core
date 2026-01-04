import { describe, it, expect, beforeEach } from 'vitest';
import { Stack } from '../Stack';

describe('Stack', () => {
  let stack: Stack;

  beforeEach(() => {
    stack = new Stack();
  });

  describe('Constructor', () => {
    it('should create a stack with 70-byte buffer', () => {
      expect(stack.bytes.length).toBe(70);
    });

    it('should initialize with stack pointer at 10', () => {
      expect(stack.location).toBe(10);
    });

    it('should initialize buffer with zeros', () => {
      const allZeros = stack.bytes.every(byte => byte === 0);
      expect(allZeros).toBe(true);
    });
  });

  describe('push method', () => {
    it('should push a byte and increment stack pointer', () => {
      stack.push(0x42);
      
      expect(stack.location).toBe(11);
      expect(stack.bytes[10]).toBe(0x42);
    });

    it('should push multiple bytes in sequence', () => {
      stack.push(0x01);
      stack.push(0x02);
      stack.push(0x03);
      
      expect(stack.location).toBe(13);
      expect(stack.bytes[10]).toBe(0x01);
      expect(stack.bytes[11]).toBe(0x02);
      expect(stack.bytes[12]).toBe(0x03);
    });

    it('should handle full byte range (0-255)', () => {
      stack.push(0x00);
      stack.push(0xFF);
      
      expect(stack.bytes[10]).toBe(0x00);
      expect(stack.bytes[11]).toBe(0xFF);
    });

    it('should mask values to 8-bit range', () => {
      stack.push(0x100); // Should be masked to 0x00
      stack.push(0x1FF); // Should be masked to 0xFF
      
      expect(stack.bytes[10]).toBe(0x00);
      expect(stack.bytes[11]).toBe(0xFF);
    });
  });

  describe('popByte method', () => {
    it('should pop a byte and decrement stack pointer', () => {
      stack.push(0x42);
      const popped = stack.popByte();
      
      expect(popped).toBe(0x42);
      expect(stack.location).toBe(10);
    });

    it('should pop bytes in LIFO order', () => {
      stack.push(0x01);
      stack.push(0x02);
      stack.push(0x03);
      
      expect(stack.popByte()).toBe(0x03);
      expect(stack.popByte()).toBe(0x02);
      expect(stack.popByte()).toBe(0x01);
      expect(stack.location).toBe(10);
    });

    it('should handle pop from empty stack', () => {
      const popped = stack.popByte();
      
      expect(popped).toBe(0);
      expect(stack.location).toBe(9);
    });
  });

  describe('pushUInt16 method', () => {
    it('should push 16-bit value in little-endian order', () => {
      stack.pushUInt16(0x1234);
      
      expect(stack.location).toBe(12);
      expect(stack.bytes[10]).toBe(0x34); // Low byte first
      expect(stack.bytes[11]).toBe(0x12); // High byte second
    });

    it('should handle maximum 16-bit value', () => {
      stack.pushUInt16(0xFFFF);
      
      expect(stack.bytes[10]).toBe(0xFF);
      expect(stack.bytes[11]).toBe(0xFF);
    });

    it('should handle zero value', () => {
      stack.pushUInt16(0x0000);
      
      expect(stack.bytes[10]).toBe(0x00);
      expect(stack.bytes[11]).toBe(0x00);
    });
  });

  describe('popUInt16 method', () => {
    it('should pop 16-bit value in little-endian order', () => {
      stack.pushUInt16(0x1234);
      const popped = stack.popUInt16();
      
      expect(popped).toBe(0x1234);
      expect(stack.location).toBe(10);
    });

    it('should handle maximum 16-bit value', () => {
      stack.pushUInt16(0xFFFF);
      const popped = stack.popUInt16();
      
      expect(popped).toBe(0xFFFF);
    });

    it('should handle zero value', () => {
      stack.pushUInt16(0x0000);
      const popped = stack.popUInt16();
      
      expect(popped).toBe(0x0000);
    });

    it('should handle pop from empty stack', () => {
      const popped = stack.popUInt16();
      
      expect(popped).toBe(0);
      expect(stack.location).toBe(8);
    });
  });

  describe('reset method', () => {
    it('should reset stack pointer to 10', () => {
      stack.push(0x01);
      stack.push(0x02);
      stack.push(0x03);
      
      stack.reset();
      
      expect(stack.location).toBe(10);
    });

    it('should clear all buffer contents', () => {
      stack.push(0x01);
      stack.push(0x02);
      stack.push(0x03);
      
      stack.reset();
      
      const allZeros = stack.bytes.every(byte => byte === 0);
      expect(allZeros).toBe(true);
    });
  });

  describe('Stack overflow/underflow behavior', () => {
    it('should handle stack overflow gracefully', () => {
      // Fill the stack beyond capacity
      for (let i = 0; i < 100; i++) {
        stack.push(i & 0xFF);
      }
      
      // Should not crash and location should be the final position
      expect(stack.location).toBe(110); // 10 (initial) + 100 (pushed)
      expect(stack.bytes.length).toBe(70); // Buffer size unchanged
    });

    it('should handle multiple pops from empty stack', () => {
      for (let i = 0; i < 10; i++) {
        const popped = stack.popByte();
        expect(typeof popped).toBe('number');
      }
      
      expect(stack.location).toBeLessThanOrEqual(10);
    });
  });

  describe('Mixed operations', () => {
    it('should handle mixed 8-bit and 16-bit operations', () => {
      stack.push(0x12);
      stack.pushUInt16(0x3456);
      stack.push(0x78);
      
      expect(stack.location).toBe(14);
      
      expect(stack.popByte()).toBe(0x78);
      expect(stack.popUInt16()).toBe(0x3456);
      expect(stack.popByte()).toBe(0x12);
      expect(stack.location).toBe(10);
    });

    it('should maintain data integrity across operations', () => {
      const testData = [0x01, 0x02, 0x03, 0x04, 0x05];
      
      // Push all data
      for (const byte of testData) {
        stack.push(byte);
      }
      
      // Pop all data
      const poppedData = [];
      for (let i = 0; i < testData.length; i++) {
        poppedData.push(stack.popByte());
      }
      
      // Should be in reverse order
      expect(poppedData).toEqual(testData.reverse());
    });
  });

  describe('Edge cases', () => {
    it('should handle rapid push/pop cycles', () => {
      for (let i = 0; i < 10; i++) {
        stack.push(i);
        expect(stack.popByte()).toBe(i);
      }
      
      expect(stack.location).toBe(10);
    });

    it('should handle 16-bit boundary values', () => {
      const testValues = [0x0001, 0x00FF, 0x0100, 0x7FFF, 0x8000, 0xFFFE];
      
      for (const value of testValues) {
        stack.pushUInt16(value);
        expect(stack.popUInt16()).toBe(value);
      }
    });
  });
}); 