import { Byte, RomProcessingConstants, AsmBlock, Op, Word, Long } from '../../types';
import { DbRoot, DbStruct, OpCode } from '../../database';
import type { Assembler } from './assembler';
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
  private readonly discriminatorLogic: string | null;
  private readonly discriminatorSize: number | undefined;
  private delimiter: number | null;
  private memberOffset: number;
  private dataOffset: number;
  private readonly memberTypes: string[] | null;
  private currentType: string | null;
  private readonly context: Assembler;

  constructor(context: Assembler, structType: string | null = null, saveDelimiter: boolean = false) {
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
    this.discriminatorLogic = this.parentStruct?.discriminatorLogic ?? "=";
    this.discriminatorSize = this.parentStruct?.discriminatorSize ?? 1;
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
    if (this.discriminator === this.dataOffset && this.discriminatorLogic === "=") {
      const discriminator = this.dbStruct!.discriminator!;
      const size = this.dbStruct!.discriminatorSize ?? this.discriminatorSize ?? 1;
      if(discriminator > 255 || size > 1) {
        this.context.currentBlock!.objList.push(new Word(discriminator));
        this.context.currentBlock!.size += 2;
        this.dataOffset += 2;
      } else {
        this.context.currentBlock!.objList.push(new Byte(discriminator));
        this.context.currentBlock!.size += 1;
        this.dataOffset += 1;
      }
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
    //this.context.blockIndex++;
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

    // const conditionBlock = this.context.conditionBlock;
    // if(conditionBlock) {
    //   conditionBlock.objList.push(newBlock);
    // } else {
    this.context.blocks.push(newBlock);
    //}

    // Set as current
    this.context.currentBlock = newBlock;

    // Increment current block index
    //this.context.blockIndex++;

    // Remove label marker
    if (labelChar === ':') this.context.lineBuffer = this.context.lineBuffer.substring(1).replace(/^[\s,\t]+/, '');
    // } else if (labelChar === '[' || labelChar === '{') {
    //   this.context.lineBuffer = operand.substring(1).replace(/^[\s,\t]+/, '');

    //   // Process the next 
    //   const state = new AssemblerState(this.context, this.currentType);
    //   state.processText(labelChar);

    //   // Advance to next part
    //   this.advancePart();
    // }

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
            if(this.dbStruct?.tail !== undefined) {
              this.context.currentBlock!.objList.push(new Uint8Array(this.dbStruct.tail));
              this.context.currentBlock!.size += this.dbStruct.tail;
            }
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

        if(lineSymbol === '{') {
          this.context.lineBuffer = this.context.lineBuffer.substring(1).replace(/^[\s,\t]+/, '');
          const state = new AssemblerState(this.context, this.currentType);
          state.processText('{');
          this.advancePart();
          continue;
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

        if(mnemonic == 'null' && this.dbStruct?.null !== undefined) {
          if(this.dbStruct.null > 255) {
            this.context.currentBlock!.objList.push(new Word(this.dbStruct.null));
            this.context.currentBlock!.size += 2;
          } else {
            this.context.currentBlock!.objList.push(new Byte(this.dbStruct.null));
            this.context.currentBlock!.size += 1;
          }
          continue;
        }

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
          if (!opCode) throw new Error(`Unknown instruction line ${this.context.lineCount}: '${mnemonic}'`);
          this.context.currentBlock!.objList.push(new Op (opCode, 0, [], 1));
          this.context.currentBlock!.size++;
          continue;
        }

        // COP processing
        let opCode: OpCode | null = codes[0];
        if (opCode?.mnem === 'COP') {
          const parts = operand.split(/[\s\t,()[\]$#]/).filter(p => p.length > 0);
          const cmd = parts[0];

          let cop = this.root.copLookup[cmd];
          if (!cop && cmd.match(/^[a-fA-F0-9]{2}$/)) cop = this.root.copDef[parseInt(cmd, 16)];

          if(!cop) throw new Error(`Unknown COP command ${cmd}`);

          let size = 2;
          const operands : any[] = [ new Byte(cop.id) ];
          for(let i = 1; i < parts.length; i++) {
            let part = parts[i];

            if(part[0] === '#') part = part.substring(1);
            if(part[0] === '$') part = part.substring(1);
            
            if(part.match(/^[a-fA-F0-9]+$/)) {
              let value = parseInt(part, 16);
              if(part.length <= 2) {
                operands.push(new Byte(value));
                size++;
              } else if(part.length <= 4) {
                operands.push(new Word(value));
                size+=2;
              } else {
                operands.push(new Long(value));
                size+=3;
              }
            } else {
              operands.push(parts[i]);
              switch(part[0]) {
                case '^': size++; break;
                case '*':
                case '&': size += 2; break;
                case '%':
                case '!':
                case '@': size += 3; break;
                default: throw new Error(`Unknown COP operand ${part}`);
              }
            }
          }

          this.context.currentBlock!.objList.push(new Op(opCode, 0, operands, size));
          this.context.currentBlock!.size += size;
          continue;
        }

        const flatOperand = operand.split(/[\s\t,()[\]#$+-]/).filter(p => p.length > 0)[0];

        let mnemonicStr = this.context.tags[flatOperand] ?? this.root.mnemonicsLookup[flatOperand];
        if (mnemonicStr) operand = operand.replace(flatOperand, mnemonicStr);
        
        operand = AssemblerState.doMath(operand);

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
