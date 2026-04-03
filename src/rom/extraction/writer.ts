import { Op } from '../../types/assembly';
import { AsmBlock, ChunkFile, ChunkFileUtils, TypedNumber } from '../../types';
import { 
  AddressType, 
  MemberType,
  AddressSpace,
  TableEntry,
  StructDef,
  StringWrapper,
  LocationWrapper,
  Address
} from '../../types';
import { DbRoot } from '../../database';
import { BlockReader } from './blocks';
import { ReferenceManager } from './references';
import { PostProcessor } from './postprocessor';

// Platform detection that works in both Node.js and web environments
const isWindows = (() => {
  // Check if we're in Node.js environment
  if (typeof process !== 'undefined' && process.platform) {
    return process.platform === 'win32';
  }
  // In web environment, check user agent as fallback
  // if (typeof navigator !== 'undefined' && navigator.userAgent) {
  //   return navigator.userAgent.includes('Windows');
  // }
  // Default to Unix-style line endings if we can't determine
  return false;
})();

const NEWLINE = isWindows ? '\r\n' : '\n';

// Type tags for better object identification
export enum ObjectType {
  TableEntryArray = 'TableEntryArray',
  StructDef = 'StructDef',
  OpArray = 'OpArray',
  LocationWrapper = 'LocationWrapper',
  Address = 'Address',
  StringWrapper = 'StringWrapper',
  ByteArray = 'ByteArray',
  Array = 'Array',
  String = 'String',
  Number = 'Number',
  TypedNumber = 'TypedNumber'
}

export class BlockWriter {
  private _root: DbRoot;
  private _blockReader: BlockReader;
  private _referenceManager: ReferenceManager;
  private _postProcessor: PostProcessor;
  private _isInline: boolean = false;
  private _currentPart: AsmBlock | null = null;

  constructor(reader: BlockReader) {
    this._blockReader = reader;
    this._root = reader._root;
    this._referenceManager = reader._referenceManager;
    this._postProcessor = new PostProcessor(reader);
  }

  // async writeBlocks(outPath: string): Promise<void> {
  //   const res = DbRootUtils.getPath(this._root, BinType.Assembly);

  //   const folderPath = join(outPath, res.folder);

  //   for (const block of this._root.blocks) {
  //     const groupedFolderPath = block.group 
  //       ? join(folderPath, block.group)
  //       : folderPath;
      
  //     await fs.mkdir(groupedFolderPath, { recursive: true });

  //     const outFile = join(groupedFolderPath, `${block.name}.${res.extension}`);
      
  //     // Check if file exists, skip if it does
  //     try {
  //       await fs.access(outFile);
  //       continue;
  //     } catch {
  //       // File doesn't exist, continue with creation
  //     }

  //     const content = this.generateAsm(block);
      
  //     await fs.writeFile(outFile, content);
  //   }
  // }

  generateAllAsm(chunkFiles: ChunkFile[]): any[] {
    const lines: any[] = [];
    for (const block of chunkFiles) {
      lines.push({
        name: block.name,
        group: block.group,
        text: this.generateAsm(block)
      });
    }
    return lines;
  }

  generateAsm(block: ChunkFile): string{
    if(!block.parts) {
      throw new Error('Invalid block structure for generateAsm');
    }

    const lines: string[] = [];

    // Write bank information if not movable
    if (block.bank !== undefined) {
      lines.push(`?BANK ${block.bank.toString(16).toUpperCase().padStart(2, '0')}`);
    }

    // Write includes - these should be from the block's include list
    const includes = ChunkFileUtils.getIncludes(block);
    if (includes && includes.length > 0) {
      lines.push('');
      for (const inc of includes) {
        lines.push(`?INCLUDE '${inc.name}'`);
      }
    }

    // Write mnemonics - these should be from the root mnemonics that are referenced in this block
    const mnemonics = this.getMnemonicsForBlock(block);
    if (mnemonics && mnemonics.length > 0) {
      lines.push('');
      for (const [name, address] of mnemonics) {
        const paddedName = name.padEnd(30, ' ');
        lines.push(`!${paddedName} ${address.toString(16).toUpperCase().padStart(4, '0')}`);
      }
    }

    // Apply any post processing defined for the block
    this._postProcessor.process(block);

    // Process each part
    for (const part of block.parts || []) {
      this._currentPart = part;
      this._isInline = true;

      lines.push('');
      lines.push('---------------------------------------------');

      const objectLines = this.writeObject(part.objList, -1);
      lines.push(...objectLines);
    }

    let content = lines.join(NEWLINE);

    // Apply replace transforms
    if (block.transforms) {
      for (const x of block.transforms) {
        if (x.key && x.value) {
          const regex = new RegExp(x.key, 'g');
          content = content.replace(regex, x.value);
        }
      }
    }

    if(!isWindows){
      content = content.replace(/\r/g, '');
    }

    return content;
  };

