import { Byte, RomProcessingConstants, AsmBlock, Op } from '../../types';
import { DbRoot, DbStruct, OpCode } from '../../database';
import type { AssemblerContext } from './assembler-context';
import { AsmReader } from '../extraction/asm';

/**
 * Assembler state machine for processing assembly text
 * Converted from GaiaLib/Rom/Rebuild/AssemblerState.cs
 */
export class AssemblerState {
  private readonly dbStruct: DbStruct | null;
  private readonly parentStruct: DbStruct | null;
  private readonly root: DbRoot;
  private readonly discriminator: number | null;
  private delimiter: number | null;
  private memberOffset: number;
  private dataOffset: number;
  private readonly memberTypes: string[] | null;
  private currentType: string | null;
  private readonly context: AssemblerContext;

  constructor(context: AssemblerContext, structType: string | null = null, saveDelimiter: boolean = false) {
    this.context = context;
    this.root = context.root;

    this.dbStruct = structType === null ? null
      : Object.values(this.root.structs).find(x =>
          x.name.toLowerCase() === structType.toLowerCase()
        ) || null;

    this.parentStruct = !this.dbStruct || !this.dbStruct.parent ? null
      : Object.values(this.root.structs).find(x =>
          x.name.toLowerCase() === this.dbStruct!.parent!.toLowerCase()
        ) || null;

    this.discriminator = this.parentStruct?.discriminator ?? null;
    this.delimiter = this.dbStruct?.delimiter ?? null;
    this.memberOffset = 0;
    this.dataOffset = 0;
    this.memberTypes = this.dbStruct?.types || null;
    this.currentType = this.memberTypes?.[this.memberOffset] || null;

    if (saveDelimiter) {
      this.context.lastDelimiter = this.dbStruct?.delimiter ?? this.parentStruct?.delimiter ?? null;
    }
  }

  private checkDisc(): void {
    if (this.discriminator === this.dataOffset) {
      // Discriminator is always 1 byte
      this.context.currentBlock!.objList.push(this.dbStruct!.discriminator!);
      this.context.currentBlock!.size += 1;
      this.dataOffset += 1;
    }
  }

  private advancePart(): void {
    if (this.currentType != null && this.discriminator != null) {
      this.dataOffset += RomProcessingConstants.getSize(this.currentType);
    }

    if (this.memberTypes != null && this.memberOffset + 1 < this.memberTypes.length) {
      this.currentType = this.memberTypes[++this.memberOffset];
    }
  }

  private processOrigin(): void {
    this.context.lineBuffer = this.context.lineBuffer.substring(3).replace(/^[\s,\t]+/, '');
    if (this.context.lineBuffer.startsWith('$')) {
      this.context.lineBuffer = this.context.lineBuffer.substring(1);
    }

    let hex: string;
    const endIx = this.context.lineBuffer.search(/[\s,\t]/);
    if (endIx >= 0) {
      hex = this.context.lineBuffer.substring(0, endIx);
      this.context.lineBuffer = this.context.lineBuffer.substring(endIx + 1).replace(/^[\s,\t]+/, '');
    } else {
      hex = this.context.lineBuffer;
      this.context.lineBuffer = '';
    }

    const location = parseInt(hex, 16);

    this.context.blocks.push(this.context.currentBlock = new AsmBlock(location));
    this.context.blockIndex++;
  }

  private static doMath(operand: string): string {
    const ix = operand.search(/[-+]/);
    if (ix >= 0) {
      const op = operand[ix];

      const vix = operand.lastIndexOf('$', ix) + 1;

      const valueStr = operand.substring(vix, ix);
      if (valueStr.match(/^[a-fA-F0-9]+$/)) {
        const value = parseInt(valueStr, 16);
        
        let endIx = operand.substring(ix + 1).search(RomProcessingConstants.SYMBOL_SPACE_REGEX);
        if(endIx < 0) {
          endIx = operand.length;
        }
        
        const number = parseInt(operand.substring(ix + 1, endIx), 16);

        let result: number;
        if (op === '-') {
          result = value - number;
        } else {
          result = value + number;
        }

        const len = (ix - vix) <= 2 ? 2 : (ix - vix) <= 4 ? 4 : 6;

        operand = operand.substring(0, vix) + result.toString(16).toUpperCase().padStart(len, '0') + operand.substring(endIx);
      }
    }
    return operand;
  }

