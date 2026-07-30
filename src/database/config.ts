//import { AddressingMode } from '../types/addressing';
import { BinType } from '../types/resources';
import type { DbEntryPoint } from './entrypoints';
import type { DbPath } from './paths';
import { CpuMode, MemoryMapMode } from '../types';

/**
 * Database configuration
 * Converted from GaiaLib/Database/DbConfig.cs
 */
export interface DbConfig {
  sfxLocation: number;
  sfxCount: number;
  sfxType: string;
  sfxPack: string;
  //accentMap: string[];
  compression: string;
  uncompress: boolean;
  //asmFormats: Record<AddressingMode, string>;
  entryPoints: DbEntryPoint[];
  memoryMode: MemoryMapMode;
  cpuMode: CpuMode;
  chipset: number;
  ramSize: number;
  defaultBank?: number;
  oddLocationBase?: number;
} 