import { describe, expect, it } from 'vitest';
import { readFileAsBinary, saveFileAsBinary, saveFileAsText } from '../../utils';
import { RomGenerator } from '../generator';
import { AsmBlock, ChunkFile } from '../../types';
import { db } from '../../../../gaia-iog-baserom';
import { DbRoot, DbRootUtils } from '../../database';
import { BlockReader, BlockWriter } from '../extraction';

const OUT_PATH = './temp';
//const FILE_PATH = 'C:/Work/gaia-iog-baserom/baserom/spritemaps/spm_sc02_main_characters.spm';
const FILE_PATH = 'C:/Work/IOGRXLT/IOGRetranslation/modules/base/spritemaps/spm_watermia_sprites.spm';
const FILE_NAME = 'spm_watermia_sprites';

describe('SpriteReader', async () => {

  let romGenerator: RomGenerator;
  let chunkFile: ChunkFile;
  let dbRoot: DbRoot;
  let data: Uint8Array;
  
  describe('Constructor', () => {
    it('should create a rom generator which downloads project summary', async () => {
      dbRoot = DbRootUtils.fromGameModule(db);
      const fileType = dbRoot.fileTypes['Spritemap'];
      chunkFile = new ChunkFile(fileType, FILE_NAME);
      chunkFile.rawData = data = await readFileAsBinary(FILE_PATH);
      chunkFile.size = data.length;
      chunkFile.base = 0x4000;

      const reader = new BlockReader(data, dbRoot);
      reader._romDataReader.offset = 0x4000;
      reader._currentChunk = chunkFile;
      chunkFile.referenceManager = reader._referenceManager;

      const asmBlock = new AsmBlock(0, chunkFile.size, false, chunkFile.name, fileType.struct);
      chunkFile.parts = [asmBlock];
      reader._currentAsmBlock = asmBlock;
      reader.processPart(asmBlock);

      const writer = new BlockWriter(reader);
      const asm = writer.generateAsm(chunkFile);
      await saveFileAsText(`${OUT_PATH}/${FILE_NAME}.sprite.asm`, asm);
    });
  });
}); 