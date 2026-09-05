import { BinType } from '../types/resources';
import type { ICompressionProvider } from '../types/compression';
import { DbBlock } from './blocks';
import type { DbConfig } from './config';
import type { DbEntryPoint } from './entrypoints';
import { DbFile, DbFileType } from './files';
import { DbOverride } from './overrides';
import { DbStruct } from './structs';
import { DbAddressingMode } from './addressingMode';
import { DbStringType, DbStringCommand, DbStringLayer, DbStringDictionary } from './strings';
import { CopDef } from './cop';
import { listDirectory, readFileAsBinary, readJsonFile, saveFileAsText, saveFileAsBinary, readFileAsText } from '../utils';
import type { DbMnemonic } from './mnemonics';
import type { DbRewrite } from './rewrites';
import { DbPart } from './parts';
import type { DbLabel } from './labels';
import { DbTransform } from './transforms';
import type { BaseRomFileData, ProjectFileData, ProjectPayload } from '../supabase/types';
import { OpCode } from './opcode';
import { fromSupabaseByProject, fromSupabaseByGameRom } from '../supabase/rom-loader';
import { RomProcessingConstants } from '../types/constants';
import { MemoryMapMode } from '../types/addressing';
import { ChunkFile } from '../types/files';
import { DbScene } from './scenes';
import { DbGroup } from './groups';
import { DbAsset } from './assets';
import { CompressionAlgorithms } from '../compression';
import { DbBaseRomModule, DbGameRomModule, DbProjectModule } from './modules';
import { BlockWriter } from '../rom/extraction/writer';
import { BlockReader } from '../rom/extraction/blocks';
import { RomWriter } from '../rom/rebuild/writer';
import { DbHeader } from './header';

/**
 * Main database root class
 * Converted from GaiaLib/Database/DbRoot.cs
 */
export interface DbRoot {
  copDef: Record<number, CopDef>;
  copLookup: Record<string, CopDef>;
  mnemonics: Record<number, string>;
  mnemonicsLookup: Record<string, string>;
  //paths: Record<BinType, DbPath>;
  structs: Record<string, DbStruct>;
  stringTypes: Record<string, DbStringType>;
  stringDelimiters: string[];
  stringDelimiterLookup: Record<string, DbStringType>;
  //stringCharLookup: Record<string, DbStringType>;
  headers: DbHeader[];
  files: DbFile[];
  config: DbConfig;
  blocks: DbBlock[];
  overrides: Record<number, Record<string, any>>;
  labels: Record<number, string>;
  rewrites: Record<number, number>;
  entryPoints: DbEntryPoint[];
  opCodes: Record<number, OpCode>;
  opLookup: Record<string, OpCode[]>;
  addrLookup: Record<string, DbAddressingMode>;
  compression?: ICompressionProvider;
  baseRomFiles?: ChunkFile[];
  projectFiles?: ChunkFile[];
  groups: Record<string, DbGroup>;
  scenes: Record<number, DbScene>;
  fileTypes: Record<string, DbFileType>;
  fileExtLookup: Record<string, DbFileType>;
  names: Record<number, string>;
}

/**
 * Database root utilities
 */
export class DbRootUtils {
  /**
   * JSON serialization options
   */
  // public static readonly JSON_OPTIONS = {
  //   propertyNamingPolicy: 'camelCase',
  //   readCommentHandling: 'skip',
  //   writeIndented: true
  // };

  // /**
  //  * Load database from a single file
  //  */
  // // public static async fromFile(dbFilePath: string): Promise<DbRoot> {
  // //   return await readJsonFile<DbRoot>(dbFilePath);
  // // }

  // public static async fromFolder(folderPath: string, systemPath: string) : Promise<DbRoot> {
  //   return this.fromGameModule(await this.gameModuleFromFolder(folderPath, systemPath));
  // }

