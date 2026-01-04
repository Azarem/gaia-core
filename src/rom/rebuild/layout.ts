import { RomProcessingConstants } from '../../types/constants';
import type { ChunkFile } from '../../types/files';

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

  constructor(files: Iterable<ChunkFile>) {
    // Filter out zero-size files and order: assembly first, then by size desc
    this.unmatchedFiles = Array.from(files)
      .filter(x => (x.size || 0) > 0)
      .sort((a, b) => {
        const aAsm = a.parts ? 0 : 1;
        const bAsm = b.parts ? 0 : 1;
        if (aAsm !== bAsm) return aAsm - bAsm;
        if (b.size !== a.size) return b.size - a.size;
        if (a.location !== b.location) return a.location - b.location;
        return a.name.localeCompare(b.name);
      });
  }

  public organize(): void {
    for (let page = 0; page < 0x80; page++) {
      if (this.unmatchedFiles.length === 0) break;

      let remain = RomProcessingConstants.PAGE_SIZE;
      if (page === 1) remain -= RomProcessingConstants.SNES_HEADER_SIZE;

      this.currentUpper = (page & 1) !== 0;
      this.currentBank = page >> 1;
      this.bestDepth = 0;
      this.bestRemain = remain;
      this.bestOffset = 0;
      const start = page << 15; // 0x8000 per page

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
        position += file.size || 0;
      }

      console.log(`Page ${start.toString(16).toUpperCase().padStart(6, '0')} matched with ${this.bestDepth} files ${this.bestRemain} remaining`);
      // Commit: remove placed files from queue
      this.commitPage();
    }

    if (this.unmatchedFiles.length > 0) {
      const names = this.unmatchedFiles.map(x => x.name).join('\r\n');
      throw new Error(`Unable to match ${this.unmatchedFiles.length} files\r\n${names}`);
    }
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



