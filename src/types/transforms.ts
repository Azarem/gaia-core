/**
 * Transform type definitions
 * Converted from GaiaLib/Enum/XformType.cs
 */
export enum XformType {
  Lookup = 'Lookup',
  Replace = 'Replace'
}

/**
 * Transform definition
 * Converted from GaiaLib/Types/XformDef.cs
 */
export interface XformDef {
  type: XformType;
  key?: string;
  value?: string;
  keyIx?: number;
  valueIx?: number;
} 