  // /**
  //  * Load database from folder structure
  //  */
  // public static async gameModuleFromFolder(folderPath: string, systemPath: string): Promise<DbGameRomModule> {
  //   return {
  //     mnemonics: await readJsonFile<Record<number, string>>(`${folderPath}/mnemonics.json`),
  //     overrides: await readJsonFile<Record<number, Record<string, any>>>(`${folderPath}/overrides.json`),
  //     rewrites: await readJsonFile<Record<string, number>>(`${folderPath}/rewrites.json`),
  //     blocks: await readJsonFile<Record<string, Record<string, Partial<DbBlock>>>>(`${folderPath}/blocks.json`),
  //     files: await readJsonFile<Record<string, Record<string, Record<string, Partial<DbFile>>>>>(`${folderPath}/files.json`),
  //     config: await readJsonFile<DbConfig>(`${folderPath}/config.json`),
  //     labels: await readJsonFile<DbLabel[]>(`${folderPath}/labels.json`),
  //     structs: await readJsonFile<Record<string, DbStruct>>(`${folderPath}/structs.json`),
  //     copdef: await readJsonFile<Record<string, Partial<CopDef>>>(`${folderPath}/copdef.json`),
  //     addrModes: await readJsonFile<Record<string, Partial<DbAddressingMode>>>(`${systemPath}/addressingModes.json`),
  //     strings: await readJsonFile<Record<string, Partial<DbStringType>>>(`${folderPath}/stringTypes.json`),
  //     transforms: await readJsonFile<Record<string, Partial<DbTransform>[]>>(`${folderPath}/transforms.json`),
  //     groups: await readJsonFile<Record<string, Partial<DbGroup>>>(`${folderPath}/groups.json`),
  //     fileTypes: await readJsonFile<Record<string, Partial<DbFileType>>>(`${folderPath}/fileTypes.json`),
  //   }
  // }

