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

/**
 * Why a `transforms.json` entry did not change the extracted text.
 *  - `block-not-found`: the block name has no entry in `blocks.json`, so none of its transforms can run
 *  - `no-match`: the regex is valid but found nothing to replace
 *  - `invalid-regex`: the `key` is not a valid JavaScript regex
 */
export type TransformWarningKind = 'block-not-found' | 'no-match' | 'invalid-regex';

/** A transform that was not applied during extraction. */
export interface TransformWarning {
  kind: TransformWarningKind;
  /** Block name as written in `transforms.json`. */
  block: string;
  /** 1-based position of the entry in the block's transform list (absent for `block-not-found`). */
  index?: number;
  /** The entry's `key` regex source (absent for `block-not-found`). */
  key?: string;
  /** Number of transform entries affected (`block-not-found` covers every entry of the block). */
  count: number;
  /** Extra detail, e.g. the regex syntax error. */
  detail?: string;
}
