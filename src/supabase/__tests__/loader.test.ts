/**
 * Unit tests for Supabase types
 */

import { describe, it, expect } from 'vitest';
import { fromSupabaseByGameRom, fromSupabaseByProject, summaryFromSupabaseByProject } from '../rom-loader';

describe('Rom Loader', () => {
    describe('fromSupabaseProject', () => {
        it('should create project payload from Supabase Project', async () => {
            const data = await fromSupabaseByProject('Illusion of Gaia: Retranslated');
            expect(data).toBeDefined();
            expect(data.projectBranch).toBeDefined();
            expect(data.projectBranch.project).toBeDefined();
            expect(data.projectBranch.project.name).toBe('Illusion of Gaia: Retranslated');
            expect(data.projectBranch.baseRomBranch).toBeDefined();
            expect(data.projectBranch.baseRomBranch.gameRomBranch).toBeDefined();
            expect(data.projectBranch.baseRomBranch.gameRomBranch.gameRom).toBeDefined();
            expect(data.projectBranch.baseRomBranch.gameRomBranch.gameRom.game).toBeDefined();
            expect(data.projectBranch.baseRomBranch.gameRomBranch.gameRom.game.name).toBe('Illusion of Gaia');
            expect(data.projectBranch.baseRomBranch.gameRomBranch.gameRom.region).toBeDefined();
            expect(data.projectBranch.baseRomBranch.gameRomBranch.gameRom.region.name).toBe('US');
            expect(data.projectBranch.baseRomBranch.gameRomBranch.platformBranch).toBeDefined();
            expect(data.projectBranch.baseRomBranch.gameRomBranch.platformBranch.platform).toBeDefined();
            expect(data.projectBranch.baseRomBranch.gameRomBranch.platformBranch.platform.name).toBe('SNES');
        });
    });

    
    describe('fromSupabaseByGameRom', () => {
        it('should create game rom payload from Supabase Game Rom', async () => {
            const data = await fromSupabaseByGameRom("Illusion of Gaia", "US", "SNES");
            expect(data).toBeDefined();
            expect(data.baseRomBranch).toBeDefined();
            expect(data.baseRomBranch.baseRom).toBeDefined();
            expect(data.baseRomBranch.baseRom.name).not.toBe('GaiaLabs BaseROM');
            expect(data.baseRomBranch.gameRomBranch).toBeDefined();
            expect(data.baseRomBranch.gameRomBranch.gameRom).toBeDefined();
            expect(data.baseRomBranch.gameRomBranch.gameRom.game).toBeDefined();
            expect(data.baseRomBranch.gameRomBranch.gameRom.game.name).toBe('Illusion of Gaia');
            expect(data.baseRomBranch.gameRomBranch.gameRom.region).toBeDefined();
            expect(data.baseRomBranch.gameRomBranch.gameRom.region.name).toBe('US');
            expect(data.baseRomBranch.gameRomBranch.platformBranch).toBeDefined();
            expect(data.baseRomBranch.gameRomBranch.platformBranch.platform).toBeDefined();
            expect(data.baseRomBranch.gameRomBranch.platformBranch.platform.name).toBe('SNES');
        });
    });
    
    describe('summaryFromSupabaseByProject', () => {
        it('should create summary from Supabase Project', async () => {
            const data = await summaryFromSupabaseByProject('Illusion of Gaia: Retranslated');
            expect(data).toBeDefined();
            expect(data.project).toBeDefined();
            expect(data.project.name).toBe('Illusion of Gaia: Retranslated');
            expect(data.baseRomBranch).toBeDefined();
            expect(data.baseRomBranch.gameRomBranch).toBeDefined();
            expect(data.baseRomBranch.gameRomBranch.gameRom).toBeDefined();
            expect(data.baseRomBranch.gameRomBranch.gameRom.game).toBeDefined();
            expect(data.baseRomBranch.gameRomBranch.gameRom.game.name).toBe('Illusion of Gaia');
            expect(data.baseRomBranch.gameRomBranch.gameRom.region).toBeDefined();
            expect(data.baseRomBranch.gameRomBranch.gameRom.region.name).toBe('US');
            expect(data.baseRomBranch.gameRomBranch).toBeDefined();
            expect(data.baseRomBranch.gameRomBranch.platformBranch).toBeDefined();
            expect(data.baseRomBranch.gameRomBranch.platformBranch.platform).toBeDefined();
            expect(data.baseRomBranch.gameRomBranch.platformBranch.platform.name).toBe('SNES');
        });
    });

});
