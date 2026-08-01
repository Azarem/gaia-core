import { crc32_buffer } from '../utils';
import { DbRoot, DbRootUtils } from '../database';
import { ChunkFile } from '../types/files';
import { BlockReader, BlockWriter } from './extraction';
import { RomWriter } from './rebuild';
import { fromSupabaseByProject } from '../supabase/rom-loader';
import { DbGameRomModule } from '../database/modules';
import { listDirectory } from '../utils/file';

export class RomGenerator {
  public readonly projectName: string;
  public readonly crc: number;
  public dbRoot: DbRoot = {} as DbRoot;
  private sourceData: Uint8Array = new Uint8Array();

  constructor(projectName: string, crc: number) {
    this.projectName = projectName;
    this.crc = crc;
  }

  public async validateAndLoad(sourceData: Uint8Array, gameModule: DbGameRomModule, baseRomPath: string, modulePath: string): Promise<boolean> {
    const calc = crc32_buffer(sourceData);
    if(this.crc !== calc) return false;
    
    this.dbRoot = DbRootUtils.fromGameModule(gameModule);

    let moduleFiles: ChunkFile[] = [];
    for(const entry of await listDirectory(modulePath)) {
      if(!entry.isDirectory) continue;
      moduleFiles.push(...await DbRootUtils.applyFolder(this.dbRoot, entry.path, [], entry.name));
    }

    //const moduleData = await fromSupabaseByProject(this.projectName);
    this.dbRoot.baseRomFiles = await DbRootUtils.applyFolder(this.dbRoot, baseRomPath);
    this.dbRoot.projectFiles = moduleFiles;
    this.sourceData = sourceData;
    return true;
  }

  public async validateAndDownload(sourceData: Uint8Array): Promise<boolean> {
    const calc = crc32_buffer(sourceData);
    if(this.crc !== calc) return false;

    const moduleData = await fromSupabaseByProject(this.projectName);
    this.dbRoot = DbRootUtils.fromGameModule(moduleData);
    this.sourceData = sourceData;
    return true;
  }

  public async generateProject(modules: string[], manualFiles?: ChunkFile[], unshiftManualFiles: boolean = false): Promise<Uint8Array> {
    if(!this.dbRoot) throw new Error('Database not initialized');
    if(!this.sourceData) throw new Error('Source data not initialized');

    //Initialize chunks
    const reader = new BlockReader(this.sourceData, this.dbRoot);
    const chunkFiles = reader.analyzeAndResolve();
    const asmFiles = chunkFiles.filter(b => b.parts?.length);
    const patchFiles: ChunkFile[] = [];

    //Convert asm blocks to text
    const writer = new BlockWriter(reader);
    for(const block of chunkFiles) {
      if(block.parts?.length) block.textData = writer.generateAsm(block);
    }

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

    const romWriter = new RomWriter(this.dbRoot);
    const outRom = await romWriter.repack(chunkFiles, modules);

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
        let modArray = moduleLookup.get(chunkFile.group);
        if(!modArray) moduleLookup.set(chunkFile.group, modArray = []);
        modArray.push(chunkFile);
      } else this.applyPatchFile(chunkFile, chunkFiles, asmFiles, patchFiles); //If chunk file is not part of a group, apply it now
    }

    return moduleLookup;
  }

  public applyPatchFile(chunkFile: ChunkFile, chunkFiles: ChunkFile[], asmFiles: ChunkFile[], patchFiles: ChunkFile[]): void {
    console.log(`Processing patch: ${chunkFile.name}`);
    const existing = chunkFiles.find(x => x.name === chunkFile.name);

    if(chunkFile.textData) {
      if(existing){
        existing.textData = chunkFile.textData;
      } else {
        if(chunkFile.type.isPatch) {
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
}