  public static fromGameModule(module: DbGameRomModule): DbRoot {
    // Build lookup tables

    const opCodes = {} as Record<number, OpCode>;
    const opLookup = {} as Record<string, OpCode[]>;
    const addrLookup = Object.entries(module.addrModes).reduce((acc, x) => {
      const modeData = x[1];
      const modeName = x[0];
      for(const [mnem, code] of Object.entries(modeData.instructions ?? [])) {
        const opCode = new OpCode(code, mnem, modeName);
        opCodes[code] = opCode;
        if (!opLookup[mnem]) opLookup[mnem] = [];
        opLookup[mnem].push(opCode);
      }
      acc[modeName] = new DbAddressingMode({...modeData, name: modeName});
      return acc;
    }, {} as Record<string, DbAddressingMode>);

    const blocksArray: DbBlock[] = [];
    for (const [groupName, groupData] of Object.entries(module.blocks)) {
      for(const [blockName, blockData] of Object.entries(groupData)) {

        let parts: DbPart[] = [];

        if (blockData.parts === undefined) {
          parts = [new DbPart({...blockData, name: blockName, order: undefined})];
        } else {
          const partsData = blockData.parts as unknown as Record<string, Partial<DbPart>> ?? {};
          parts = Object.entries(partsData).map((p) => {
            return new DbPart({...p[1], name: p[0]});
          });
        }

        const transformList = (module.transforms[blockName] ?? []).map((t) => {
          return new DbTransform(t);
        });

        const block = new DbBlock({
          ...blockData, 
          name: blockName, 
          group: groupName,
          parts: parts,
          transforms: transformList
        });

        blocksArray.push(block);
      }
    }

    const sceneLookup = {} as Record<number, DbScene>;
    const groupLookup = Object.entries(module.groups).reduce((acc, x) => {
      const groupData = x[1];
      const groupName = x[0];

      const scenes = Object.entries(groupData.scenes ?? {}).reduce((acc, y) => {
        const sceneData = y[1];
        const sceneName = y[0];
        const scene = new DbScene({...sceneData, name: sceneName });
        sceneLookup[scene.id] = scene;
        acc[sceneName] = scene;
        return acc;
      }, {} as Record<string, DbScene>);
      
      acc[groupName] = new DbGroup({...groupData, name: groupName, scenes: scenes });
      return acc;
    }, {} as Record<string, DbGroup>);

    const fileList: DbFile[] = [];
    for(const [groupName, groupData] of Object.entries(module.files)) {
      for(const [sceneName, sceneData] of Object.entries(groupData)) {
        for(const [fileName, fileData] of Object.entries(sceneData)) {
          fileList.push(new DbFile({...fileData, name: fileName, group: groupName, scene: sceneName }));
        }
      }
    }

    const stringDelimiterLookup = {} as Record<string, DbStringType>;
    const stringDelimiterList: string[] = [];
    const stringLookup = Object.entries(module.strings).reduce((acc, x) => {
      const stringType = x[1];
      const name = x[0];
      const commands = Object.entries(stringType.commands ?? {}).reduce((acc, y) => {
        acc[y[0]] = new DbStringCommand({...y[1], name: y[0]});
        return acc;
      }, {} as Record<string, DbStringCommand>);
      const dictionaries = Object.entries(stringType.dictionaries ?? {}).reduce((acc, y) => {
        const dictionary = new DbStringDictionary({...y[1], name: y[0]});
        acc[y[0]] = dictionary;
        if(dictionary.command !== undefined) {
          const existingCommand = Object.values(commands).find(z => z.id === dictionary.command);
          if (existingCommand) existingCommand.dictionary = dictionary;
          else {
            const name = dictionary.commandName ?? dictionary.command?.toString(16).padStart(2, '0').toUpperCase();
            commands[name] = new DbStringCommand({id: dictionary.command, name, dictionary, types: [ "Byte" ]});
          }
        }
        return acc;
      }, {} as Record<string, DbStringDictionary>);
      const st = new DbStringType({...stringType, name, commands, dictionaries});
      acc[name] = st;
      stringDelimiterLookup[st.delimiter] = st;
      stringDelimiterList.push(st.delimiter);
      return acc;
    }, {} as Record<string, DbStringType>);

    const structLookup = Object.entries(module.structs).reduce((acc, x) => {
      acc[x[0]] = new DbStruct({...x[1], name: x[0]});
      return acc;
    }, {} as Record<string, DbStruct>);


    const copCodes = {} as Record<number, CopDef>;
    const copLookup = Object.entries(module.copdef).reduce((acc, x) => {
      const copDef = x[1];
      const name = x[0];
      const def = new CopDef({...copDef, name});
      copCodes[def.id] = def;
      acc[name] = def;
      return acc;
    }, {} as Record<string, CopDef>);

    const extLookup = {} as Record<string, DbFileType>;
    const fileTypeLookup = {} as Record<string, DbFileType>;
    const fileTypes = Object.entries(module.fileTypes).reduce((acc, x) => {
      const fileType = x[1];
      const name = x[0];
      const type = new DbFileType({...fileType, name});
      extLookup[type.extension] = type;
      fileTypeLookup[type.name] = type;
      acc[name] = type;
      return acc;
    }, {} as Record<string, DbFileType>);

    const cfg = module.config;

    const compression = cfg.compression ? CompressionAlgorithms[cfg.compression]() : undefined;

    
    const baseRomChunks = (module as DbBaseRomModule).baseRomFiles ?? module.supaBaseRomFiles?.map((file: BaseRomFileData) => {
      const chunkFile = new ChunkFile(fileTypeLookup[file.type], file.name);
      if(file.isText) {
        chunkFile.textData = file.text ?? undefined;
        chunkFile.size = file.text?.length ?? 0;
      } else {
        chunkFile.rawData = file.data;
        chunkFile.size = file.data?.length ?? 0;
      }
      return chunkFile;
    });
    
    const projectChunks = (module as DbProjectModule).projectFiles ?? module.supaProjectFiles?.map((file: ProjectFileData) => {
      const chunkFile = new ChunkFile(fileTypeLookup[file.type], file.name);
      chunkFile.group = file.module ?? undefined;
      if(file.isText) {
        chunkFile.textData = file.text ?? undefined;
        chunkFile.size = file.text?.length ?? 0;
      } else {
        chunkFile.rawData = file.data;
        chunkFile.size = file.data?.length ?? 0;
      }
      return chunkFile;
    });

    // Build the database root
    const root: DbRoot = {
      headers: module.headers.map((h) => new DbHeader(h)),
      mnemonics: module.mnemonics,
      mnemonicsLookup: Object.entries(module.mnemonics).reduce((acc, x) => {
        const value = parseInt(x[0])
        acc[x[1]] = value.toString(16).toUpperCase().padStart(value <= 0xFF ? 2 : value <= 0xFFFF ? 4 : 6, '0');
        return acc;
      }, {} as Record<string, string>),
      overrides: module.overrides,
      rewrites: module.rewrites,
      labels: module.labels,
      names: module.names,
      structs: structLookup,
      blocks: blocksArray.sort((a, b) => {
        const orderA = a.order ?? 0;
        const orderB = b.order ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        return a.parts[0].start - b.parts[0].start;
      }),
      files: fileList,
      fileTypes,
      fileExtLookup: extLookup,
      copDef: copCodes,
      copLookup,
      config: cfg,
      opCodes,
      opLookup,
      addrLookup,
      entryPoints: cfg.entryPoints,
      stringTypes: stringLookup,
      stringDelimiters: stringDelimiterList,
      stringDelimiterLookup,
      compression,
      groups: groupLookup,
      scenes: sceneLookup,
      baseRomFiles: baseRomChunks,
      projectFiles: projectChunks
    };

    return root;
  }

