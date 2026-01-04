/**
 * Database path configuration
 * Converted from GaiaLib/Database/DbPath.cs
 */
export interface DbPath {
  folder: string;
  extension: string;
}

/**
 * Creates a default DbPath
 */
export function createDbPath(folder: string = 'misc', extension: string = 'bin'): DbPath {
  return {
    folder,
    extension
  };
} 