  private getMnemonicsForBlock(block: ChunkFile): [string, number][] {
    if (!block.mnemonics) {
      return [];
    }

    return Object.entries(block.mnemonics)
      .map(([k, v]) => [v, parseInt(k, 10)] as [string, number])
      .sort((a, b) => a[1] - b[1]);
  }

  private resolveOperand(op: Op, obj: any, isBranch: boolean = false): any {

    if(obj instanceof TypedNumber) {
      const len = obj.size * 2;
      return obj.value.toString(16).toUpperCase().padStart(len, '0');
    }

    if (typeof obj === 'number') {
      if (op.mode === 'Immediate') {
        return obj;
      }
      return this._blockReader.resolveName(obj, AddressType.Address, isBranch);
    }
    
    if (this.getObjectType(obj) === ObjectType.LocationWrapper) {
      const lw = obj as LocationWrapper;
      return this._blockReader.resolveName(lw.location, lw.type, isBranch);
    }
    if (this.getObjectType(obj) === ObjectType.Address) {
      const addr = obj as Address;

      if (op.size === 4) {
        return addr;
      }

      if (addr.isCodeBank && addr.offset < Address.UPPER_BANK) {
        const label = this._root.mnemonics[addr.offset];
        if (label) return label;
      }

      return addr.offset;
    }

    // Preserve tag information on typed numbers without resolving names
    if (obj && obj instanceof TypedNumber) {
      // const typed = obj as { _tag: string; value: any };

      // // Byte/Word objects should remain untouched
      // if (typed._tag === 'Byte' || typed._tag === 'Word' || typed._tag === 'TypedNumber') {
      //   return obj;
      // }

      // if (typeof typed.value === 'number' && op.mode !== 'Immediate') {
      //   const resolved = this._blockReader.resolveName(typed.value, AddressType.Address, isBranch);
      //   return { ...typed, value: resolved };
      // }
      return obj;
    }
    return obj;
  }

  private getObjectType(obj: any): ObjectType {
    if (obj === null || obj === undefined) {
      return ObjectType.String;
    }

    // Check for explicit type tags first
    if (obj._tag) {
      return obj._tag as ObjectType;
    }

    if (obj instanceof TypedNumber) {
      return ObjectType.TypedNumber;
    }

    // Duck typing fallbacks
    if (Array.isArray(obj)) {
      if (obj.length > 0) {
        if (obj[0] && typeof obj[0] === 'object' && 'location' in obj[0] && 'object' in obj[0]) {
          return ObjectType.TableEntryArray;
        }
        if (obj[0] instanceof Op) {
          return ObjectType.OpArray;
        }
      }
      return ObjectType.Array;
    }

    if (obj instanceof Op) {
      return ObjectType.OpArray;
    }

    if (obj instanceof LocationWrapper) {
      return ObjectType.LocationWrapper;
    }

    if (obj instanceof Address) {
      return ObjectType.Address;
    }

    if (obj instanceof Uint8Array) {
      return ObjectType.ByteArray;
    }

    if (obj && typeof obj === 'object') {
      if ('string' in obj && 'type' in obj && 'marker' in obj && 'location' in obj) {
        return ObjectType.StringWrapper;
      }
      if ('name' in obj && 'parts' in obj) {
        return ObjectType.StructDef;
      }
    }

    if (typeof obj === 'string') {
      return ObjectType.String;
    }

    if (typeof obj === 'number') {
      return ObjectType.Number;
    }

    return ObjectType.String;
  }

  private writeObject(obj: any, depth: number, isBranch: boolean = false, isArray: boolean = false): string[] {
    const lines: string[] = [];

    const objType = this.getObjectType(obj);
    let objLines: string[];

    switch (objType) {
      case ObjectType.TableEntryArray:
        objLines = this.writeTableEntryArray(obj as TableEntry[], depth);
        break;

      case ObjectType.StructDef:
        objLines = this.writeStructDef(obj as StructDef, depth);
        break;

      case ObjectType.OpArray:
        objLines = this.writeOpArray(obj as Op[], depth);
        break;

      case ObjectType.LocationWrapper:
        objLines = [
          this._blockReader.resolveName(
            (obj as LocationWrapper).location,
            (obj as LocationWrapper).type,
            isBranch
          ),
        ];
        break;

      case ObjectType.Address:
        objLines = isArray 
          ? [`$#${(obj as Address).offset.toString(16).toUpperCase().padStart(4, '0')}`] 
          : [`$${(obj as Address).toString()}`];
        break;

      case ObjectType.ByteArray:
        objLines = [
          `#${Array.from(obj as Uint8Array)
            .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
            .join('')}`,
        ];
        break;

      case ObjectType.StringWrapper:
        objLines = this.writeStringWrapper(obj as StringWrapper);
        break;

      case ObjectType.Array:
        objLines = this.writeArray(obj as any[], depth);
        break;

      case ObjectType.Number:
        objLines = this.writeNumber(obj as number);
        break;

      case ObjectType.TypedNumber:
        objLines = this.writeTypedNumber(obj as any);
        break;

      case ObjectType.String:
        objLines = [String(obj)];
        break;

      default:
        objLines = [String(obj)];
        break;
    }

    lines.push(...objLines);

    return lines;
  }

