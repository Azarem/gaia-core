/**
 * Unit tests for Supabase types
 */

import { describe, it, expect } from 'vitest';
import { SupabaseFromError, SupabaseErrorCode } from '../types';

describe('Supabase Types', () => {
  describe('SupabaseFromError', () => {
    it('should create error with message and code', () => {
      const error = new SupabaseFromError('Test error', SupabaseErrorCode.BRANCH_NOT_FOUND);
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(SupabaseErrorCode.BRANCH_NOT_FOUND);
      expect(error.name).toBe('SupabaseFromError');
      expect(error.details).toBeUndefined();
    });

    it('should create error with message, code, and details', () => {
      const details = { id: '123', extra: 'info' };
      const error = new SupabaseFromError('Test error with details', SupabaseErrorCode.ROM_NOT_FOUND, details);
      
      expect(error.message).toBe('Test error with details');
      expect(error.code).toBe(SupabaseErrorCode.ROM_NOT_FOUND);
      expect(error.name).toBe('SupabaseFromError');
      expect(error.details).toEqual(details);
    });

    it('should be instance of Error', () => {
      const error = new SupabaseFromError('Test error', SupabaseErrorCode.NETWORK_ERROR);
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SupabaseFromError);
    });
  });

  describe('SupabaseErrorCode enum', () => {
    it('should have all expected error codes', () => {
      expect(SupabaseErrorCode.BRANCH_NOT_FOUND).toBe('BRANCH_NOT_FOUND');
      expect(SupabaseErrorCode.ROM_NOT_FOUND).toBe('ROM_NOT_FOUND');
      expect(SupabaseErrorCode.FILES_NOT_FOUND).toBe('FILES_NOT_FOUND');
      expect(SupabaseErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR');
      expect(SupabaseErrorCode.INVALID_DATA).toBe('INVALID_DATA');
      expect(SupabaseErrorCode.ENVIRONMENT_ERROR).toBe('ENVIRONMENT_ERROR');
      expect(SupabaseErrorCode.PERMISSION_ERROR).toBe('PERMISSION_ERROR');
    });
  });
});