  public static async applyFolder(root: DbRoot, folderPath: string, sourceFiles: ChunkFile[] = [], group?: string) : Promise<ChunkFile[]> {
    const chunkFiles = sourceFiles;
    const folderEntries = await listDirectory(folderPath, { recursive: true });
    for(const entry of folderEntries) {
      if(!entry.isFile || !entry.extension) continue; //await this.applyFolder(root, entry.path, chunkFiles);
    
      const type = root.fileExtLookup[entry.extension];
      if(!type) continue;

      const existing = chunkFiles.find(x => x.name === entry.name && x.type.type === type.type);
      const chunkFile = existing ?? new ChunkFile(type, entry.name);

      if(group) chunkFile.group = group;

      if(chunkFile.type.isBlock || chunkFile.type.isPatch || chunkFile.struct) {
        const chunkData = await readFileAsText(entry.path);
        chunkFile.textData = chunkData;
        chunkFile.size = chunkData.length;
      } else {
        const chunkData = await readFileAsBinary(entry.path);
        chunkFile.rawData = chunkData;
        chunkFile.size = chunkData.length;
      }
      if(!existing){
        const sourceFile = root.files.find(x => x.name === entry.name && x.type === type.name);
        if (sourceFile) {
          chunkFile.location = sourceFile.start;
          chunkFile.upper = sourceFile.upper ?? chunkFile.upper;
          chunkFile.compressed = sourceFile.compressed ?? chunkFile.compressed;
          chunkFile.base = sourceFile.base ?? chunkFile.base;
          chunkFile.upper = sourceFile.upper ?? chunkFile.upper;
        } else if (type.isBlock) {
          const sourceBlock = root.blocks.find(x => x.name === entry.name);
          if(sourceBlock) {
            chunkFile.location = sourceBlock.parts[0].start;
            chunkFile.upper = root.config.memoryMode === MemoryMapMode.Lo || (chunkFile.location & 0x8000) !== 0;
            chunkFile.base = sourceBlock.base ?? chunkFile.base;
          }
        } else if (type.isPatch) { 
          chunkFile.upper = true;
        }
        
        chunkFiles.push(chunkFile);
      }
    }
    return chunkFiles;
  }

  
  public static async extractAllContent(root: DbRoot, romPath: string, outPath: string) : Promise<void> {
    const romData = await readFileAsBinary(romPath);
    const reader = new BlockReader(romData, root);
    const chunkFiles = reader.analyzeAndResolve();
    const writer = new BlockWriter(reader);

    for(const block of chunkFiles) {
      const ext = block.type.extension;
      const filePath = `${outPath}/${block.group ? (block.group + '/') : ''}${block.scene ? (block.scene + '/') : ''}${block.name}${ext ? '.' + ext : ''}`;
      if(block.parts?.length) {
        block.textData = writer.generateAsm(block);
        await saveFileAsText(filePath, block.textData);
      } else {
        if (!block.rawData) continue;
        await saveFileAsBinary(filePath, block.rawData);
      }
    }
  }

  public static async rebuildAllContent(root: DbRoot, inPath: string[], outPath: string) : Promise<ChunkFile[]> {
    var sourceFiles: ChunkFile[] = [];
    for(const path of inPath) {
      sourceFiles = await this.applyFolder(root, path, sourceFiles);
    }

    const romWriter = new RomWriter(root);
    const outData = await romWriter.repack(sourceFiles);
    await saveFileAsBinary(outPath, outData);

    return sourceFiles;
  }


  // /**
  //  * Get path configuration for a resource type
  //  */
  // public static getPath(root: DbRoot, type: BinType): DbPath {
  //   return root.paths[type] || root.paths[BinType.Unknown];
  // }

  // /**
  //  * Get resource path for a file
  //  */
  // public static getResource(root: DbRoot, baseDir: string, name: string, type: BinType): string {
  //   const res = this.getPath(root, type);
  //   return `${baseDir}/${res.folder}/${name}.${res.extension}`;
  // }

