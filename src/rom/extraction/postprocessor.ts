import { ChunkFile } from '../../types/files';
import { TableEntry } from '../../types';
import { StructDef, Word, LocationWrapper, AddressType } from '../../types';
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
    const keyIndex = parseInt(keyIx);
    const valueIndex = parseInt(valueIx);
    const maxKey = maxId ? parseInt(maxId) : undefined;

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

  public Extract( block: ChunkFile, valueIndexString: string) {
    if(!block.parts?.length) throw new Error('Invalid block structure for Extract post process');
    
    //const offset = offsetString ? parseInt(offsetString) ?? 0 : 0;
    const valueIndex = valueIndexString ? parseInt(valueIndexString) ?? 0 : 0;

    for (const part of block.parts) {
      const tableList = part.objList as TableEntry[];
      const locationList = tableList[0].object as LocationWrapper[];
      const objLookup : Record<number, any> = {};
      let objLocation = tableList[0].location;
      let valueLocation = tableList.length + objLocation++;

      const newLocationList: LocationWrapper[] = [];
      const newLocationTable: TableEntry = { location: valueLocation++, object: newLocationList, name: `${part.label}_extract_table` };
      
      const newTableList: TableEntry[] = [ newLocationTable ];

      for(let i = 1; i < tableList.length; i++) {
        const tableEntry = tableList[i];
        const oldLocation = tableEntry.location;

        const name = this._referenceManager.nameTable.get(oldLocation);
        if(!name) throw new Error(`Object name not found for location ${oldLocation}`);

        //Get entry object and value
        const entryObject = (tableEntry.object as any[])[0] as StructDef;
        const entryValue = entryObject.parts[valueIndex];
        
        //Remove value from entry object
        entryObject.parts.splice(valueIndex, 1);

        if(entryObject.parts.length === 1) tableEntry.object = entryObject.parts[0]!;

        //Generate value name
        const valueName = `${name}_value`;

        //Generate new value entry
        const valueTableEntry: TableEntry = { location: valueLocation, object: entryValue, name: valueName };

        //Cretae obj lookup entry
        objLookup[oldLocation] = { name, objLocation, valueLocation, object: tableEntry, value: valueTableEntry };

        //Add new value entry to new table
        newTableList.push(valueTableEntry);

        objLocation++;
        valueLocation++;
      }

      //Rewrite original table/name locations
      for(let i = 1; i < tableList.length; i++) {
        const tableEntry = tableList[i];
        const lookupObj = objLookup[tableEntry.location];
        tableEntry.location = lookupObj.objLocation;
        this._referenceManager.nameTable.set(lookupObj.objLocation, lookupObj.name);
      }

      //Rewrite original lookup table locations
      for(const wrapper of locationList) {
        const lookupObj = objLookup[wrapper.location];
        wrapper.location = lookupObj.objLocation;
        newLocationList.push(new LocationWrapper(lookupObj.valueLocation, AddressType.Offset));
      }

      //Write new table names to name table
      for(const table of newTableList) this._referenceManager.nameTable.set(table.location, table.name!);

      //Concatenate new table list to original table list
      tableList.push(...newTableList);
    }
  }

}

export default PostProcessor;