  private tryCreateLabel(mnemonic: string, operand?: string): boolean {
    // Check that the operand has content
    if (!operand || operand.length === 0) {
      return false;
    }

    const labelChar = operand[0];

    // If our operand starts with a label space character, create a label
    if (!RomProcessingConstants.LABEL_SPACE.includes(labelChar)) {
      return false;
    }

    // Create new block for this label
    const newBlock = new AsmBlock(
      this.context.currentBlock!.location + this.context.currentBlock!.size,
      0,
      this.root.stringDelimiters.includes(operand[0]),
      mnemonic
    );

    // Add block to assembler
    this.context.blocks.push(newBlock);

    // Set as current
    this.context.currentBlock = newBlock;

    // Increment current block index
    this.context.blockIndex++;

    // Remove label marker
    if (labelChar === ':') {
      this.context.lineBuffer = this.context.lineBuffer.substring(1);
    } else if (labelChar === '[' || labelChar === '{') {
      this.context.lineBuffer = operand.substring(1).replace(/^[\s,\t]+/, '');

      // Process the next 
      const state = new AssemblerState(this.context, this.currentType);
      state.processText(labelChar);

      // Advance to next part
      this.advancePart();
    }

    return true;
  }

  public processText(openTag?: string): void {
    this.checkDisc();

    while (!this.context.eof) {
      if (!this.context.getLine()) {
        return;
      }

      // if (this.context.lineBuffer.startsWith('DB')) {
      //   const hex = this.context.lineBuffer.substring(2).replace(HEX_REGEX, '');
      //   const data = this.hexStringToBytes(hex);
      //   this.context.currentBlock!.objList.push(data);
      //   this.context.currentBlock!.size += data.length;
      //   this.context.lineBuffer = '';
      //   continue;
      // }

      let mnemonic: string | null = null;
      let operand: string | null = null;
      let operand2: string | null = null;

      while (this.context.lineBuffer.length > 0) {
        const lineSymbol = this.context.lineBuffer[0];

        // Process strings
        if (this.root.stringDelimiters.includes(lineSymbol)) {
          this.context.stringProcessor.consumeString(lineSymbol);
          this.advancePart();
          continue;
        }

        // Process raw data
        if (RomProcessingConstants.ADDRESS_SPACE.includes(lineSymbol)) {
          this.context.processRawData();

          if (openTag === '[') {
            this.context.lastDelimiter = null;
          }

          this.advancePart();
          continue;
        }

        if (lineSymbol === '>') {
          if (openTag === '<') {
            this.context.lineBuffer = this.context.lineBuffer.substring(1).replace(/^[\s,\t]+/, '');
            this.checkDisc();
          }
          return;
        }

        // Array Close
        if (lineSymbol === ']') {
          this.context.lineBuffer = this.context.lineBuffer.substring(1).replace(/^[\s,\t]+/, '');

          this.delimiter = this.delimiter ?? this.context.lastDelimiter;

          // Apply delimiter if set
          if (this.delimiter != null) {
            if (this.delimiter >= 0x100) {
              // When over the word boundary use two bytes
              this.context.currentBlock!.objList.push(this.delimiter);
              this.context.currentBlock!.size += 2;
            } else {
              // Otherwise default to single byte
              this.context.currentBlock!.objList.push(this.delimiter);
              this.context.currentBlock!.size += 1;
            }
          }

          return;
        }

        // Block close
        if (lineSymbol === '}') {
          if (openTag === '{') {
            this.context.lineBuffer = this.context.lineBuffer.substring(1).replace(/^[\s,\t]+/, '');
          }
          return;
        }

        // Array Open
        if (lineSymbol === '[') {
          this.context.lineBuffer = this.context.lineBuffer.substring(1).replace(/^[\s,\t]+/, '');
          const state = new AssemblerState(this.context, this.currentType);
          state.processText('[');
          this.advancePart();
          continue;
        }

        // Process origin tags
        if (this.context.lineBuffer.startsWith('ORG')) {
          this.processOrigin();
          continue;
        }

        // Separate instructions into mnemonic and operand parts
        const symbolIndex = this.context.lineBuffer.search(RomProcessingConstants.SYMBOL_SPACE_REGEX);
        if (symbolIndex > 0) {
          mnemonic = this.context.lineBuffer.substring(0, symbolIndex);
          operand = this.context.lineBuffer.substring(symbolIndex).replace(/^[, \t]+/, '');

          // Process object tags
          if (operand && operand.startsWith('<')) {
            this.context.lineBuffer = operand.substring(1).replace(/^[, \t]+/, '');
            const state = new AssemblerState(this.context, mnemonic, openTag === '[' && this.currentType == null);
            state.processText('<');
            mnemonic = null;
            continue;
          }
          
          this.context.lineBuffer = operand;
        } else {
          mnemonic = this.context.lineBuffer;
          this.context.lineBuffer = '';
        }

        break;
      }

      if (mnemonic && mnemonic.length > 0) {
        // Get list of opcodes from mnemonic
        const codes = this.root.opLookup[mnemonic.toUpperCase()];

        // If no codes were found, try to create a label
        if (!codes || codes.length === 0) {
          if (this.tryCreateLabel(mnemonic, operand || undefined)) {
            continue;
          }

          // If label creation fails, throw exception
          throw new Error(`Unknown instruction line ${this.context.lineCount}: '${mnemonic}'`);
        }

        // Reset current assembler line
        this.context.lineBuffer = '';

        // No operand instructions
        if (!operand) {
          const opCode = codes.find(x => this.root.addrLookup[x.mode].size === 1);
          this.context.currentBlock!.objList.push(new Op (opCode, 0, [], 1));
          this.context.currentBlock!.size++;
          continue;
        }

        // Do maths before regex processing
        operand = AssemblerState.doMath(operand);

        // COP processing
        let opCode: OpCode | null = codes[0];
        if (opCode?.mnem === 'COP') {
          const parts = operand.split(/[\s\t,()[\]$#]/).filter(p => p.length > 0);
          const cmd = parts[0];

          const cop = this.root.copLookup[cmd];
          if (!cop) {
            throw new Error(`Unknown COP command ${cmd}`);
          }

          this.context.currentBlock!.objList.push(new Op(opCode, 0, [new Byte(cop.id), ...parts.slice(1)], cop.size + 2));

          this.context.currentBlock!.size += cop.size + 2;

          continue;
        }

        opCode = null;
        for (const code of codes) {
          // Keep branch operands until all blocks are processed (for labels)
          if (code.mode === 'PCRelative' || code.mode === 'PCRelativeLong') {
            opCode = code;
            break;
          }

          // Regex parse operand based on addressing mode
          const addrMode = this.root.addrLookup[code.mode]; 
          const regex = addrMode.parseRegex;
          if (regex) {
            const match = new RegExp(regex).exec(operand);
            if (match) {
              // Keep the current code
              opCode = code;

              // Operand is the "first" matched group
              operand = match[1];

              // Support for second operand (MVN/MVP)
              if (match.length > 2) {
                operand2 = match[2];
              }

              break;
            }
          }
        }

        if (operand!.startsWith('#')) {
          operand = operand!.substring(1);
        }

        if (operand!.startsWith('$')) {
          operand = operand!.substring(1);
        }

        if (opCode == null) {
          const addrIx = operand!.search(RomProcessingConstants.ADDRESS_SPACE_REGEX);
          if (addrIx && addrIx >= 0) {
            const eix = operand!.search(/[\s\t,\])]/);
            if (eix && eix >= 0) {
              operand = operand!.substring(addrIx, eix);
            }
          }

          opCode = codes.find(x => x.mode === 'Immediate')
            ?? codes.find(x => x.mode === 'AbsoluteLong')
            ?? codes.find(x => x.mode === 'Absolute')
            ?? null;

          if (opCode == null) {
            throw new Error(`Unable to determine mode/code line ${this.context.lineCount}: '${this.context.lineBuffer}'`);
          }
        }

        const opnd1 = this.context.parseOperand(operand!);

        const addrMode = this.root.addrLookup[opCode.mode];
        let size = addrMode.size;
        if (size === AsmReader.VARIABLE_SIZE_INDICATOR || opCode.mode === 'Immediate') {
          size = operand?.startsWith('^') || operand?.length === 2 ? 2 : 3;
        }

        const operands: unknown[] = operand2 != null ? [opnd1, this.context.parseOperand(operand2)] : [opnd1];

        this.context.currentBlock!.objList.push(new Op(opCode, 0, operands, size));

        this.context.currentBlock!.size += size;
      }
    }
  }

  private hexStringToBytes(hex: string): Uint8Array {
    const result = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      result[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return result;
  }
}
