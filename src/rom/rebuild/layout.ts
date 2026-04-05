import { RomProcessingConstants } from '../../types/constants';
import { ChunkFile } from '../../types/files';
import { MemoryMapMode } from '../../types/addressing';
import type { DbConfig } from '../../database/config';
import type { DbRoot } from '../../database/root';
import { BinType } from '../../types/resources';

/**
 * ROM layout planner
 * Converted from ext/GaiaLib/Rom/Rebuild/RomLayout.cs
 */
export class RomLayout {
  private static readonly MIN_ACCEPTED_REMAINING = 0x20;

  public readonly unmatchedFiles: ChunkFile[];
  private readonly bestResult: number[] = new Array(0x200).fill(0);
  private readonly bestSample: number[] = new Array(0x200).fill(0);

  private currentBank = 0;
  private currentUpper = false;
  private bestDepth = 0;
  private bestOffset = 0;
  private bestRemain = 0;
  private root: DbRoot;
  private config: DbConfig;
  private sfxPackType: string;
  public readonly sfxFiles: ChunkFile[] = [];

  constructor(files: ChunkFile[], root: DbRoot) {
    this.root = root;
    this.config = root.config;
    this.sfxPackType = root.config.sfxPack ?? root.config.sfxType;
    this.sfxFiles = this.sfxPackType !== 'Individual' ? files.filter(x => x.type.type === 'Sound')
      .sort((a, b) => {
        const aId = parseInt(a.name.substring(a.name.length - 2, a.name.length), 16);
        const bId = parseInt(b.name.substring(b.name.length - 2, b.name.length), 16);
        return aId - bId;
      }) : [];
      
    // Filter out zero-size files and order: assembly first, then by size desc
    this.unmatchedFiles = files.filter(x => (x.size || 0) > 0)
      .filter(x => this.sfxPackType === 'Individual' || x.type.type !== 'Sound')
      .sort((a, b) => {
        const aAsm = a.parts ? 0 : 1;
        const bAsm = b.parts ? 0 : 1;
        if (aAsm !== bAsm) return aAsm - bAsm;
        if (b.size !== a.size) return b.size - a.size;
        if (a.location !== b.location) return a.location - b.location;
        return a.name.localeCompare(b.name);
      });
  }

