import { BinType } from '../../types/resources';
import { ChunkFileUtils, type ChunkFile } from '../../types/files';
import { RomLayout } from './layout';
import { RomWriter } from './writer';
import { Assembler, RomProcessingConstants } from '../..';
import { DbRoot } from '../../database';
import { AsmBlock } from '../../types/assembly';
import type { TypedNumber } from '../../types/operands';

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
      f.includeLookup = masterLookup;

      //Add labels from current file
      for (const b of f.parts!) {
        let label = b.label;
        if (label) {
          const override = f.type.isPatch ? RomProcessingConstants.parseOverride(label) : null;
          const isOverride = !!override;
          if(override) label = override.name;

          label = label.toUpperCase();
          if (masterLookup[label]) {
            if (!isOverride) throw new Error(`Duplicate label in ${f.name}: ${label}`);
          } else if (isOverride) {
            //This will be handled by the patch processor
            //throw new Error(`Label not found to override in ${f.name}: ${label}`);
          } else {
            masterLookup[label] = b;
          }
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
        if(RomProcessingConstants.parseOverride(patch.parts[topIx].label)) break;
        topIx++;
      }

      const rewriteParts = patch.parts.slice(topIx);
      patch.parts = patch.parts.slice(0, topIx);
      
      let file = patch;
      let dstIx = -1;

      //Process rewrite parts in their own list/loop
      for (const newPart of rewriteParts) {
        const override = RomProcessingConstants.parseOverride(newPart.label);

        //Handle rewrite commands
        if (override) {
          const label = override.name.toUpperCase();
          const match = masterLookup[label];
          if(!match) throw new Error(`Patch ${patch.name} contains a rewrite that does not exist: ${label}`);

          file = match.file!;
          dstIx = file.parts!.indexOf(match);

          switch (override.kind) {
            case 'bytes':
              RomProcessor.replaceBytes(patch, match, newPart, override.offset);
              dstIx++;
              continue;
            case 'replace':
              masterLookup[label] = newPart;
              file.parts![dstIx++] = newPart;
              newPart.file = file;
              continue;
            case 'head':
            case 'tail':
              //Content is merged into the target block; the replacement part is consumed.
              //Chained inserts that follow land before (head) or after (tail) the target block.
              RomProcessor.insertAtEnd(match, newPart, override.kind === 'tail');
              if (override.kind === 'tail') dstIx++;
              continue;
            case 'after':
            case 'before':
              //Pure insert: falls through to the splice below as a separate part
              if (match.objList[match.objList.length - 1]?.isDelimiter) {
                console.warn(
                  `Patch ${patch.name}: '${newPart.label}' is spliced ${override.kind} '${match.label}', which ends with a delimiter. ` +
                  `Use '${override.name}${override.kind === 'after' ? '+=' : '-='}' (or '.${override.kind === 'after' ? 'append' : 'prepend'}') to merge into the list instead.`
                );
              }
              if (override.kind === 'after') dstIx++;
              break;
          }
        }

        file.parts!.splice(dstIx++, 0, newPart);
        newPart.file = file;
      }
    }
  }

  /**
   * Applies a head (`Label-=` / `Label.prepend`) or tail (`Label+=` / `Label.append`) override.
   *
   * The replacement's objects are merged into the start or end of the target block, which stays
   * in place. A trailing delimiter (array/struct terminator) is never left in the middle of the
   * target: it is detached from both blocks and, if either had one, a single delimiter is
   * re-attached at the end of the target.
   *
   * - Tail: the replacement's delimiter wins over the target's.
   * - Head: the target's delimiter wins over the replacement's.
   *
   * The target size is adjusted by the bytes actually added/removed.
   */
  private static insertAtEnd(target: AsmBlock, replacement: AsmBlock, atTail: boolean): void {
    const targetDelimiter = RomProcessor.detachDelimiter(target);
    const replacementDelimiter = RomProcessor.detachDelimiter(replacement);

    if (atTail) target.objList.push(...replacement.objList);
    else target.objList.unshift(...replacement.objList);
    target.size += replacement.size;

    const delimiter = atTail
      ? replacementDelimiter ?? targetDelimiter
      : targetDelimiter ?? replacementDelimiter;

    if (delimiter) {
      target.objList.push(delimiter);
      target.size += delimiter.size;
    }
  }

  /**
   * Removes and returns the block's trailing delimiter (if any), deducting its size from the block.
   */
  private static detachDelimiter(block: AsmBlock): TypedNumber | undefined {
    const last = block.objList[block.objList.length - 1];
    if (!last?.isDelimiter) return undefined;

    block.objList.pop();
    block.size -= last.size;
    return last;
  }

  /**
   * Applies a `Label#offset` / `Label.at(offset)` byte-replacement override.
   *
   * The replacement block's content overwrites `replacement.size` bytes of the target block,
   * starting `offset` bytes into it. Target data is stored as discrete objects (instructions,
   * words, strings, pointers...), so any object that is only partially covered by the range
   * is swallowed whole by the replacement. Consequently the target block's size changes by
   * (replacement size - bytes actually removed) whenever the range does not fall on object
   * boundaries.
   */
  private static replaceBytes(patch: ChunkFile, target: AsmBlock, replacement: AsmBlock, offset: number): void {
    const label = replacement.label;
    const length = replacement.size;
    if (length <= 0) throw new Error(`Patch ${patch.name} byte replacement '${label}' has no content`);

    const start = offset;
    const end = offset + length;
    if (end > target.size) {
      throw new Error(
        `Patch ${patch.name} byte replacement '${label}' covers 0x${start.toString(16).toUpperCase()}-0x${(end - 1).toString(16).toUpperCase()} ` +
        `but target block is only 0x${target.size.toString(16).toUpperCase()} bytes`
      );
    }

    // Find the contiguous run of sized objects overlapping [start, end)
    let pos = 0;
    let first = -1;
    let last = -1;
    let removed = 0;
    for (let i = 0; i < target.objList.length && pos < end; i++) {
      const size = RomProcessingConstants.getSize(target.objList[i]);
      if (size > 0 && pos + size > start) {
        if (first < 0) first = i;
        last = i;
        removed += size;
      }
      pos += size;
    }

    if (first < 0) throw new Error(`Patch ${patch.name} byte replacement '${label}' does not overlap any data in the target block`);

    target.objList.splice(first, last - first + 1, ...replacement.objList);
    target.size += length - removed;
  }
}


