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

  public async repack(allFiles: ChunkFile[]): Promise<Map<string, number>> {
    // Discover files
    //const allFiles = await this.discoverFiles(this.writer._projectRoot.baseDir);

    const patches : ChunkFile[] = [];
    const asmFiles : ChunkFile[] = [];
    const compression = this.writer.root.compression;
    const canCompress = !!compression;
    const conditionFiles : string[] = [];

    for (const file of allFiles) {
      if (file.type.type === "Patch") {
        patches.push(file);
      } else if (file.type.type !== "Assembly") {
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
        continue;
      }
      
      asmFiles.push(file);
      conditionFiles.push(file.name);
    }

    for(const file of asmFiles) {
      const assembler = new Assembler(this.writer.root, file.textData!, conditionFiles);
      const { blocks, includes, reqBank } = assembler.parseAssembly();
      file.parts = blocks;
      file.includes = includes;
      file.bank = reqBank ?? void 0;
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

    // Apply patches to asm blocks
    RomProcessor.applyPatches(asmFiles, patches);

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

    const masterLookup = new Map<string, number>();

    // Build include lookup map per asm file
    for (const f of asmFiles) {
      const includeBlocks = asmFiles
        .filter(x => f.includes?.has(x.name.toUpperCase()))
        .flatMap(x => x.parts!)
        .filter(b => !!b.label);

      f.includeLookup = new Map<string, AsmBlock>();

      //Add labels from include blocks
      for (const b of includeBlocks) {
        if (b.label) f.includeLookup.set(b.label.toUpperCase(), b);
      }

      //Add labels from current file
      for (const b of f.parts!) {
        if(b.label) {
          const nameUpper = b.label.toUpperCase();
          masterLookup.set(nameUpper, b.location);
          f.includeLookup.set(nameUpper, b);
        }
      }
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

  public static applyPatches(asmFiles: ChunkFile[], patches: ChunkFile[]): void {
    for (const patch of patches.filter(x => x.includes && x.includes.size > 0)) {
      let file: ChunkFile | null = null;
      let dstIx = -1;
      const inc = asmFiles.filter(x => patch.includes!.has(x.name.toUpperCase()));
      for (let ix = 0; patch.parts && ix < patch.parts.length;) {
        const block = patch.parts[ix];
        let match: any = null;
        if (block.label) { 
          for (const i of inc) {
            if (!i.parts) continue;
            for (let y = 0; y < i.parts.length; y++) {
              const check = i.parts[y];
              if (check.label === block.label) {
                file = i; 
                dstIx = y; 
                match = check;
                break;
              }
            }
          }
        }
        if (match) {
          file!.parts![dstIx++] = block;
        } else if (dstIx >= 0) {
          file!.parts!.splice(dstIx++, 0, block);
        } else { ix++; continue; }
        file!.includes = file!.includes || new Set();
        file!.includes.add(patch.name.toUpperCase());
        patch.parts!.splice(ix, 1);
      }
    }
  }
}