  public organize(): number {
    let stripeSfx = false;
    let page: number;
    const maxPages = this.config.memoryMode === MemoryMapMode.Hi ? 0x80 
      : this.config.memoryMode === MemoryMapMode.ExHi ? 0x100
      : 0x40;
    for (page = 0; page < maxPages; page++) {
      if (this.unmatchedFiles.length === 0) break;
      let start = page << 15; // 0x8000 per page
      let remain = RomProcessingConstants.PAGE_SIZE;
      
      if(start <= this.config.sfxLocation && start + remain > this.config.sfxLocation) {
        const gap = this.config.sfxLocation - start;
        //if(gap) do something

        if(this.sfxPackType === 'Sequential') {
          let offset = 0;
          for(const file of this.sfxFiles) {
            file.location = start + offset;
            console.log(`  ${file.location.toString(16).toUpperCase().padStart(6, '0')}: ${file.name}`);
            offset += file.size;
            if(offset & RomProcessingConstants.PAGE_SIZE) {
              offset &= 0x7FFF;
              console.log(`Page ${start.toString(16).toUpperCase().padStart(6, '0')} matched with SFX files 0 remaining`);
              start += RomProcessingConstants.PAGE_SIZE;
              page++;
            }
          }
          console.log(`Page ${start.toString(16).toUpperCase().padStart(6, '0')} matched with SFX files ${remain} remaining`);
          start += offset;
          remain = RomProcessingConstants.PAGE_SIZE - offset;
        } else if(this.sfxPackType === 'Striped') {
          stripeSfx = true;
        }
      }

      if ((page === 0 && this.config.memoryMode === MemoryMapMode.Lo) ||
          (page === 1 && this.config.memoryMode === MemoryMapMode.Hi)) {
        remain -= RomProcessingConstants.SNES_HEADER_SIZE;
      }

      if(stripeSfx) {
        let offset = 0;
        while(remain > 0 && this.sfxFiles.length) {
          const file = this.sfxFiles.shift();
          if(!file) continue;
          file.location = start + offset;
          console.log(`  ${file.location.toString(16).toUpperCase().padStart(6, '0')}: ${file.name}`);
          offset += file.size;
          if(offset & RomProcessingConstants.PAGE_SIZE) {
            offset &= 0x7FFF;
            console.log(`Page ${start.toString(16).toUpperCase().padStart(6, '0')} matched with SFX files 0 remaining`);
            start += RomProcessingConstants.PAGE_SIZE;
            page++;

            if(offset) {
              const newFile = new ChunkFile(file.name + "_2", file.size, file.location, Object.values(this.root.fileTypes).find(x => x.type === BinType.Binary)!);
              const end = file.rawData!.length - offset;
              newFile.rawData = file.rawData!.slice(end);
              newFile.size = newFile.rawData.length;
              this.sfxFiles.unshift(newFile);
              file.rawData = file.rawData!.slice(0, end);
              file.size -= offset;
              offset = 0;
            }
            remain = RomProcessingConstants.PAGE_SIZE;
            break;
          } else {
            remain -= file.size;
          }
        }
        start += offset;
        if(!this.sfxFiles.length) {
          stripeSfx = false;
        }

      }
      
      this.currentUpper = this.config.memoryMode === MemoryMapMode.Lo || (page & 1) !== 0;
      this.currentBank = this.config.memoryMode === MemoryMapMode.Lo ? page : (page >> 1);
      this.bestDepth = 0;
      this.bestRemain = remain;
      this.bestOffset = 0;

      // Pass 1: assembly preferred in upper banks
      this.testDepth(0, 0, remain, this.currentUpper);

      // Pass 2: if upper, also try binary-only fill
      if (this.currentUpper) {
        this.bestOffset = this.bestDepth;
        this.testDepth(0, this.bestDepth, this.bestRemain, false);
      }

      // Assign positions for best selection
      let position = start;
      for (let i = 0; i < this.bestDepth;) {
        const file = this.unmatchedFiles[this.bestResult[i++]];
        file.location = position;
        console.log(`  ${position.toString(16).toUpperCase().padStart(6, '0')}: ${file.name}`);
        position += file.size;
      }

      console.log(`Page ${start.toString(16).toUpperCase().padStart(6, '0')} matched with ${this.bestDepth} files ${this.bestRemain} remaining`);
      // Commit: remove placed files from queue
      this.commitPage();
    }

    if (this.unmatchedFiles.length > 0) {
      const names = this.unmatchedFiles.map(x => x.name).join('\r\n');
      throw new Error(`Unable to match ${this.unmatchedFiles.length} files\r\n${names}`);
    }

    return page;
  }

  private testDepth(startIndex: number, depth: number, remain: number, asmMode: boolean): boolean {
    for (let fileIndex = startIndex; fileIndex < this.unmatchedFiles.length; fileIndex++) {
      const file = this.unmatchedFiles[fileIndex];

      const fileSize = file.size || 0;
      if (fileSize > remain) continue;

      // Assembly preference and constraints
      if (file.parts) {
        if (!asmMode) {
          if (!this.currentUpper || ((file.bank ?? -1) >= 0)) continue;
        } else if (file.bank !== this.currentBank) {
          continue;
        }
      } else if (asmMode) {
        continue;
      } else if (file.upper && !this.currentUpper) {
        continue;
      }

      // Skip if already selected in first pass window
      let inList = false;
      for (let y = this.bestOffset; --y >= 0;) {
        if (this.bestResult[y] === fileIndex) {
          inList = true;
          break;
        }
      }
      if (inList) continue;

      // Try this file at current depth
      this.bestSample[depth] = fileIndex;
      const newRemain = remain - fileSize;

      if (newRemain < this.bestRemain) {
        this.bestRemain = newRemain;
        this.bestDepth = depth + 1;
        for (let i = this.bestOffset; i < this.bestDepth; i++) {
          this.bestResult[i] = this.bestSample[i];
        }
      }

      if (newRemain < RomLayout.MIN_ACCEPTED_REMAINING) return true;

      if (this.testDepth(fileIndex + 1, depth + 1, newRemain, asmMode)) return true;
    }
    return true;
  }

  private commitPage(): void {
    if (this.bestOffset > 0) {
      for (let i = this.bestDepth; --i >= 0;) {
        let lastY = 0;
        let lastX = 0;
        let y = 0;
        for (let x = this.bestDepth; --x >= 0;) {
          y = this.bestResult[x];
          if (y > lastY) {
            lastY = y;
            lastX = x;
          }
        }
        this.bestResult[lastX] = 0;
        this.unmatchedFiles.splice(lastY, 1);
      }
    } else {
      for (let i = this.bestDepth; --i >= 0;) {
        this.unmatchedFiles.splice(this.bestResult[i], 1);
      }
    }
  }
}



