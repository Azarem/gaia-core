import { DbRoot, DbStringCommand, DbStringLayer, DbStringType } from '../../database';
import { MemberType, StringMarker } from '../../types';
import type { Assembler } from './assembler';

/**
 * String processor for assembly parsing
 * Converted from GaiaLib/Rom/Rebuild/StringProcessor.cs
 */
export class StringProcessor {
  private memBuffer: number[] = [];
  private totalSize: number = 0;
  private fixedStr: number = 0;
  private readonly context: Assembler;
  private readonly root: DbRoot;
  private readonly stringCharLookup: Record<string, DbStringType>;
  private readonly testRegex: RegExp;
  private inShift: boolean = false;

  constructor(context: Assembler) {
    this.context = context;
    this.root = context.root;
    this.stringCharLookup = context.root.stringDelimiterLookup;
    this.testRegex = new RegExp(/^[0-9A-F]+$/i);
  }

  public consumeString(typeChar: string): void {
    let str: string | null = null;
    let fixedStr: number = 0;
    let isRaw = false;

    // Get character code of string type
    //const typeChar = this.context.lineBuffer[0];

    // Find last index of character code
    const endIx = this.context.lineBuffer.indexOf(typeChar, 1);
    if (endIx >= 0) {
      // Take the line up until the type code
      str = this.context.lineBuffer.substring(1, endIx);
      // Line takes content after and code
      this.context.lineBuffer = this.context.lineBuffer.substring(endIx + 1).replace(/^[\s,\t]+/, '');
      
      if(this.context.lineBuffer[0] === '(') {
        const endIx = this.context.lineBuffer.indexOf(')');
        if(endIx >= 0) {
          fixedStr = parseInt(this.context.lineBuffer.substring(1, endIx), 10);
          this.context.lineBuffer = this.context.lineBuffer.substring(endIx + 1).replace(/^[\s,\t]+/, '');
        }
      }
      
      isRaw = this.context.lineBuffer[0] === '!';
      if(isRaw) this.context.lineBuffer = this.context.lineBuffer.substring(1).replace(/^[\s,\t]+/, '');

    } else {
      // Take the remaining line
      str = this.context.lineBuffer.substring(1);
      this.context.lineBuffer = '';
    }

    // Reset memory buffer for new string
    this.memBuffer.length = 0;
    this.totalSize = 0;
    this.fixedStr = fixedStr;

    this.processString(str!, typeChar, isRaw);
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

  private processString(str: string, typeChar: string, isRaw: boolean): void {
    const stringType = this.stringCharLookup[typeChar];
    const dictionaries = stringType.dictionaryLookup;
    const cmdLookup = stringType.commands;
    let currentLayer = stringType.layers[0];

    //const charMap = stringType.characterMap;
    //const shift = this.getShiftUp(stringType.shiftType);
    let lastCmd: DbStringCommand | null = null;

    let fullMatch = false;
    if (!isRaw) {
      for(const dictionary of dictionaries) {
        let index : number;
        while((index = str.indexOf(dictionary.text)) >= 0) {
          if(index === 0 && str.length === dictionary.text.length) {
            fullMatch = true;
            break;
          }
          str = str.substring(0, index) + `[${(dictionary.id).toString(16).toUpperCase()}]` + str.substring(index + dictionary.text.length);
        }
        if(fullMatch) break;
      }
    }


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

        const cmd = cmdLookup[parts[0]];
        if (cmd) {
          lastCmd = cmd;
          this.memBuffer.push(cmd.id);
          this.processStringCommand(cmd, stringType, parts);
          continue;
        }

        //Direct values for dictionary commands etc
        if(parts.length === 1 && this.testRegex.test(parts[0])) {
          const value = parseInt(parts[0], 16);
          if(value < 0x100) this.memBuffer.push(value);
          else this.memBuffer.push((value >> 8) & 0xFF, value & 0xFF);
          continue;
        }
      }

      lastCmd = null;

      // Process string layers
      let found = false;
      for (const layer of stringType.layers) {
        for (let i = 0, len = layer.map.length; i < len; i++) {
          const v = layer.map[i];
          if (c === v) {
            //Toggle layers if they are not active
            if(layer.on !== undefined && currentLayer !== layer) {
              this.memBuffer.push(layer.on);
              currentLayer = layer;
            }

            let value = i + (layer.base ?? 0);
            if(typeof layer.shiftBit === 'number') {
              const shiftBit = 1 << layer.shiftBit;
              const lowerFlag = shiftBit - 1;
              const upperFlag = ~lowerFlag;
              value = ((value & upperFlag) << 1) | (value & lowerFlag);
            }
            this.memBuffer.push(value);
            found = true; 
            break;
          }
        }
        if(found) break;
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

  private processStringCommand(cmd: DbStringCommand, stringType: DbStringType, parts: string[]): void {
    const hasPointer = cmd.types.includes(MemberType.Address) || cmd.types.includes(MemberType.Offset);
    // if (hasPointer) {
    //   this.flushBuffer(stringType, true);
    // }

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
          this.flushBuffer(stringType, true);
          // Have to keep these for later since we don't have lookups yet
          //this.flushBuffer(stringType, false);
          this.context.currentBlock!.objList.push(parts[pix]);
          this.context.currentBlock!.size += cmd.types[y] === MemberType.Offset ? 2 : 3;
          break;
      }
    }

    // if (hasPointer) {
    //   this.flushBuffer(stringType, false);
    // }
  }
}
