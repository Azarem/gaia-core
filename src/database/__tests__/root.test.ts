import { describe, it, expect, beforeAll } from 'vitest';
import { DbRootUtils } from '../root';

describe('DbRoot', () => {
    describe('fromSupabaseProject', () => {
        it('should create DbRoot from Supabase Project', async () => {
            const data = await DbRootUtils.fromSupabaseProject('Illusion of Gaia: Retranslated');
            expect(data).toBeDefined();
            expect(data.groups).toBeDefined();
            expect(data.scenes).toBeDefined();
            expect(data.files).toBeDefined();
            expect(data.blocks).toBeDefined();
            expect(data.config).toBeDefined();
            expect(data.compression).toBeDefined();
            expect(data.entryPoints).toBeDefined();
            expect(data.opCodes).toBeDefined();
            expect(data.opLookup).toBeDefined();
            expect(data.addrLookup).toBeDefined();
            expect(data.stringTypes).toBeDefined();
            expect(data.stringDelimiters).toBeDefined();
            expect(data.stringCharLookup).toBeDefined();
        });
    });
});