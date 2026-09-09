import { BinType } from '../../types/resources';
import { ChunkFileUtils, type ChunkFile } from '../../types/files';
import { RomLayout } from './layout';
import { RomWriter } from './writer';
import { Assembler } from '../..';
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

  public async repack(allFiles: ChunkFile[], modules?: string[]): Promise<Map<string, AsmBlock>> {
    // Discover files
    //const allFiles = await this.discoverFiles(this.writer._projectRoot.baseDir);

    const patches : ChunkFile[] = [];
    const asmFiles : ChunkFile[] = [];
    const compression = this.writer.root.compression;
    const canCompress = !!compression;
    const conditionFiles : string[] = [];

    if(modules) conditionFiles.push(...modules);
    
    const dummyMap = new Map<string, number>();
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
        file.includeLookup = new Map<string, AsmBlock>();
        for (const b of file.parts) {
          if(b.label) file.includeLookup.set(b.label.toUpperCase(), b);
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

    const masterLookup = new Map<string, AsmBlock>();

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
          //const lastChar = label[label.length - 1];
          //const isOverride = lastChar === '!' || lastChar === '+' || lastChar === '-';
          //if (label[label.length - 1] === '!') label = label.slice(0, -1);
          label = label.toUpperCase();
          if(masterLookup.get(label)) throw new Error(`Duplicate label: ${b.label}`);
          masterLookup.set(label, b);
          //f.includeLookup.set(label, b);
        }
      }
    }

    // Apply patches to asm blocks
    RomProcessor.applyPatches(asmFiles, patches, masterLookup);

    // Calculate ASM sizes
    for (const file of allFiles) {
      ChunkFileUtils.calculateSize(file);
    }

    // Assign locations
    const layout = new RomLayout(allFiles, this.writer.root);
    const pages = layout.organize();

    // Rebase assemblies
    for (const file of asmFiles) {
      ChunkFileUtils.rebase(file);
    }


    // Create block lookup for resolving labels to locations
    const fileLookup = new Map<string, number>();
    for (const f of allFiles) fileLookup.set(f.name.toUpperCase(), f.location);
    
    //Allocate memory for the ROM
    this.writer.allocate(pages);

    // Write all files
    for (const file of allFiles) {
      await this.writer.writeFile(file, fileLookup);
    }

    return masterLookup;
  }

  public static applyPatches(asmFiles: ChunkFile[], patches: ChunkFile[], masterLookup: Map<string, AsmBlock>): void {
    for (const patch of patches) { //.filter(x => x.includes && x.includes.size > 0)) {
      let file: ChunkFile | null = null;
      let dstIx = -1;
      //const inc = asmFiles.filter(x => !.has(x.name.toUpperCase()));
      for (let ix = 0; patch.parts && ix < patch.parts.length;) {
        const block = patch.parts[ix];
        let match: any = null;
        let adjust = 0;
        let force = false;
        let label = block.label;

        if (label) {
          if (label[label.length - 1] === '!') {
            force = true;
            label = label.slice(0, -1);
          }
          const adjustIx = label.search(/[-+]$/)
          if(adjustIx > 0) {
            adjust = label[adjustIx] === '+' ? 1 : -1;
            label = label.slice(0, adjustIx);
          }
          match = masterLookup.get(label.toUpperCase());

          // for (const i of inc) {
          //   if (!i.parts) continue;
          //   for (let y = 0; y < i.parts.length; y++) {
          //     const check = i.parts[y];
          //     if (check.label === label) {
          //       file = i; 
          //       dstIx = y; 
          //       match = check;
          //       break;
          //     }
          //   }
          // }
        }

        if (match && match.file !== patch) {
          file = match.file;
          dstIx = match.file.parts!.indexOf(match);
          if(adjust !== 0) {
            if(adjust > 0) dstIx++;
            file!.parts!.splice(dstIx++, 0, block);
          } else {
            masterLookup.set(label!.toUpperCase(), block);
            file!.parts![dstIx++] = block;
          }
        } else if (force || adjust !== 0) {
          throw new Error(`Patch ${patch.name} contains a rewrite that does not exist: ${label}`);
        } else if (dstIx >= 0) {
          file!.parts!.splice(dstIx++, 0, block);
        } else { ix++; continue; }
        // if(!file!.includes) file!.includes = new Set();
        // file!.includes.add(patch.name.toUpperCase());
        //for(const include of patch.includes!) file!.includes.add(include);
        patch.parts!.splice(ix, 1);
        block.file = file!;
      }
    }
  }
}