  private writeTableEntryArray(tGroup: TableEntry[], depth: number): string[] {
    const lines: string[] = [];
    const isInline = this._isInline;
    //this._isInline = true;

    for (const t of tGroup) {
      const nameResult = this._referenceManager.tryGetName(t.location);
      //const adrs = Address.fromInt(t.location, this._blockReader._root.config.memoryMode);
      //const name = nameResult.found ? nameResult.referenceName! : `loc_${adrs.toString()}`;
      const name = nameResult.found ? nameResult.referenceName! : `loc_${t.location.toString(16).toUpperCase().padStart(6, '0')}`;
      
      const objectLines = this.writeObject(t.object, depth + 1);
      lines.push('');
      lines.push(`${name} ${objectLines[0]}`);
      if (objectLines.length > 1) {
        lines.push(...objectLines.slice(1));
      }
    }
    
    this._isInline = isInline;
    return lines;
  }

  private writeStructDef(structObj: StructDef, depth: number): string[] {
    const parts: string[] = [];
    const isInline = this._isInline;
    this._isInline = true;
    for (const part of structObj.parts) {
      const partLines = this.writeObject(part, depth);
      parts.push(partLines.join(NEWLINE));
    }
    const line = `${structObj.name} < ${parts.join(', ')} >`;
    this._isInline = isInline; // match C# spacing behaviour
    return [line];
  }

  private writeOpArray(opList: Op[], depth: number): string[] {
    const lines: string[] = [];
    lines.push('{');
    const isInline = this._isInline;
    this._isInline = true; // instructions follow immediately
    
    let first = true;
    for (const op of opList) {
      if (first) {
        first = false;
      } else {
        // Check for labels on subsequent instructions
        const labelResult = this._referenceManager.tryGetName(op.location);
        if (labelResult.found) {
          lines.push('');
          lines.push(`  ${labelResult.referenceName}:`);
        }
      }

      let opLine = `    ${op.mnem} `;

      if (op.copDef) {
        // Handle COP instructions specially
        opLine += `[${op.copDef.name}]`;
        if (op.operands && op.operands.length > 1) {
          const operandStrings: string[] = [];
          for (let i = 1; i < op.operands.length; i++) {
            const operandLines = this.writeObject(op.operands[i], depth + 1, false);
            operandStrings.push(operandLines[0]);
          }
          opLine += ` ( ${operandStrings.join(', ')} )`;
        }
      } else if (op.operands && op.operands.length > 0) {
        const isBr = op.mnem[0] === 'J' || 
                    op.mode === 'PCRelative' ||
                    op.mode === 'PCRelativeLong';

        // Regular instruction formatting
        const resolvedOperand = this.resolveOperand(op, op.operands[0], isBr);
        const format = this._root.addrLookup[op.mode]?.formatString; // || this._root.config.asmFormats?.[op.code.mode];
        
        if (format) {
          let actualFormat = format;
          if (op.mode === 'Immediate' && op.size === 3) {
            actualFormat = format.replace('X2', 'X4');
          }
          const resolvedSecondOperand = op.operands.length > 1 ? this.resolveOperand(op, op.operands[1], isBr) : undefined;
          opLine += this.formatOperand(actualFormat, [resolvedOperand, resolvedSecondOperand]);
        } else {
          // Default formatting based on operand type
          opLine += this.formatDefaultOperand(resolvedOperand, op.size);
        }
      }
      
      lines.push(opLine);
    }
    
    lines.push('}');
    this._isInline = isInline; // ensure following object is separated by blank line
    return lines;
  }

  private formatDefaultOperand(operand: any, size: number): string {
    if (typeof operand === 'string') {
      return operand; // Already formatted
    }

    if (operand && operand instanceof TypedNumber) {
      return this.formatTypedNumber(operand);
    }

    if (typeof operand === 'number') {
      const hexSize = (size - 1) * 2;
      const hex = operand.toString(16).toUpperCase().padStart(hexSize, '0');
      return `$${hex}`;
    }
    
    return String(operand);
  }

