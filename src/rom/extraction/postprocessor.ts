import { ChunkFile } from '../../types/files';
import { TableEntry } from '../../types';
import { StructDef, Word } from '../../types';
import { BlockReader } from './blocks';
import { ReferenceManager } from './references';
import { AsmBlock } from '../../types/assembly';

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

    const steps = block.postProcess.split('&&').map(step => step.trim());

    for (const step of steps) {
      let signature = step;
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
    
  }

  /**
   * Builds a lookup table from struct entries.
   * Equivalent to PostProcessor.Lookup in C# implementation.
   */
  public Lookup(block: ChunkFile, keyIx: string, valueIx: string, maxId: string): void {
    const keyIndex = parseInt(keyIx.trim());
    const valueIndex = parseInt(valueIx.trim());
    const maxKey = maxId ? parseInt(maxId.trim()) : undefined;

    if(!block.parts?.length) throw new Error('Invalid block structure for Lookup post process');

    const newParts: TableEntry[] = [];
    const lookupList: any[] = [];
    
    // Add the master lookup (use location - 1 to avoid overwriting the first entry)
    newParts.push({ location: block.location - 1, object: lookupList });

    const newBlockName = `${block.parts[0].objList[0].object[0].name}_list`;

    //Add mater lookup name
    this._referenceManager.nameTable.set(block.location - 1, newBlockName);

    const entryLookup: Record<number, TableEntry> = {};
    let endKey = -1;

    for (const part of block.parts) {
      
      const entries = (part.objList[0] as TableEntry).object as StructDef[];
      for (const entry of entries) {
        
        let key: number | undefined;
        let value: any | undefined;
        
        for(let i = 0; i < entry.parts.length; i++) {
          if (i === keyIndex) {
            const obj = entry.parts[i];
            if (typeof obj === 'number') key = obj;
            else if (obj && typeof obj === 'object' && 'value' in obj) key = obj.value as number;
          } 
          else if (i === valueIndex) value = entry.parts[i];
        }

        if (key === undefined || value === undefined) continue;
        if (maxKey && key > maxKey) continue;

        //Adjust highest key found
        if (key > endKey) endKey = key;

        const name = `${entry.name}_${key.toString(16).toUpperCase().padStart(4, '0')}`;
        
        const tableEntry = new TableEntry(entry.location, value, name);

        //Add key to entry lookup table
        entryLookup[key] = tableEntry;
        
        //Add entry name to name table
        this._referenceManager.nameTable.set(entry.location, name);
        
        //Add entry to new parts
        //newParts.push({ location: entry.location, object: value, name: name });
      }
    }
    
    //Generate lookup list
    for (let i = 0; i <= endKey; i++) {
      const entry = entryLookup[i];
      if(entry) newParts.push(entry);
      lookupList.push(entry ? `&${entry.name}` : new Word(0));
    }

    const newBlock = new AsmBlock(block.location - 1, 0, false, newBlockName);
    newBlock.objList = newParts;

    block.parts = [ newBlock ];
  }

  public Label( block: ChunkFile, structType: string) {
    
    if(!block.parts?.length) throw new Error('Invalid block structure for Label post process');

    const keyLookup: Record<number, string> = {};
    let endKey = -1;

    for (const part of block.parts) {

      for(const obj of part.objList) {
        if(!obj || typeof obj !== 'object' || !('object' in obj)) continue;

        for(let i = 0; i < obj.object.length; i++) {
          const entry = obj.object[i];
          if(!entry || typeof entry !== 'object' || !('name' in entry) || !('parts' in entry) || entry.name !== structType) continue;
          const part = entry.parts[0];

          const key = typeof part === 'number' ? part : part.value as number;
          const name = `${structType}_${key.toString(16).toUpperCase().padStart(2, '0')}`;
          obj.object[i] = `${name}:`;
          keyLookup[key] = name;
          if (key > endKey) endKey = key;
        }
      }

    }

    const keyList: any[] = [];
    for (let i = 0; i <= endKey; i++) {
      const name = keyLookup[i];
      keyList.push(name ? `&${name}` : new Word(0));
    }

    const newName = `${structType}_list`;
    const newBlock = new AsmBlock(block.location + block.size - 1, 0, false, newName);
    newBlock.objList = [ { location: newBlock.location, object: keyList } ];

    this._referenceManager.nameTable.set(newBlock.location, newName);

    block.parts.push(newBlock);
  }

}

export default PostProcessor;

