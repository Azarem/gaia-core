//import { AddressingMode } from '../types/addressing';
import { BinType } from '../types/resources';
import type { DbEntryPoint } from './entrypoints';
import type { DbPath } from './paths';

/**
 * Database configuration
 * Converted from GaiaLib/Database/DbConfig.cs
 */
export interface DbConfig {
  sfxLocation: number;
  sfxCount: number;
  //accentMap: string[];
  compression: string;
  //asmFormats: Record<AddressingMode, string>;
  entryPoints: DbEntryPoint[];
  paths: Record<BinType, DbPath>;
} 