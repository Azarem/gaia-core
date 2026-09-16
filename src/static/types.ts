/**
 * Types for static ROM package loading
 * 
 * These types define the structure of pre-built JSON packages
 * served as static files (e.g. from GitHub Pages) as an alternative
 * to loading ROM data from Supabase.
 */

import { DbFileType } from '../database';

/**
 * Lightweight summary loaded on page init.
 * Contains only what the UI needs before the user clicks "Build ROM".
 */
export interface PackageSummary {
  projectName: string;
  version: string;
  notes: string[];
  modules: any[];
  crc: number;
  fileTypes: Record<string, Partial<DbFileType>>;
  packageHash: string;
}

/**
 * File entry in the static ROM package.
 * Text files carry their content in `text`; binary files use base64-encoded `data`.
 */
export interface PackageFileEntry {
  name: string;
  type: string;
  text?: string;
  data?: string;
  module?: string;
}
