/**
 * Table entry definition
 * Converted from GaiaLib/Types/TableEntry.cs
 */
export interface TableEntry {
  location: number;
  object: unknown;
}

/**
 * Creates a new TableEntry
 */
export function createTableEntry(location: number, object?: unknown): TableEntry {
  return {
    location,
    object
  };
} 