  /**
   * Load database from Supabase using BaseRomBranch ID
   * @param baseRomBranchId - The ID of the BaseRomBranch to load
   * @returns Promise<DbRoot> containing the complete database root
   * @throws {Error} If the branch is not found or loading fails
   * 
   * @example
   * ```typescript
   * const dbRoot = await DbRootUtils.fromSupabaseById('clm1234567890');
   * console.log(dbRoot.files.length);
   * ```
   */
  // public static async fromSupabaseById(baseRomBranchId: string): Promise<DbRoot> {
  //   const payload = await fromSupabaseById(baseRomBranchId);
  //   return this.fromSupabasePayload(payload);
  // }

  /**
   * Load database from Supabase using name-based lookup
   * @param options - Options for name-based lookup (optional)
   * @returns Promise<DbRoot> containing the complete database root
   * @throws {Error} If the branch is not found or loading fails
   * 
   * @example
   * ```typescript
   * // Load default ROM (GaiaLabs BaseROM, main branch)
   * const dbRoot1 = await DbRootUtils.fromSupabase({});
   * 
   * // Load specific ROM and branch
   * const dbRoot2 = await DbRootUtils.fromSupabase({
   *   baseRomName: 'My Custom ROM',
   *   branchName: 'development',
   *   branchVersion: null
   * });
   * ```
   */
  // public static async fromSupabase(options?: FromSupabaseByNameOptions): Promise<DbRoot> {
  //   const payload = await fromSupabaseByName(options);
  //   return this.fromSupabasePayload(payload);
  // }

  // public static async fromSupabaseProject(projectName?: string, branchId?: string): Promise<DbRoot> {
  //   const payload = await fromSupabaseByProject(projectName, branchId);
  //   return this.fromSupabasePayload(payload);
  // }

  /**
   * Load database from GameRomBranch data (for ROM-only processing)
   * @param gameRomBranchData - Direct GameRomBranch data from Supabase API
   * @returns Promise<DbRoot> containing the complete database root
   */
  // public static async fromSupabaseGameRom(gameRomName?: string, branchId?: string): Promise<DbRoot> {
  //   const payload = await fromSupabaseByGameRom(gameRomName, branchId);
  //   return this.fromSupabasePayload(payload);
  // }

  /**
   * Convert Supabase payload to DbRoot structure
   * @private
   * @param payload - The ROM payload from Supabase
   * @returns DbRoot containing the processed database structure
   */
  // private static async fromSupabasePayload(payload: ProjectPayload): Promise<DbRoot> {
    
  //   // Extract data from the Supabase payload
  //   const gameRomBranch = payload.baseRomBranch.gameRomBranch;
    
  //   const config = gameRomBranch.config;
  //   const copDef = gameRomBranch.coplib;
  //   const romFiles = gameRomBranch.files;
  //   const romBlocks = gameRomBranch.blocks;
  //   const romStrings = gameRomBranch.strings;
  //   const romStructs = gameRomBranch.structs;
  //   const romFixups = gameRomBranch.fixups;
  //   const romScenes = gameRomBranch.scenes;

  //   const platformBranch = gameRomBranch.platformBranch;
  //   const instructionSet = platformBranch.instructionSet;
  //   const addressingModes = platformBranch.addressingModes;
  //   //const vectors = platformBranch.vectors;

  //   const transforms = romFixups.transforms || [];

  //   // Build configuration from available data
  //   const compression = config.compression ? CompressionAlgorithms[config.compression]() : null;
    
  //   const files: DbFile[] = Object.entries(romFiles).map((x: any) => {
  //     const file = x[1];
  //     file.start = file.location;
  //     file.end = file.location + file.size;
  //     //file.type = BinType[file.type as keyof typeof BinType] || BinType.Unknown;
  //     file.name = x[0];
  //     return file;
  //   });
    
  //   const blocks: DbBlock[] = Object.entries(romBlocks).map((x: any) => {
  //     const block = x[1];
  //     block.name = x[0];

  //     const transform = transforms[block.name];
  //     block.transforms = transform ? Object.entries(transform).map((t: any) => { return { key: t[0], value: t[1] } }) : [];
      
  //     block.parts = Object.entries(block.parts)
  //       .sort((a: any, b: any) => {
  //         const orderA = a[1].order ?? 0;
  //         const orderB = b[1].order ?? 0;
  //         if (orderA !== orderB) {
  //           return orderA - orderB;
  //         }
  //         return a[1].location - b[1].location;
  //       })
  //       .map((p: any) => {
  //         const part = p[1];
  //         part.name = p[0];
  //         part.start = part.location;
  //         part.end = part.location + part.size;
  //         part.struct = part.type;
  //         return part;
  //       });