  private writeStringWrapper(stringObj: StringWrapper): string[] {
    let str = stringObj.string;
    
    // Process string references
    const stringReferenceChars = ['~', '^'];
    for (const char of stringReferenceChars) {
      let ix = str.indexOf(char);
      while (ix >= 0) {
        const hexStr = str.substring(ix + 1, ix + 7);
        const rawAddr = parseInt(hexStr, 16);
        const adrs = new Address((rawAddr >> 16) & 0xFF, rawAddr & 0xFFFF, this._blockReader._root.config.memoryMode);
        const addressType = char === '^' ? AddressType.Offset : AddressType.Address;
        let name = '';
        
        if (adrs.isROM) {
          name = this._blockReader.resolveName(adrs.toLocation(), addressType, false);
        } else if(addressType === AddressType.Offset) {
          name = adrs.offset.toString(16).toUpperCase().padStart(4, '0');
        } else {
          name = adrs.toString();
        }
        
        str = str.replace(str.substring(ix, ix + 7), name);
        ix = str.indexOf(char);
      }
    }

    const refChar = stringObj.type.delimiter;
    let marker = stringObj.marker;
    
    if (marker <= 0) {
      const markerResult = this._referenceManager.tryGetMarker(stringObj.location);
      marker = markerResult.found ? markerResult.offset || 0 : 0;
    }

    if (marker > 0) {
      let six = 0;
      let mix = 0;
      
      while (mix < marker) {
        if (str[six] === '[') {
          const eix = str.indexOf(']', ++six);
          const parts = str.substring(six, eix).split(/[,: ]/);
          
          const cmd = stringObj.type.commands[parts[0]];
          if (cmd && (cmd as any).types) {
            for (const t of (cmd as any).types) {
              switch (t) {
                case MemberType.Byte:
                  mix += 1;
                  break;
                case MemberType.Word:
                case MemberType.Offset:
                  mix += 2;
                  break;
                case MemberType.Address:
                case MemberType.Location:
                  mix += 3;
                  break;
                case MemberType.Binary:
                  mix += parts.length - 1;
                  break;
                default:
                  throw new Error('Unsupported member type');
              }
            }
          }
          six = eix + 1;
          mix++;
        } else {
          six++;
          mix++;
        }
      }
      
      str = str.substring(0, six) + '[::]' + str.substring(six);
    }

    const sizeParam = stringObj.fixedSize ? `(${stringObj.fixedSize})` : '';

    return [`${refChar}${str}${refChar}${sizeParam}`];
  }

  private writeArray(arr: any[], depth: number): string[] {
    const lines: string[] = [];
    const indent = '  '.repeat(Math.max(0, depth));
    const isInline = this._isInline;
    lines.push('[');
    this._isInline = false; // start elements on their own lines

    for (let i = 0; i < arr.length; i++) {
      const objLines = this.writeObject(arr[i], depth + 1, false, true);
      for(const line of objLines) {
        lines.push(indent + '  ' + line);
      }
      lines[lines.length - 1] += `   ;${i.toString(16).toUpperCase().padStart(2, '0')}`;
    }

    lines.push(indent + ']');
    this._isInline = isInline;
    return lines;
  }

  private writeNumber(num: number): string[] {
    // Format numbers based on value and size
    if (num <= 0xff) {
      // Mirror C# BlockWriter: bytes omit the '$' prefix
      return [`#${num.toString(16).toUpperCase().padStart(2, '0')}`];
    }

    if (num <= 0xffff) {
      return [`#$${num.toString(16).toUpperCase().padStart(4, '0')}`];
    }

    return [`#$${num.toString(16).toUpperCase().padStart(6, '0')}`];
  }

  private formatTypedNumber(num: TypedNumber): string {
    if (typeof num.value === 'number') {
      const width = num.size * 2;
      const hex = num.value.toString(16).toUpperCase().padStart(width, '0');
      return num.size === 1 ? `#${hex}` : `#$${hex}`;
    }

    return `#${num.value}`;
  }

  private writeTypedNumber(num: TypedNumber): string[] {
    return [this.formatTypedNumber(num)];
  }

  private formatOperand(format: string, operands: any[]): string {
    return format.replace(/\{(\d+)(?::([^}]+))?\}/g, (match, index, formatSpec) => {
      const operand = operands[parseInt(index)];
      if (operand && typeof operand === 'object' && operand._tag && 'value' in operand) {
        const value = operand.value;
        if (formatSpec && typeof value === 'number' && formatSpec.startsWith('X')) {
          const width = parseInt(formatSpec.substring(1)) || 2;
          return value.toString(16).toUpperCase().padStart(width, '0');
        }
        return String(value);
      }

      if (formatSpec && typeof operand === 'number') {
        if (formatSpec.startsWith('X')) {
          const width = parseInt(formatSpec.substring(1)) || 2;
          return operand.toString(16).toUpperCase().padStart(width, '0');
        }
      }
      return String(operand);
    });
  }
} 