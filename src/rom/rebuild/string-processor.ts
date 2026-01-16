import { DbRoot, DbStringCommand, DbStringType, DbStringTypeUtils } from '../../database';
import { MemberType, StringMarker } from '../../types';
import type { AssemblerContext } from './assembler-context';

/**
 * String processor for assembly parsing
 * Converted from GaiaLib/Rom/Rebuild/StringProcessor.cs
 */
export class StringProcessor {
  private memBuffer: number[] = [];
  private totalSize: number = 0;
  private fixedStr: number = 0;
  private readonly context: AssemblerContext;
  private readonly root: DbRoot;
  private readonly stringCharLookup: Record<string, DbStringType>;

  constructor(context: AssemblerContext) {
    this.context = context;
    this.root = context.root;
    this.stringCharLookup = Object.values(this.root.stringTypes).reduce((acc, x) => {
      acc[x.delimiter] = x;
      return acc;
    }, {} as Record<string, DbStringType>);
  }

  public consumeString(typeChar: string): void {
    let str: string | null = null;
    let fixedStr: number = 0;

    // Get character code of string type
    //const typeChar = this.context.lineBuffer[0];

    // Find last index of character code
    const endIx = this.context.lineBuffer.indexOf(typeChar, 1);
    if (endIx >= 0) {
      // Take the line up until the type code
      str = this.context.lineBuffer.substring(1, endIx);
      // Line takes content after and code
      this.context.lineBuffer = this.context.lineBuffer.substring(endIx + 1)
        .replace(/^[\s,\t]+/, '');
      if(this.context.lineBuffer.startsWith('(')) {
        const endIx = this.context.lineBuffer.indexOf(')');
        if(endIx >= 0) {
          fixedStr = parseInt(this.context.lineBuffer.substring(1, endIx), 10);
          this.context.lineBuffer = this.context.lineBuffer.substring(endIx + 1)
            .replace(/^[\s,\t]+/, '');
        }
      }
    } else {
      // Take the remaining line
      str = this.context.lineBuffer.substring(1);
      this.context.lineBuffer = '';
    }

    // Reset memory buffer for new string
    this.memBuffer.length = 0;
    this.totalSize = 0;
    this.fixedStr = fixedStr;

    const stringType = this.stringCharLookup[typeChar];
    this.processString(str, stringType);
  }

  private flushBuffer(stringType: DbStringType, wrap: boolean = false): void {
    const size = this.memBuffer.length;
    if (size > 0) {
      const newSize = this.totalSize + size;
      if(this.fixedStr && newSize > this.fixedStr) {
        const buffer = new Uint8Array(this.memBuffer.slice(0, this.fixedStr - this.totalSize));
        this.context.currentBlock!.objList.push(buffer);
        this.context.currentBlock!.size += buffer.length;
        this.totalSize = this.fixedStr;
      } else {
        const buffer = new Uint8Array(this.memBuffer);
        this.context.currentBlock!.objList.push(buffer);
        this.context.currentBlock!.size += size;
        this.totalSize += size;
      }
      this.memBuffer.length = 0;
    }
  }

  private processString(str: string, stringType: DbStringType): void {
    const dict = stringType.commands;
    //const charMap = stringType.characterMap;
    //const shift = this.getShiftUp(stringType.shiftType);
    let lastCmd: DbStringCommand | null = null;

    for (let x = 0; x < str.length; x++) {
      const c = str[x];
      if (c === '[') {
        const endIx = str.indexOf(']', x + 1);
        const splitChars = [':', ',', ' '];
        const parts = str.substring(x + 1, endIx)
          .split(new RegExp(`[${splitChars.join('')}]`))
          .filter(p => p.length > 0);

        x = endIx;

        // Marker
        if (parts.length === 0) {
          this.flushBuffer(stringType, true);
          this.context.currentBlock!.objList.push({
            offset: this.context.currentBlock!.size
          } as StringMarker);
          continue;
        }

        const cmd = dict[parts[0]];
        if (cmd) {
          lastCmd = cmd;
          this.memBuffer.push(cmd.id);
          this.processStringCommand(cmd, stringType, parts);
          continue;
        }
      }

      lastCmd = null;

      // Process extra string layers
      if (this.applyLayers(c, stringType)) {
        continue;
      }
    }

    if(this.fixedStr) {
      let count = this.fixedStr - this.totalSize;
      while(count--) this.memBuffer.push(stringType.terminator);
    } else if (lastCmd === null || !lastCmd.halt) {
      this.memBuffer.push(stringType.terminator);
    }

    this.flushBuffer(stringType, true);
  }

  private applyLayers(c: string, stringType: DbStringType): boolean {
    if (this.applyMap(c, stringType.characterMap, DbStringTypeUtils.getShiftUp(stringType.shiftType))) {
      return true;
    }

    if (stringType.layers) {
      for (const layer of stringType.layers) {
        if (this.applyMap(c, layer.map, x => x + layer.base)) {
          return true;
        }
      }
    }
    return false;
  }

  private applyMap(c: string, map: string[], shift: (x: number) => number): boolean {
    for (let i = 0, len = map.length; i < len; i++) {
      const v = map[i];
      if (v != null && c === v[0]) {
        this.memBuffer.push(shift(i));
        return true;
      }
    }
    return false;
  }

  private processStringCommand(cmd: DbStringCommand, stringType: DbStringType, parts: string[]): void {
    const hasPointer = cmd.types.includes(MemberType.Address) || cmd.types.includes(MemberType.Offset);
    if (hasPointer) {
      this.flushBuffer(stringType, true);
    }

    for (let y = 0, pix = 1; y < cmd.types.length; y++, pix++) {
      switch (cmd.types[y]) {
        case MemberType.Byte:
          this.memBuffer.push(parseInt(parts[pix], 16));
          break;

        case MemberType.Word:
          const us = parseInt(parts[pix], 16);
          this.memBuffer.push(us & 0xFF);
          this.memBuffer.push((us >> 8) & 0xFF);
          break;

        case MemberType.Binary:
          while (pix < parts.length) {
            const ch = parseInt(parts[pix], 16);
            this.memBuffer.push(ch);
            pix++;
          }
          if (cmd.delimiter !== undefined) {
            this.memBuffer.push(cmd.delimiter);
          }
          break;

        case MemberType.Offset:
        case MemberType.Address:
          // Have to keep these for later since we don't have lookups yet
          this.flushBuffer(stringType, false);
          this.context.currentBlock!.objList.push(parts[pix]);
          this.context.currentBlock!.size += cmd.types[y] === MemberType.Offset ? 2 : 3;
          break;
      }
    }

    if (hasPointer) {
      this.flushBuffer(stringType, false);
    }
  }
}
