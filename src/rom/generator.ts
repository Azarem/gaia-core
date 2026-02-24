import { crc32_buffer } from '../utils';
import { DbRoot, DbEntryPoint, DbRootUtils } from '../database';
import { ChunkFile, ChunkFileUtils } from '../types/files';
import { BinType } from '../types/resources';
import { summaryFromSupabaseByProject } from '../supabase/rom-loader';
import { BlockReader, BlockWriter } from './extraction';
import { RomLayout, RomProcessor, Assembler, RomWriter } from './rebuild';

export class RomGenerator {
  //private readonly patchFiles: ChunkFile[] = [];
  public readonly projectName?: string;
  public crc: number = 0;
  public branchId: string = '';
  //private chunkFiles: ChunkFile[] = [];
  //private asmFiles: ChunkFile[] = [];
  public dbRoot: DbRoot = {} as DbRoot;
  private sourceData: Uint8Array = new Uint8Array();

  constructor(projectName?: string) {
    this.projectName = projectName;
  }

  public async initialize(){
    var projectData = await summaryFromSupabaseByProject(this.projectName);
    this.crc = projectData.baseRomBranch.gameRomBranch.gameRom.crc;
    this.branchId = projectData.id;
  }

  // public async validateAndDownload(sourceData: Uint8Array){
  //   const calc = crc32_buffer(sourceData);
  //   if (calc === this.crc) {
  //       //Initialize database
  //       this.dbRoot = await DbRootUtils.fromSupabaseProject(this.projectName, this.branchId);
  //       this.sourceData = sourceData;
  //       return true;
  //   }
  //   return false;
  // }

  public async generateProject(modules: string[], manualFiles?: ChunkFile[], unshiftManualFiles: boolean = false): Promise<Uint8Array> {
    if(!this.dbRoot) throw new Error('Database not initialized');
    if(!this.sourceData) throw new Error('Source data not initialized');

    //Initialize chunks
    const reader = new BlockReader(this.sourceData, this.dbRoot);
    const chunkFiles = reader.analyzeAndResolve();
    const asmFiles = chunkFiles.filter(b => b.type.type === 'Assembly');
    const patchFiles: ChunkFile[] = [];

    //Convert asm blocks to text
    const writer = new BlockWriter(reader);
    for(const block of asmFiles) block.textData = writer.generateAsm(block);
    
    //Apply baserom files
    for (const chunkFile of this.dbRoot.baseRomFiles!) this.applyPatchFile(chunkFile, chunkFiles, asmFiles, patchFiles);

    //Apply base project files and collect module files
    const moduleLookup = this.applyProjectInit(chunkFiles, asmFiles, patchFiles);

    //Apply manual files (before modules)
    if(unshiftManualFiles) {
      for(const file of manualFiles ?? []) this.applyPatchFile(file, chunkFiles, asmFiles, patchFiles);
    }

    //Apply selected modules
    for(const module of modules) {
      for(const file of moduleLookup.get(module)!) this.applyPatchFile(file, chunkFiles, asmFiles, patchFiles);
    }

    //Apply manual files
    if(!unshiftManualFiles) {
      for(const file of manualFiles ?? []) this.applyPatchFile(file, chunkFiles, asmFiles, patchFiles);
    }
    
    this.assembleCodeFromText(asmFiles);

    //Apply code patches
    RomProcessor.applyPatches(asmFiles, patchFiles);

    //Calculate sizes
    for (const asm of chunkFiles) ChunkFileUtils.calculateSize(asm);

    //Assign locations
    const layout = new RomLayout(chunkFiles, this.dbRoot);
    const pages = layout.organize();

    //Rebase assemblies
    for (const file of asmFiles) ChunkFileUtils.rebase(file);

    this.generateAsmIncludeLookups(asmFiles);

    //Generate block lookup
    const blockLookup = new Map<string, number>();
    for (const f of chunkFiles) blockLookup.set(f.name.toUpperCase(), f.location);

    const outRom = await this.writeRom(blockLookup, chunkFiles, asmFiles, pages);
    return outRom;
  }

  private applyProjectInit(chunkFiles: ChunkFile[], asmFiles: ChunkFile[], patchFiles: ChunkFile[]){
    const moduleLookup: Map<string, ChunkFile[]> = new Map();

    //Run a single pass to collect all the module files, and apply base files
    for (const chunkFile of this.dbRoot.projectFiles!) {
      // Parse the patch file with the assembler
      console.log(`Processing patch: ${chunkFile.name}`);

      //ChunkFile.group is the module name
      if(chunkFile.group){
        let modArray: ChunkFile[];
        if(!moduleLookup.has(chunkFile.group)) moduleLookup.set(chunkFile.group, modArray = []);
        else modArray = moduleLookup.get(chunkFile.group)!;
        //Add chunk file to module array
        modArray!.push(chunkFile);
      } else this.applyPatchFile(chunkFile, chunkFiles, asmFiles, patchFiles); //If chunk file is not part of a group, apply it now
    }

    return moduleLookup;
  }

  //Assemble code from script text
  private assembleCodeFromText(asmFiles: ChunkFile[]){
    for(const block of asmFiles) {
      const assembler = new Assembler(this.dbRoot, block.textData!);
      const { blocks, includes, reqBank } = assembler.parseAssembly();
      block.parts = blocks;
      block.includes = includes;
      block.bank = reqBank ?? undefined;
    }
  }

  // Build include lookup map per asm file
  private generateAsmIncludeLookups(asmFiles: ChunkFile[]){
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
  }

  public applyPatchFile(chunkFile: ChunkFile, chunkFiles: ChunkFile[], asmFiles: ChunkFile[], patchFiles: ChunkFile[]): void {
    console.log(`Processing patch: ${chunkFile.name}`);
    const existing = chunkFiles.find(x => x.name === chunkFile.name);

    if(chunkFile.textData) {
      if(existing){
        existing.textData = chunkFile.textData;
      } else {
        if(chunkFile.type.type === 'Patch') {
          patchFiles.push(chunkFile);
        }
        asmFiles.push(chunkFile);
        chunkFiles.push(chunkFile);
      }
    } else {
      if(existing){
        existing.rawData = chunkFile.rawData;
        existing.size = chunkFile.size;
      } else {
        chunkFiles.push(chunkFile);
      }
    }
  }

  private async writeRom(blockLookup: Map<string, number>, chunkFiles: ChunkFile[], asmFiles: ChunkFile[], pages: number){
    //Create rom writer
    const romWriter = new RomWriter(this.dbRoot, "GAIALABS", "01JG  ");

    romWriter.allocate(pages);

    // Write all files
    for (const file of chunkFiles) await romWriter.writeFile(file, blockLookup);

    //Write header
    romWriter.writeHeader();

    //Write entry points
    romWriter.writeEntryPoints(asmFiles);

    //Write checksum
    romWriter.writeChecksum();

    return romWriter.outBuffer;
  }
}