import { BinType } from '../../types/resources';
import { ChunkFileUtils, type ChunkFile } from '../../types/files';
import { RomLayout } from './layout';
import { RomWriter } from './writer';
import { Assembler, RomProcessingConstants } from '../..';
import { DbRoot } from '../../database';
import { AsmBlock } from '../../types/assembly';

/**
 * ROM rebuild processor
 * Converted from ext/GaiaLib/Rom/Rebuild/RomProcessor.cs
 */
export class RomProcessor {
  private readonly writer: RomWriter;

  constructor(writer: RomWriter) {
    this.writer = writer;
  }

  public async repack(allFiles: ChunkFile[], modules?: string[]): Promise<Record<string, AsmBlock>> {
    // Discover files
    //const allFiles = await this.discoverFiles(this.writer._projectRoot.baseDir);

    const patches : ChunkFile[] = [];
    const asmFiles : ChunkFile[] = [];
    const compression = this.writer.root.compression;
    const canCompress = !!compression;
    const conditionFiles : string[] = [];

    if(modules) conditionFiles.push(...modules);
    
    const dummyMap: Record<string, number> = {};
    for (const file of allFiles) {
      conditionFiles.push(file.name);

      if (file.type.isPatch) { patches.push(file); asmFiles.push(file);} 
      else if (file.type.isBlock) asmFiles.push(file);
      else if (!file.struct) continue;
      
      const assembler = new Assembler(this.writer.root, file, conditionFiles);
      const { blocks, includes, reqBank } = assembler.parseAssembly();
      file.parts = blocks;
      file.includes = includes;
      file.bank = reqBank ?? void 0;

      if(file.struct) {
        file.includeLookup = {};
        for (const b of file.parts) {
          if(b.label) file.includeLookup[b.label.toUpperCase()] = b;
        }
        file.rawData = undefined;
        file.rawData = new Uint8Array(ChunkFileUtils.calculateSize(file));
        RomWriter.parseAssembly(this.writer.root, file.parts, dummyMap, file.includeLookup!, file.rawData!, file.base);
      }
    }

    for(const file of allFiles) {
      if(file.compressed === true && canCompress) {
        if(this.writer.root.config.uncompress){
          file.compressed = false;
        } else {
          let newData = compression!.compact(file.rawData!, file.type.header);
          if(file.type.header) newData = new Uint8Array([...file.rawData!.slice(0, file.type.header), ...newData]);
          file.rawData = newData;
          file.size = newData.length;
        }
      }
    }

    // const patches = allFiles.filter(x => x.type.type === 'Patch');
    // const asmFiles = allFiles.filter(x => !!x.parts);

    // //Assemble code that hasn't been assembled yet
    // for(const asm of asmFiles) {
    //   if(!asm.parts) {
    //     const assembler = new Assembler(this.writer.root, asm.textData!);
    //     const { blocks, includes, reqBank } = assembler.parseAssembly();
    //     asm.parts = blocks;
    //     asm.includes = includes;
    //     asm.bank = reqBank ?? undefined;
    //   }
    // }

    // Assembly processing now happens in project.ts via ChunkBlockReader.analyzeAndResolveChunks()
    // This provides comprehensive cross-referencing and object graph generation

    const masterLookup: Record<string, AsmBlock> = {};

    // Build include lookup map per asm file
    for (const f of asmFiles) {
      // const includeBlocks = asmFiles
      //   .filter(x => f.includes?.has(x.name.toUpperCase()))
      //   .flatMap(x => x.parts!)
      //   .filter(b => !!b.label);

      f.includeLookup = masterLookup;

      // //Add labels from include blocks
      // for (const b of includeBlocks) {
      //   let label = b.label;
      //   if (label) {
      //     if (label[label.length - 1] === '!') label = label.slice(0, -1);
      //     f.includeLookup.set(label.toUpperCase(), b);
      //   }
      // }

      //Add labels from current file
      for (const b of f.parts!) {
        let label = b.label;
        if (label) {
          const isOverride = f.type.isPatch && RomProcessingConstants.OVERRIDE_CHARS.includes(label[label.length - 1]);
          if(isOverride) label = label.slice(0, -1);

          label = label.toUpperCase();
          if (masterLookup[label]) {
            if (!isOverride) throw new Error(`Duplicate label in ${f.name}: ${label}`);
          } else if (isOverride) {
            //This will be handled by the patch processor
            //throw new Error(`Label not found to override in ${f.name}: ${label}`);
          } else {
            masterLookup[label] = b;
          }
          //f.includeLookup.set(label, b);
        }
      }
    }

    // Apply patches to asm blocks
    RomProcessor.applyPatches(asmFiles, patches, masterLookup);

    // Calculate ASM sizes
    for (const file of allFiles) ChunkFileUtils.calculateSize(file);

    // Assign locations
    const layout = new RomLayout(allFiles, this.writer.root);
    const pages = layout.organize();

    // Rebase assemblies
    for (const file of asmFiles) ChunkFileUtils.rebase(file);

    // Create block lookup for resolving labels to locations
    const fileLookup: Record<string, number> = {};
    for (const f of allFiles) fileLookup[f.name.toUpperCase()] = f.location;
    
    //Allocate memory for the ROM
    this.writer.allocate(pages);

    // Write all files
    for (const file of allFiles) await this.writer.writeFile(file, fileLookup);

    return masterLookup;
  }

  public static applyPatches(asmFiles: ChunkFile[], patches: ChunkFile[], masterLookup: Record<string, AsmBlock>): void {
    for (const patch of patches) {
      if(!patch.parts) continue;


      //Separate top level code from the rest of the patch
      let topIx = 0;
      while (topIx < patch.parts.length) {
        const label = patch.parts[topIx].label;
        if(label && RomProcessingConstants.OVERRIDE_CHARS.includes(label[label.length - 1])) break;
        topIx++;
      }

      const rewriteParts = patch.parts.slice(topIx);
      patch.parts = patch.parts.slice(0, topIx);
      
      let file = patch;
      let dstIx = -1;

      //Process rewrite parts in their own list/loop
      for (const newPart of rewriteParts) {
        let label = newPart.label!;
        const lastChar = label[label.length - 1];

        //Handle rewrite commands
        if (RomProcessingConstants.OVERRIDE_CHARS.includes(lastChar)) {
          label = label.slice(0, -1).toUpperCase();
          const match = masterLookup[label];
          if(!match) throw new Error(`Patch ${patch.name} contains a rewrite that does not exist: ${label}`);

          file = match.file!;
          dstIx = file.parts!.indexOf(match);

          switch (lastChar) {
            case '!':
              masterLookup[label] = newPart;
              file.parts![dstIx++] = newPart;
              newPart.file = file;
              continue;
            case '+': dstIx++;
            case '-': 
              if (match.objList[match.objList.length - 1].isDelimiter) {
                if (lastChar === '+') {
                  const delimiter = match.objList.pop();
                  match.objList.push(...newPart.objList);
                  match.size += newPart.size;
                  if (!match.objList[match.objList.length - 1].isDelimiter) match.objList.push(delimiter);
                  else match.size--;
                }
                else { 
                  if (newPart.objList[newPart.objList.length - 1].isDelimiter) {
                    newPart.objList.pop();
                    newPart.size--;
                  }
                  match.objList.unshift(...newPart.objList);
                  match.size += newPart.size;
                }
                newPart.file = file;
                continue;
              }
              break;
          }
        }

        file.parts!.splice(dstIx++, 0, newPart);
        newPart.file = file;
      }
    }
  }
}