  //     return block;
  //   }).sort((a: any, b: any) => a.parts[0].location - b.parts[0].location);
    
  //   const baseRomFiles : ChunkFile[] = payload.baseRomFiles && payload.baseRomFiles.map((file: BaseRomFileData) => {
  //     const chunkFile = new ChunkFile(file.name, 0, 0, file.type as BinType);
  //     if(file.isText) {
  //       chunkFile.textData = file.text ?? undefined;
  //       chunkFile.size = file.text?.length ?? 0;
  //     } else {
  //       chunkFile.rawData = file.data;
  //       chunkFile.size = file.data?.length ?? 0;
  //     }
  //     return chunkFile;
  //   });
    
  //   const projectFiles : ChunkFile[] = payload.projectFiles && payload.projectFiles.map((file: ProjectFileData) => {
  //     const chunkFile = new ChunkFile(file.name, 0, 0, file.type as BinType);
  //     chunkFile.group = file.module ?? undefined;
  //     if(file.isText) {
  //       chunkFile.textData = file.text ?? undefined;
  //       chunkFile.size = file.text?.length ?? 0;
  //     } else {
  //       chunkFile.rawData = file.data;
  //       chunkFile.size = file.data?.length ?? 0;
  //     }
  //     return chunkFile;
  //   });

  //   // Extract other data from the JSON structures
  //   const mnemonics = romFixups.mnemonics || {};
  //   const opCodes = this.extractOpCodesFromInstructionSet(instructionSet);
  //   const overrides = romFixups.overrides || {};
  //   const rewrites = romFixups.rewrites || {};
  //   const labels = romFixups.labels || {};
  //   const structs = romStructs || {};
  //   //const parts: DbPart[] = Array.isArray(typesJson.parts) ? typesJson.parts : [];
  //   //const transforms: DbTransform[] = Array.isArray(typesJson.transforms) ? typesJson.transforms : [];
  //   //const stringTypes = romTypes.strings || {};
  //   //const stringCommands = romTypes.stringCommands || {};
  //   //const stringLayers = Array.isArray(romTypes.stringLayers) ? romTypes.stringLayers : [];
  //   //const copDef = Array.isArray(romTypes.copDef) ? romTypes.copDef : [];
  //   const entryPoints = Array.isArray(config.entryPoints) ? config.entryPoints : [];
    

  //   const stringTypes = Object.entries(romStrings).reduce((acc: any, x: any) => {
  //     const strType = x[1];
  //     strType.name = x[0];

  //     const commands = Object.entries(strType.commands).reduce((acc: any, x: any) => {
  //       const cmd = x[1];
  //       acc[cmd.code] = {
  //         key: cmd.code,
  //         value: x[0],
  //         types: cmd.types,
  //         delimiter: cmd.delimiter,
  //         halt: cmd.halt
  //       };
  //       return acc;
  //     }, {} as Record<number, any>);
  //     strType.commands = commands;

  //     acc[strType.name] = strType;
  //     return acc;
  //   }, {} as Record<string, DbStringType>);
    
  //   // Build lookup tables
  //   const copLookup = Object.entries(copDef).reduce((acc: any, x: any) => {
  //     const def = x[1];
  //     def.mnem = x[0];
  //     def.size = RomProcessingConstants.getSize(def.parts);
  //     acc[x[0]] = def;
  //     return acc;
  //   }, {} as Record<string, CopDef>);
    
  //   const copDefLookup = Object.values(copDef).reduce((acc: any, x: any) => {
  //     acc[x.code] = x;
  //     return acc;
  //   }, {} as Record<number, CopDef>);
    
    
  //   const opLookup = Object.entries(instructionSet).reduce((acc: any, x: any) => {
  //     acc[x[0]] = Object.entries(x[1]).map((y: any) => new OpCode(y[1], x[0], y[0]));
  //     return acc;
  //   }, {});

  //   const stringDelimiters = Object.values(stringTypes).map((x: any) => x?.delimiter).filter(Boolean);
  //   const stringCharLookup = Object.values(stringTypes).reduce((acc: any, x: any) => {
  //     if (x?.delimiter) {
  //       acc[x.delimiter] = x;
  //     }
  //     return acc;
  //   }, {});
    

