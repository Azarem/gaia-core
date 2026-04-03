import { PrismaClient } from '../prisma.mjs';
import { createId } from '@paralleldrive/cuid2';
import snesAddressingModes from '../snes/addressingModes.json' with { type: 'json' };
import snesVectors from '../snes/vectors.json' with { type: 'json' };
import snesHeaders from '../snes/headers.json' with { type: 'json' };

const prisma = new PrismaClient();

// --- Game and Release Master Data ---
const GAME_TITLE = 'Illusion of Gaia';
const GAME_PLATFORM = 'SNES';
const GAME_ROM_MODE = 0x31;
const GAME_ROM_CHIPSET = 0x02;
const GAME_ROM_SIZE = 0x0B; // 2^11 KB = 2MB
const GAME_RAM_SIZE = 0x03; // 2^3 KB = 8KB
const GAME_REGION = 'US';

async function main() {
  try {
        
    console.log('Starting seed process...');


    console.log('Clearing existing game data...');
      
    await prisma.projectBranchFile.deleteMany({});
    await prisma.projectBranch.deleteMany({});
    await prisma.projectFile.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.baseRomBranchFile.deleteMany({});
    await prisma.baseRomFile.deleteMany({});
    await prisma.baseRomBranch.deleteMany({});
    await prisma.baseRom.deleteMany({});
    await prisma.gameRomBranchArtifact.deleteMany({});
    await prisma.gameRomBranch.deleteMany({});
    await prisma.gameRomArtifact.deleteMany({});
    await prisma.gameRom.deleteMany({});
    await prisma.game.deleteMany({});
    await prisma.developer.deleteMany({});
    await prisma.region.deleteMany({});
    await prisma.platformBranch.deleteMany({});
    await prisma.platform.deleteMany({});
    
    console.log('Game data cleared.');


    // 1. Create the platform
    console.log('Creating platform: ' + GAME_PLATFORM);
    const platformId = createId();
    const platform = await prisma.platform.create({
      data: {
        id: platformId,
        name: GAME_PLATFORM,
        meta: { },
      }
    });

    //Create the platform branch
    console.log('Creating platform branch: ' + GAME_PLATFORM);
    const platformBranchId = createId();
    const platformBranch = await prisma.platformBranch.create({
      data: {
        id: platformBranchId,
        platformId: platformId,
        name: '1.0',
        version: 1,
        isActive: true,
        notes: [],
        addressingModes: snesAddressingModes,
        headers: snesHeaders,
        vectors: snesVectors,
      }
    });

    //Create the region
    console.log('Creating regions');
    const regionId = createId();
    const region = await prisma.region.create({
      data: {
        id: regionId,
        name: GAME_REGION,
        meta: { }
      }
    });

    const enixId = createId();
    const enix = await prisma.developer.create({
      data: {
        id: enixId,
        name: "Enix",
        meta: { },
      }
    });
    
    const quintetId = createId();
    const quintet = await prisma.developer.create({
      data: {
        id: quintetId,
        name: "Quintet",
        meta: { },
      }
    });
    
    // 4. Create the master Game record
    console.log(`Creating Game: ${GAME_TITLE}`);
    const gameId = createId();
    const game = await prisma.game.create({
      data: {
        id: gameId,
        name: GAME_TITLE,
        platformId: platformId,
        meta: {
          romMode: GAME_ROM_MODE,
          romChipset: GAME_ROM_CHIPSET,
          romSize: GAME_ROM_SIZE,
          ramSize: GAME_RAM_SIZE,
        }
      }
    });
    console.log(`Created game with ID: ${gameId}`);

    await prisma.gameDeveloper.create({
      data: {
        id: createId(),
        gameId: gameId,
        developerId: enixId,
      }
    });

    await prisma.gameDeveloper.create({
      data: {
        id: createId(),
        gameId: gameId,
        developerId: quintetId,
      }
    });

    console.log('Seed process finished successfully.');
  } finally {
    await prisma.$disconnect();
  }
}


main()
  .catch((e) => {
    console.error('An error occurred during the seed process:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 

//export default main;