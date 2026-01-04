/**
 * TypeScript interfaces for Supabase API responses
 * These types represent the structured data returned from ROM database queries
 */

export interface PlatformData {
  id: string;
  name: string;
  meta: any | null;
  createdAt: string;
  updatedAt: string;
}

export interface BranchBaseData {
  id: string;
  name: string | null;
  version: number | null;
  isActive?: boolean | null;
  notes?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileBaseData {
  id: string;
  name: string;
  type: string;
  version: number | null;
  crc: number | null;
  meta: any | null;
  isText: boolean;
  text: string | null;
  data: Uint8Array | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileBaseRaw extends Omit<FileBaseData, 'data'> {
  data: string | null;
}

/**
 * Platform branch information containing instruction set and addressing modes
 */
export interface PlatformBranchData extends BranchBaseData {
  platformId: string;
  addressingModes: any | null; // JSON field
  instructionSet: any | null; // JSON field
  vectors: any | null; // JSON field
  types: any | null; // JSON field
  platform: PlatformData;
}

/**
 * Game ROM branch information with platform reference
 */
export interface GameRomBranchData extends BranchBaseData {
  gameRomId: string;
  platformBranchId: string;
  coplib: any | null; // JSON field
  config: any | null; // JSON field
  files: any | null; // JSON field
  blocks: any | null; // JSON field
  fixups: any | null; // JSON field
  strings: any | null; // JSON field
  structs: any | null; // JSON field
  scenes: any | null; // JSON field
  gameRom: GameRomData;
  platformBranch: PlatformBranchData;
}

export interface GameRomArtifactData extends FileBaseData {
  gameRomId: string;
}

export interface GameRomArtifactRaw extends FileBaseRaw {
  gameRomId: string;
}

export interface GameRomBranchArtifactRaw {
  id: string;
  branchId: string;
  artifactId: string;
  artifact: GameRomArtifactRaw;
}

/**
 * Base ROM information
 */
export interface BaseRomData {
  id: string;
  name: string;
  gameId: string;
  gameRomId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GameData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegionData {
  id: string;
  name: string;
  meta: any | null;
  platformId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GameRomData {
  id: string;
  crc: number;
  meta: any | null;
  gameId: string;
  regionId: string;
  createdAt: string;
  updatedAt: string;
  game: GameData;
  region: RegionData;
}


/**
 * Base ROM branch with complete relationship chain
 */
export interface BaseRomBranchData extends BranchBaseData {
  baseRomId: string;
  gameRomBranchId: string;
  gameRomBranch: GameRomBranchData;
  baseRom: BaseRomData;
}

/**
 * Base ROM file containing binary data
 */
export interface BaseRomFileData extends FileBaseData {
  baseRomId: string;
}

export interface BaseRomBranchFileRaw {
  id: string;
  branchId: string;
  fileId: string;
  file: BaseRomFileRaw;
}

/**
 * Raw BaseRomFile data as returned from Supabase (before conversion)
 */
export interface BaseRomFileRaw extends FileBaseRaw {
  baseRomId: string;
}

/**
 * Complete ROM payload containing branch data and files
 */
export interface BaseRomPayload {
  baseRomBranch: BaseRomBranchData;
  files: BaseRomFileData[];
}

/**
 * Options for loading ROM data by name
 */
export interface FromSupabaseByNameOptions {
  /**
   * Name of the game to load
   * @default 'Illusion of Gaia'
   */
  gameName: string;

  /**
   * Name of the base ROM to load
   * @default 'GaiaLabs BaseROM'
   */
  baseRomName: string;
  
  /**
   * Name of the branch to load
   * Set to null to load the main/develop branch
   * Set to undefined to not filter by branch name
   */
  branchName?: string | null;
  
  /**
   * Version of the branch to load
   * Set to null to load the latest/main version
   * Set to undefined to not filter by version
   */
  branchVersion?: number | null;
}

/**
 * Error codes for Supabase operations
 */
export enum SupabaseErrorCode {
  BRANCH_NOT_FOUND = 'BRANCH_NOT_FOUND',
  ROM_NOT_FOUND = 'ROM_NOT_FOUND',
  FILES_NOT_FOUND = 'FILES_NOT_FOUND',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_DATA = 'INVALID_DATA',
  ENVIRONMENT_ERROR = 'ENVIRONMENT_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
}

/**
 * Custom error class for Supabase operations
 */
export class SupabaseFromError extends Error {
  constructor(
    message: string, 
    public readonly code: SupabaseErrorCode,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'SupabaseFromError';
  }
}

/**
 * Result type for async operations that may fail
 */
export type SupabaseResult<T> = {
  data: T;
  error: null;
} | {
  data: null;
  error: SupabaseFromError;
};

/**
 * Project information
 */
export interface ProjectData {
  id: string;
  name: string;
  meta: any | null; // JSON field
  gameId: string;
  baseRomId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Project branch with complete relationship chain
 */
export interface ProjectBranchData extends BranchBaseData {
  projectId: string;
  baseRomBranchId: string;
  modules: any[]; // JSON array
  project: ProjectData;
  baseRomBranch: BaseRomBranchData;
}

/**
 * Project file containing binary data
 */
export interface ProjectFileData extends FileBaseData {
  module: string | null;
  projectId: string;
}

export interface ProjectBranchFileRaw {
  id: string;
  branchId: string;
  fileId: string;
  file: ProjectFileRaw;
}

/**
 * Raw ProjectFile data as returned from Supabase (before conversion)
 */
export interface ProjectFileRaw extends FileBaseRaw {
  module: string | null;
  projectId: string;
}

/**
 * Complete Project payload containing branch data and files
 */
export interface ProjectPayload {
  projectBranch: ProjectBranchData;
  projectFiles: ProjectFileData[];
  baseRomBranch: BaseRomBranchData;
  baseRomFiles: BaseRomFileData[];
}

/**
 * Options for loading Project data by name
 */
export interface FromSupabaseByProjectOptions {
  projectName: string;
  /**
   * Name of the branch to load
   * Set to null to load the main/develop branch
   * Set to undefined to not filter by branch name
   */
  branchName?: string | null;
  
  /**
   * Version of the branch to load
   * Set to null to load the latest/main version
   * Set to undefined to not filter by version
   */
  branchVersion?: number | null;
}

/**
 * Query statistics for performance monitoring
 */
export interface QueryStats {
  branchQueryTime: number;
  fileQueryTime: number;
  totalTime: number;
  fileCount: number;
}