  //   const scenes = {} as Record<number, DbScene>;
  //   const sceneGroups = Object.entries(romScenes ?? {}).reduce((acc: any, x: any) => {
  //     const group = x[1];
  //     const groupName = x[0];
  //     const newGroup = {
  //       name: groupName,
  //       scenes: Object.entries(group).reduce((accy: any, y: any) => {
  //         const scene = y[1];
  //         const sceneName = y[0];
  //         const newScene = {
  //           name: sceneName,
  //           id: scene.id,
  //           group: groupName,
  //           assets: scene.assets.map((asset: any, index: number) : DbAsset => {
  //             const meta = { ...asset };
  //             delete meta.type;
  //             delete meta.data;
  //             return { 
  //               index,
  //               type: asset.type,
  //               file: asset.data,
  //               scene: sceneName,
  //               meta
  //             };
  //           }),
  //         };
  //         if(scene.id) {
  //           scenes[scene.id] = newScene;
  //         }
  //         accy[sceneName] = newScene;
  //         return accy;
  //       }, {} as Record<string, DbScene>)
  //     }

  //     acc[groupName] = newGroup;
  //     return acc;
  //   }, {} as Record<string, DbGroup>);
    
    
  //   // Build the complete DbRoot structure
  //   const root: DbRoot = {
  //     mnemonics: Object.entries(mnemonics).reduce((acc: any, x: any) => {
  //       acc[x[1]] = x[0];
  //       return acc;
  //     }, {} as Record<number, string>),
  //     overrides: Array.isArray(overrides) ? overrides.reduce((acc: any, x: any) => {
  //       acc[x.location] = x;
  //       return acc;
  //     }, {}) : overrides,
  //     rewrites: Array.isArray(rewrites) ? rewrites.reduce((acc: any, x: any) => {
  //       acc[x.location] = x.value;
  //       return acc;
  //     }, {}) : rewrites,
  //     labels: Array.isArray(labels) ? labels.reduce((acc: any, x: any) => {
  //       acc[x.location] = x.label;
  //       return acc;
  //     }, {}) : labels,
  //     structs: Object.entries(structs).reduce((acc: any, x: any) => {
  //       const struct = x[1];
  //       struct.name = x[0];
  //       acc[x[0]] = struct;
  //       return acc;
  //     }, {} as Record<string, DbStruct>),
  //     blocks,
  //     files,
  //     copDef: copDefLookup as Record<number, CopDef>,
  //     copLookup,
  //     baseRomFiles,
  //     projectFiles,
  //     config,
  //     opCodes,
  //     opLookup,
  //     addrLookup: addressingModes,
  //     entryPoints,
  //     //paths: config.paths,
  //     stringTypes: stringTypes,
  //     stringDelimiters,
  //     //stringCharLookup: stringCharLookup as Record<string, DbStringType>,
  //     compression,
  //     groups: sceneGroups,
  //     scenes
  //   };

  //   console.log('✅ Successfully transformed Supabase payload to DbRoot');
  //   console.log(`📁 Files: ${files.length}, 🧱 Blocks: ${blocks.length}`);
  //   console.log(`🎯 ROM: ${payload.baseRomBranch.baseRom.name} (${payload.baseRomBranch.name || 'main'})`);
  //   console.log(`💾 BaseRom files: ${root?.baseRomFiles?.length} files, ${root.baseRomFiles?.reduce((sum, f) => sum + f.size, 0)} bytes total`);
  //   console.log(`💾 Project files: ${root?.projectFiles?.length} files, ${root.projectFiles?.reduce((sum, f) => sum + f.size, 0)} bytes total`);
    
  //   return root;
  // }

  /**
   * Extract and flatten OpCodes from the instruction set schema
   * @private
   * @param instructionSet - The instruction set object from the schema
   * @returns Array of OpCode objects with code, mnem, mode, and size properties
   */
  // private static extractOpCodesFromInstructionSet(instructionSet: any): OpCode[] {
  //   const opCodes: OpCode[] = [];
    
  //   for (const mnem in instructionSet) {
  //     for (const mode in instructionSet[mnem]) {
  //       const op = instructionSet[mnem][mode];
  //       opCodes[op] = new OpCode(op, mnem, mode);
  //     }
  //   }
    
  //   return opCodes;
  // }

  // /**
  //  * Convert GameRomBranch data directly to DbRoot structure
  //  * @private
  //  * @param gameRomBranchData - Direct GameRomBranch data from Supabase API
  //  * @returns DbRoot containing the processed database structure
  //  */
  // private static async fromGameRomBranchData(gameRomBranchData: any): Promise<DbRoot> {
    
