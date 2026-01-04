import { ChunkFile } from '../../types/files';
import { TableEntry } from '../../types';
import { StructDef, Word } from '../../types';
import { BlockReader } from './blocks';
import { ReferenceManager } from './references';

/**
 * Handles post processing of extracted blocks.
 * Mirrors functionality of GaiaLib.Rom.Extraction.PostProcessor.
 */
export class PostProcessor {
  private readonly _referenceManager: ReferenceManager;

  constructor(reader: BlockReader) {
    this._referenceManager = reader._referenceManager;
  }

  /**
   * Execute post process directive on a block if present.
   */
  public process(block: ChunkFile): void {
    if (!block.postProcess || block.postProcess.trim() === '') {
      return;
    }

    let signature = block.postProcess;
    const parts: string[] = [];

    const index = signature.indexOf('(');
    if (index > 0) {
      const endIx = signature.indexOf(')', index);
      const params = signature.substring(
        index + 1,
        endIx >= 0 ? endIx : signature.length
      );
      if (params.length > 0) {
        for (const p of params.split(',')) {
          parts.push(p.trim());
        }
      }
      signature = signature.substring(0, index);
    }

    const fn = (this as any)[signature];
    if (typeof fn !== 'function') {
      throw new Error(`Unable to locate postprocess function ${signature}`);
    }
    fn.apply(this, [block, ...parts]);
  }

  /**
   * Builds a lookup table from struct entries.
   * Equivalent to PostProcessor.Lookup in C# implementation.
   */
  public Lookup(block: ChunkFile, keyIx: string, valueIx: string): void {
    const kix = parseInt(keyIx.trim());
    const vix = parseInt(valueIx.trim());

    if(!block.parts || block.parts.length === 0) {
      throw new Error('Invalid block structure for Lookup post process');
    }

    const table = block.parts[0]?.objList;
    const tableEntry = table && table[0];
    const entries = tableEntry?.object as unknown[] | undefined;

    if (!tableEntry || !entries) {
      throw new Error('Invalid table structure for Lookup post process');
    }

    const newParts: TableEntry[] = [];
    const newList: any[] = [];

    newParts.push({ location: tableEntry.location, object: newList });

    let eIx = 1;
    for (const entry of entries as StructDef[]) {
      if (!entry || !Array.isArray((entry as any).parts)) {
        continue;
      }
      const struct = entry as StructDef;
      let cIx = 0;
      let key: number | null = null;
      let value: unknown = null;

      for (const obj of struct.parts) {
        if (cIx === kix) {
          if(obj && typeof obj === 'object' && 'value' in obj) {
            key = obj.value as number;
          } else {
            key = obj as number;
          }
        } else if (cIx === vix) {
          value = obj;
        }
        cIx++;
      }

      if (key === null || value === null) {
        throw new Error('Could not locate key or value for transform');
      }

      const name = `entry_${key.toString(16).toUpperCase().padStart(2, '0')}`;
      const loc = tableEntry.location + eIx;

      newParts.push({ location: loc, object: value });

      // Force labels to match the new name
      this._referenceManager.nameTable.set(loc, name);

      while (newList.length <= key) {
        newList.push(new Word(0));
      }

      newList[key] = `&${name}`;
      eIx++;
    }

    block.parts[0].objList = newParts;
  }
}

export default PostProcessor;

