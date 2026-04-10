import { describe, it, expect, beforeAll } from 'vitest';
import { ChunkFile, BinType, ChunkFileUtils } from '../../types';
import { DbRoot, DbRootUtils, DbGameRomModule } from '../../database';
import { BlockReader, BlockWriter } from '../extraction';
import { Assembler, RomProcessor, RomLayout, RomWriter } from '../rebuild';
import { readFileAsText, crc32_buffer, saveFileAsBinary, readFileAsBinary, saveFileAsText } from '../../utils';

const TRUTH_PATH = './truth';
const OUT_PATH = './temp';
const ROM_PATH = 'C:/Games/SNES/Illusion of Gaia.smc';
const BASEROM_PATH = 'C:/Work/gaia-iog-baserom/baserom';
const CRC = 0x1C3848C0;


describe('BlockReader', () => {
  let reader: BlockReader;
  let writer: BlockWriter;
  let chunkFiles: ChunkFile[];
  let asmFiles: ChunkFile[];
  let patchFiles: ChunkFile[] = [];
  let crc: number;
  let blockLookup: Map<string, number> = new Map();
  let masterLookup: Map<string, number> = new Map();
  let romWriter: RomWriter;
  let pageCount: number;
  //let moduleLookup: Map<string, ChunkFile[]> = new Map();
  //let moduleList = ['jp-viper', 'title-enhanced'];

  beforeAll(async () => {
    const data = await readFileAsBinary(ROM_PATH);

    crc = crc32_buffer(data);
    //const dbRoot = await DbRootUtils.fromSupabaseProject('Illusion of Gaia: Retranslated');
    //const dbRoot = await DbRootUtils.fromFolder(FOLDER_PATH, SYSTEM_PATH);
    const baseRomModule = (await import('C:/Work/gaia-iog-baserom/dist')).db;
    const dbRoot = DbRootUtils.fromGameModule(baseRomModule);
    dbRoot.baseRomFiles = await DbRootUtils.applyFolder(dbRoot, BASEROM_PATH);


    reader = new BlockReader(data, dbRoot);
    writer = new BlockWriter(reader);
    romWriter = new RomWriter(dbRoot);
  }, 30000);

  describe('BlockReader class', () => {
    it('should create a block reader with correct properties', () => {
      expect(reader).toBeInstanceOf(BlockReader);
    });

    it('should have a valid dbRoot', () => {
      expect(reader._root).toBeDefined();
    });

    it('should have a valid crc', () => {
      expect(crc).toEqual(CRC);
    });
  });

  describe('BlockReader.analyzeAndResolve', () => {
    it('should analyze and resolve the blocks', () => {
      chunkFiles = reader.analyzeAndResolve();
    });

    it('should have a valid blocks list', () => {
      expect(chunkFiles).toBeDefined();
      expect(chunkFiles.length).toBeGreaterThan(0);
    });

    it('should be filled with arrays that have at least one element', () => {
      asmFiles = chunkFiles.filter(b => b.type.type === 'Assembly');
      expect(asmFiles.filter(b => Array.isArray(b.parts) && b.parts.length > 0 &&
        b.parts.filter(p => Array.isArray(p.objList) && p.objList.length > 0
          && p.objList.every(o => o.location > 0 && !!o.object)).length == b.parts.length
      ).length).toEqual(asmFiles.length);
    });
  });

  describe('Convert graph with BlockWriter', () => {
    it('should be able to generate ASM from blocks', async () => {
      for(const block of chunkFiles) {
        const filePath = `${OUT_PATH}/${block.group ? (block.group + '/') : ''}${block.scene ? (block.scene + '/') : ''}${block.name}${block.type.extension ? '.' + block.type.extension : ''}`;
        if(block.parts?.length) {
          if(!block.textData) block.textData = writer.generateAsm(block);
          expect(block.textData?.length).toBeGreaterThan(0);
          //Optionally save the text data to a file
          await saveFileAsText(filePath, block.textData);
        } else {
          expect(block.rawData?.length).toBeGreaterThan(0);
          await saveFileAsBinary(filePath, block.rawData!);
        }
      }
    }, 30000);
    
    it('should be able to pass multiple sources of truth', async () => {
      for(const block of asmFiles) {
        const truthPath = `${TRUTH_PATH}/asm/${block.group ? (block.group + '/') : ''}${block.scene ? (block.scene + '/') : ''}${block.name}.asm`;
        console.log(`Validating content of "${truthPath}"`);
        const truthContent = await readFileAsText(truthPath);
        expect(block.textData).toEqual(truthContent);
      }
    }, 30000);
  });

  function applyPatchFile(chunkFile: ChunkFile): void {
    console.log(`Processing patch: ${chunkFile.name}`);
    const existing = chunkFiles.find(x => x.name === chunkFile.name);

    if(chunkFile.type.type === 'Patch' || chunkFile.type.type === 'Assembly') {
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

  describe('File replacement process', () => {
    it('Should be able to process chunk patch files', async () => {
      expect(reader._root.baseRomFiles).toBeDefined();
      expect(reader._root.baseRomFiles?.length).toBeGreaterThan(0);

      for (const chunkFile of reader._root.baseRomFiles!) {
        // Parse the patch file with the assembler
        applyPatchFile(chunkFile);
      }
    }, 60000);

    // it('Should be able to process project files', async () => {
    //   expect(reader._root.projectFiles).toBeDefined();
    //   expect(reader._root.projectFiles?.length).toBeGreaterThan(0);

    //   //Run a single pass to collect all the module files
    //   for (const chunkFile of reader._root.projectFiles!) {
    //     // Parse the patch file with the assembler
    //     console.log(`Processing patch: ${chunkFile.name}`);

    //     //ChunkFile.group is the module name
    //     if(chunkFile.group){
    //       let modArray: ChunkFile[];
    //       if(!moduleLookup.has(chunkFile.group)){
    //         moduleLookup.set(chunkFile.group, modArray = []);
    //       } else {
    //         modArray = moduleLookup.get(chunkFile.group)!;
    //       }
    //       //
    //       modArray!.push(chunkFile);
    //     } else {
    //       //If chunk file is not part of a group, apply it now
    //       applyPatchFile(chunkFile);
    //     }
    //   }

    // }, 60000);

    // it('should be able to apply a module list', async () => {
    //   for(const module of moduleList) {
    //     for(const file of moduleLookup.get(module)!) {
    //       applyPatchFile(file);
    //     }
    //   }
    // });
  });
  
  describe('Assembler process', () => {
    it('Should be able to assemble code', () => {
      const conditionFiles = asmFiles.map(x => x.name);
      for(const block of asmFiles) {
        const assembler = new Assembler(reader._root, block.textData!, conditionFiles);
        const { blocks, includes, reqBank } = assembler.parseAssembly();
        block.parts = blocks;
        block.includes = includes;
        block.bank = reqBank ?? undefined;
        expect(blocks.length).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('Assembly patching process', () => {
    it('Should be able to apply assembly patches', async () => {
      RomProcessor.applyPatches(asmFiles, patchFiles);
    }, 10000);
  });

  describe("Build process", () => {

    it('should be able to calculate sizes before layout', async () => {
      for (const asm of chunkFiles) {
        if(asm.compressed === true) asm.compressed = false;
        ChunkFileUtils.calculateSize(asm);
      }
      for (const asm of chunkFiles) {
        expect(asm.size).toBeGreaterThanOrEqual(0);
        expect(asm.size).toBeLessThan(0x8000);
      }
    });

    it('should organize the files into a ROM layout', async () => {
      // Assign locations
      const layout = new RomLayout(chunkFiles, reader._root);
      
      const preLayoutJson = JSON.stringify({
        files: layout.unmatchedFiles.map(x => ({
          name: x.name,
          type: x.type.type,
          location: x.location,
          size: x.size,
        })),
      }, null, 2);

      pageCount = layout.organize();

      const postLayoutJson = JSON.stringify({
        files: chunkFiles.filter(x => x.size > 0).sort((a, b) => a.location - b.location).map(x => ({
          name: x.name,
          type: x.type.type,
          location: x.location,
          size: x.size,
        })),
      }, null, 2);
      
      await saveFileAsText(`${OUT_PATH}/postlayout.json`, postLayoutJson);
      await saveFileAsText(`${OUT_PATH}/prelayout.json`, preLayoutJson);
      
      const truthPreLayout = (await readFileAsText(`${TRUTH_PATH}/prelayout.json`)).replace(/\r/g, '');
      expect(preLayoutJson).toEqual(truthPreLayout);
      
      const truthPostLayout = (await readFileAsText(`${TRUTH_PATH}/postlayout.json`)).replace(/\r/g, '');
      expect(postLayoutJson).toEqual(truthPostLayout);
    });

    it("Should be able to rebase assembly code", async () => {
      // Rebase assemblies
      for (const file of asmFiles) {
        ChunkFileUtils.rebase(file);
      }
    });

    it("Should be able to generate lookups", async () => {
      
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

        for (const b of f.parts!) {
          if (b.label) {
            masterLookup.set(b.label.toUpperCase(), b.location);
            f.includeLookup.set(b.label.toUpperCase(), b);
          }
        }
      }

      // Create block lookup for resolving labels to locations
      //blockLookup = new Map<string, number>();
      for (const f of chunkFiles) {
        blockLookup.set(f.name.toUpperCase(), f.location);
      }

      expect(blockLookup).toBeDefined();
      expect(blockLookup.size).toBeGreaterThan(0);
    });
  });

  describe('Writing process', () => {
    it('Should be able to write the ROM', async () => {

      romWriter.allocate(pageCount);

      expect(romWriter.outBuffer).toBeDefined();

      // Write all files
      for (const file of chunkFiles) {
        await romWriter.writeFile(file, blockLookup);
      }

      romWriter.writeHeaders(masterLookup);

      await saveFileAsBinary(`${OUT_PATH}/GaiaLabs.smc`, romWriter.outBuffer!);
    });

    it('Should be able to pass validation checks', async () => {
      const header = romWriter.outBuffer!.subarray(0xFFB0, 0xFFB0 + 6);
      expect(header).toEqual(new Uint8Array(Buffer.from('01JG  ')));

      const title = romWriter.outBuffer!.subarray(0xFFB0 + 16, 0xFFB0 + 16 + 21);
      expect(title).toEqual(new Uint8Array(Buffer.from('ILLUSION OF GAIA USA ')));

      const crc = crc32_buffer(romWriter.outBuffer!);
      //1.42
      expect(crc).toEqual(1656812860);
      //1.41
      //expect(crc).toEqual(-1345057874);
    });
  });
}); 