  //   // Extract data from the GameRomBranch data
  //   const config = gameRomBranchData.config;
  //   const copDef = gameRomBranchData.coplib;
  //   const romFiles = gameRomBranchData.files;
  //   const romBlocks = gameRomBranchData.blocks;
  //   const romTypes = gameRomBranchData.types;
  //   const romFixups = gameRomBranchData.fixups;
  //   const structs = gameRomBranchData.structs;

  //   // Note: For direct GameRomBranch processing, we won't have platformBranch data
  //   // So we'll use defaults or extract from what's available
  //   const instructionSet = {}; // Will be empty for now
  //   const addressingModes = {}; // Will be empty for now
    
  //   const transforms = romFixups?.transforms || [];

  //   // Build configuration from available data
  //   const compression = CompressionRegistry.get(config?.compression || 'QuintetLZ');
    
  //   const files: DbFile[] = romFiles ? Object.entries(romFiles).map((x: any) => {
  //     const file = x[1];
  //     file.start = file.location;
  //     file.end = file.location + file.size;
  //     file.name = x[0];
  //     return file;
  //   }) : [];
    
  //   const blocks: DbBlock[] = romBlocks ? Object.entries(romBlocks).map((x: any) => {
  //     const block = x[1];
  //     block.name = x[0];

  //     const transform = transforms[block.name];
  //     block.transforms = transform ? Object.entries(transform).map((t: any) => { return { key: t[0], value: t[1] } }) : [];
      
  //     block.parts = Object.entries(block.parts || {})
  //       .sort((a: any, b: any) => {
  //         const orderA = a[1].order ?? 0;
  //         const orderB = b[1].order ?? 0;
  //         if (orderA !== orderB) {
  //           return orderA - orderB;
  //         }
  //         return a[1].location - b[1].location;
  //       })
  //       .map((p: any) => {
  //         const part = p[1];
  //         part.name = p[0];
  //         part.start = part.location;
  //         part.end = part.location + part.size;
  //         part.struct = part.type;
  //         return part;
  //       });

  //     return block;
  //   }).sort((a: any, b: any) => a.parts[0]?.location || 0 - b.parts[0]?.location || 0) : [];
    
  //   // For GameRomBranch direct processing, we don't have baseRomFiles or projectFiles
  //   const baseRomFiles: ChunkFile[] = [];
  //   const projectFiles: ChunkFile[] = [];
    
  //   const entryPoints: DbEntryPoint[] = [];
    
  //   // Extract overrides from configs (if available)
  //   const overrides: Record<number, DbOverride> = {};
    
  //   // Build OpCode array from instruction set
  //   const opCodes = this.extractOpCodesFromInstructionSet(instructionSet);
    
  //   // Build lookup tables
  //   const copDefLookup = Object.values(copDef || {}).reduce((acc: any, x: any) => {
  //     acc[x.code] = x;
  //     return acc;
  //   }, {} as Record<number, CopDef>);
    
  //   const opLookup = Object.entries(instructionSet).reduce((acc: any, x: any) => {
  //     acc[x[0]] = Object.entries(x[1]).map((y: any) => new OpCode(y[1], x[0], y[0]));
  //     return acc;
  //   }, {});

  //   const stringDelimiters = Object.values(romTypes || {}).map((x: any) => x?.delimiter).filter(Boolean);
  //   const stringCharLookup = Object.values(romTypes || {}).reduce((acc: any, x: any) => {
  //     if (x?.delimiter) {
  //       acc[x.delimiter] = x;
  //     }
  //     return acc;
  //   }, {});
    
  //   // Create the root object
  //   const dbRoot: DbRoot = {
  //     copDef: copDefLookup as Record<number, CopDef>,
  //     copLookup: copDef || {},
  //     stringTypes: romTypes || {},
  //     stringDelimiters,
  //     stringCharLookup: stringCharLookup as Record<string, DbStringType>,
  //     structs: structs || {},
  //     files,
  //     blocks,
  //     entryPoints,
  //     overrides,
  //     labels: {},
  //     rewrites: {},
  //     compression,
  //     opCodes,
  //     opLookup,
  //     addrLookup: addressingModes,
  //     mnemonics: {},
  //     baseRomFiles,
  //     projectFiles,
  //     config: config || {}
  //   };
    
  //   return dbRoot;
  // }
} 