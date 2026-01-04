/**
 * Unit tests for Supabase utility functions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getEnvVar, base64ToUint8Array, uint8ArrayToBase64, validateEnvironmentVariables } from '../utils';

// Mock environment variables
const originalEnv = process.env;

describe('Supabase Utils', () => {
  beforeEach(() => {
    // Clear environment variables
    process.env = {};
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('getEnvVar', () => {
    it('should get environment variable from process.env', () => {
      process.env.TEST_VAR = 'test-value';
      
      const result = getEnvVar('TEST_VAR');
      
      expect(result).toBe('test-value');
    });

    it('should throw error for missing environment variable', () => {
      expect(() => getEnvVar('MISSING_VAR')).toThrow(
        'Required environment variable MISSING_VAR is not set'
      );
    });

    it('should throw error for empty environment variable', () => {
      process.env.EMPTY_VAR = '';

      expect(() => getEnvVar('EMPTY_VAR')).toThrow(
        'Required environment variable EMPTY_VAR is not set'
      );
    });

    it('should get environment variable with VITE_ prefix from process.env', () => {
      process.env.VITE_TEST_VAR = 'vite-test-value';

      const result = getEnvVar('TEST_VAR');

      expect(result).toBe('vite-test-value');
    });

    it('should prefer exact key over VITE_ prefixed key', () => {
      process.env.TEST_VAR = 'exact-value';
      process.env.VITE_TEST_VAR = 'vite-value';

      const result = getEnvVar('TEST_VAR');

      expect(result).toBe('exact-value');
    });

    it('should not add VITE_ prefix if key already starts with VITE_', () => {
      process.env.VITE_TEST_VAR = 'vite-value';

      const result = getEnvVar('VITE_TEST_VAR');

      expect(result).toBe('vite-value');
    });
  });

  describe('base64ToUint8Array', () => {
    it('should convert valid base64 to Uint8Array', () => {
      const base64 = 'SGVsbG8gV29ybGQ='; // "Hello World"
      
      const result = base64ToUint8Array(base64);
      
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
    });

    it('should handle data URLs by extracting base64 part', () => {
      const dataUrl = 'data:text/plain;base64,SGVsbG8gV29ybGQ=';
      
      const result = base64ToUint8Array(dataUrl);
      
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
    });

    it('should throw error for invalid base64', () => {
      const invalidBase64 = 'invalid-base64!@#';
      
      expect(() => base64ToUint8Array(invalidBase64)).toThrow(
        'Failed to decode base64 data:'
      );
    });
  });

  describe('uint8ArrayToBase64', () => {
    it('should convert Uint8Array to base64', () => {
      const uint8Array = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
      
      const result = uint8ArrayToBase64(uint8Array);
      
      expect(result).toBe('SGVsbG8gV29ybGQ=');
    });

    it('should handle empty Uint8Array', () => {
      const uint8Array = new Uint8Array([]);
      
      const result = uint8ArrayToBase64(uint8Array);
      
      expect(result).toBe('');
    });
  });

  describe('validateEnvironmentVariables', () => {
    it('should pass validation when all variables are set', () => {
      process.env.VAR1 = 'value1';
      process.env.VAR2 = 'value2';
      
      expect(() => validateEnvironmentVariables(['VAR1', 'VAR2'])).not.toThrow();
    });

    it('should throw error when some variables are missing', () => {
      process.env.VAR1 = 'value1';
      // VAR2 is missing
      
      expect(() => validateEnvironmentVariables(['VAR1', 'VAR2'])).toThrow(
        'Missing required environment variables: VAR2'
      );
    });

    it('should throw error when multiple variables are missing', () => {
      // Both variables are missing
      
      expect(() => validateEnvironmentVariables(['VAR1', 'VAR2'])).toThrow(
        'Missing required environment variables: VAR1, VAR2'
      );
    });

    it('should pass validation for empty array', () => {
      expect(() => validateEnvironmentVariables([])).not.toThrow();
    });
  });
});
