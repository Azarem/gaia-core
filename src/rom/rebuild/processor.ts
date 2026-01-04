import { BinType } from '../../types/resources';
import { ChunkFileUtils, type ChunkFile } from '../../types/files';
import { RomLayout } from './layout';
import { RomWriter } from './writer';
import { Assembler } from '../..';
import { DbRoot } from '../../database';

/**
 * ROM rebuild processor
 * Converted from ext/GaiaLib/Rom/Rebuild/RomProcessor.cs
 */
export class RomProcessor {
  private readonly writer: RomWriter;

  constructor(writer: RomWriter) {
    this.writer = writer;
  }

  public async repack(allFiles: ChunkFile[]): Promise<void> {
    // Discover files
    //const allFiles = await this.discoverFiles(this.writer._projectRoot.baseDir);

    const patches : ChunkFile[] = [];
    const asmFiles : ChunkFile[] = [];

    for (const file of allFiles) {
      if (file.type.type === "Patch") {
        patches.push(file);
      } else if (file.type.type !== "Assembly") {
        continue;
      }
      
      asmFiles.push(file);

      if(!file.parts) {
        const assembler = new Assembler(this.writer.root, file.textData);
        const { blocks, includes, reqBank } = assembler.parseAssembly();
        file.parts = blocks;
        file.includes = includes;
        file.bank = reqBank ?? void 0;
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

    // Apply patches to asm blocks
    RomProcessor.applyPatches(asmFiles, patches);

    // Calculate ASM sizes
    for (const file of allFiles) {
      ChunkFileUtils.calculateSize(file);
    }

    // Assign locations
    const layout = new RomLayout(allFiles);
    layout.organize();

    // Rebase assemblies
    for (const file of asmFiles) {
      ChunkFileUtils.rebase(file);
    }

    // Build include lookup map per asm file
    for (const f of asmFiles) {
      const includeBlocks = asmFiles
        .filter(x => f.includes?.has(x.name.toUpperCase()))
        .flatMap(x => x.parts!)
        .filter(b => !!b.label);

      f.includeLookup = new Map();

      for (const b of includeBlocks) {
        if (b.label) f.includeLookup.set(b.label.toUpperCase(), b);
      }

      for (const b of (f.parts || []).filter(x => !!x.label)) {
        if (b.label) f.includeLookup.set(b.label.toUpperCase(), b);
      }
    }

    // Create block lookup for resolving labels to locations
    const blockLookup = new Map<string, number>();
    for (const f of allFiles) {
      blockLookup.set(f.name.toUpperCase(), f.location);
    }

    // Write all files
    for (const file of allFiles) {
      await this.writer.writeFile(file, blockLookup);
    }
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


