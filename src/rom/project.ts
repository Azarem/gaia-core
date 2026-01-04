// import { 
//   BinType, 
//   DbRootUtils, 
//   DbEntryPoint, 
//   type DbPath, 
//   readJsonFile, 
//   readFileAsBinary, 
//   getDirectory, 
//   type ChunkFile 
// } from '@gaialabs/shared';
// import '../compression'; // Import to ensure compression providers are registered
// import { BlockReader, BlockWriter } from './extraction';
// import { RomWriter } from './rebuild';

// /**
//  * Main project management class
//  * Converted from GaiaLib/ProjectRoot.cs
//  */
// export interface ProjectConfig {
//   name: string;
//   romPath: string;
//   baseDir: string;
//   system?: string;
//   database: string;
//   flipsPath?: string;
//   resources: Record<BinType, DbPath>;
//   databasePath?: string;
//   systemPath?: string;
//   compression?: string;
// }

// /**
//  * Project root management
//  */
// export class ProjectRoot {
//   public config: ProjectConfig;
//   public name: string;
//   public romPath: string;
//   public baseDir: string;
//   public system?: string;
//   public database: string;
//   public flipsPath?: string;
//   public resources: Record<BinType, DbPath>;
//   public databasePath?: string;
//   public systemPath?: string;
//   public compression?: string;

//   constructor(config: ProjectConfig) {
//     this.config = config;
//     this.name = config.name;
//     this.romPath = config.romPath;
//     this.baseDir = config.baseDir;
//     this.system = config.system;
//     this.database = config.database;
//     this.flipsPath = config.flipsPath;
//     this.resources = config.resources;
//     this.databasePath = config.databasePath;
//     this.systemPath = config.systemPath;
//     this.compression = config.compression;
//   }

//   /**
//    * Load project from file or directory
//    */
//   public static async load(path?: string): Promise<ProjectRoot> {
//     path = path || './project.json';

//     try {
//       // Try to load as JSON file using shared utility
//       const config = await readJsonFile<ProjectConfig>(path);
      
//       // Set default values
//       if (!config.baseDir) {
//         config.baseDir = await getDirectory(path);
//       }
      
//       //if (!config.database) {
//       //  config.database = 'us';
//       //}

//       //config.databasePath = `${config.baseDir}/db/${config.database}`;
//       //config.systemPath = `${config.baseDir}/db/snes`;

//       return new ProjectRoot(config);
//     } catch (error) {
//       // Fall back to directory-based configuration
//       console.warn(`Failed to load project file: ${error}. Using directory-based configuration.`);
//     }

//     // Try as directory
//     const defaultConfig: ProjectConfig = {
//       name: 'GaiaLabs',
//       baseDir: path,
//       flipsPath: process?.env?.flips_path,
//       romPath: process?.env?.rom_path || '',
//       database: 'us',
//       databasePath: `${path}/db/us`,
//       systemPath: `${path}/db/snes`,
//       resources: {} as Record<BinType, DbPath>
//     };

//     return new ProjectRoot(defaultConfig);
//   }

//   // /**
//   //  * Build the ROM (simplified)
//   //  */
//   // public async build(files: ChunkFile[], entryPoints: DbEntryPoint[]): Promise<void> {
//   //   // Build ROM using rebuild writer
//   //   const writer = new RomWriter(entryPoints, this.config.cartName, this.config.makerCode);
//   //   await writer.repack(files);
//   // }

//   /**
//    * Dump database and extract ROM data with comprehensive assembly processing
//    */
//   // public async dumpDatabase(): Promise<ChunkFile[]> {
//   //   // Load database and ROM data
//   //   const root = await DbRootUtils.fromFolder(this.databasePath!, this.systemPath!);
//   //   const rom = await readFileAsBinary(this.romPath);
//   //   //root.paths = this.resources;

//   //   const chunkReader = new BlockReader(rom, root);
//   //   const chunkFiles = chunkReader.analyzeAndResolve();

//   //   const blockWriter = new BlockWriter(chunkReader);
//   //   const writtenFiles = blockWriter.generateAllAsm(chunkFiles);

//   //   return chunkFiles;
//   // }
// } 