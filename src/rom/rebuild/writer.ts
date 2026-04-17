import { 
  BinType, 
  AddressType, 
  Address, 
  RomProcessingConstants,
  ChunkFile, 
  AsmBlock, 
  StringMarker,
  TableEntry,
  Byte,
  Word,
  Long,
  TypedNumber
} from '../../types';
import { DbEntryPoint, DbHeader, DbRoot } from '../../database';
import { RomProcessor as RebuildProcessor } from './processor';
import { Op } from '../../types/assembly';
import { CpuMode, MemoryMapMode } from '../../types/addressing';
//import { ConditionBlock } from './assembler';
/**
 * ROM writer (binary)
 * Converted from ext/GaiaLib/Rom/Rebuild/RomWriter.cs (subset: binary write only)
 */
export class RomWriter {
  public bpsPath?: string;
  public outBuffer?: Uint8Array;
  private romSize? : number;
  public readonly root: DbRoot;

  constructor(root: DbRoot) {
    this.root = root;
  }

  public async repack(files: ChunkFile[], modules?: string[]): Promise<Uint8Array> {
    const processor = new RebuildProcessor(this);
    const masterLookup = await processor.repack(files, modules);

    this.writeHeaders(masterLookup);

    //await this.generatePatch();
    return this.outBuffer!;
  }

  public allocate(pages: number): void {
    const size = pages * RomProcessingConstants.PAGE_SIZE;
    let bits = 0;
    let target = 1 << 10; // 1KB

    while(target < size) {
      target <<= 1;
      bits++;
    }

    this.romSize = bits;
    this.outBuffer = new Uint8Array(target);
  }

  public writeHeaders(masterLookup: Map<string, number>): void {
    const values = this.prepareHeaderValues();
    for (const header of this.root.headers) {
      if(header.condition && !eval(header.condition)) continue;
      this.writeHeader(header, values, masterLookup);
    }
    this.writeChecksum(values);
  }

  public prepareHeaderValues(): any {
    const values = { ...this.root.config } as any;
    values.romSize = this.romSize;
    values.checksum = 0;
    values.compliment = 0xFFFF;
    values.mapMode = 0x20 
    | (values.cpuMode === CpuMode.Fast ? 0x10 : 0x00)
    | (values.memoryMode === MemoryMapMode.Hi ? 1 : values.memoryMode === MemoryMapMode.ExHi ? 5 : 0);
    return values;
  }


  public writeHeader(header: DbHeader, values: any, masterLookup: Map<string, number>): void {
    const buf = this.outBuffer!;
    
    let pos = new Address(header.bank, header.address, this.root.config.memoryMode).toLocation();

    for (const part of header.parts) {
      let type = part.type;
      let value = part.value ?? values[part.name] ?? (type === 'string' ? '' : 0);
      let size = part.size;

      if(!size) {
        if(!type) {
          //Try to infer the type/size from the value
          if(typeof value === 'string') throw new Error(`String size for ${part.name} is not specified`);
          if(typeof value === 'number') {
            if(value <= 0xFF) {
              size = 1;
              type = 'byte';
            }
            else {
              size = 2;
              type = 'word';
            }
          }
        } else {
          switch(type) {
            case 'byte': size = 1; break;
            case 'word': case 'entry': size = 2; break;
            case 'string': throw new Error(`String size for ${part.name} is not specified`); break;
            default: throw new Error(`Invalid type ${type} for ${part.name}`);
          }
        }
      }

      switch(part.type) {
        case 'string':
          value = value.toString();
          value = value.length > size ? value.substring(0, size) : value.padEnd(size, ' ');
          this.writeAscii(value, pos);
          break;

        case 'byte':
          buf[pos] = value & 0xFF;
          break;

        case 'entry':
          let location = 0;
          if(typeof value === 'string') {
            location = value === '' ? 0 : masterLookup.get(value.toUpperCase()) ?? 0;
          } else if(typeof value === 'number') {
            location = value;
          }
          value = location;

        case 'word':
          buf[pos] = value & 0xFF;
          buf[pos + 1] = (value >> 8) & 0xFF;
          break;

      }

      part.value = value;
      part.size = size;
      part.type = type;

      pos += size;
    }

    // //let pos = this.root.config.memoryMode === MemoryMapMode.Lo ? 0x7FB0 : 0xFFB0;
    // this.writeAscii(this.makerCode.padEnd(6, ' '), pos); 
    // pos += 6;
    // for (let i = 0; i < 10; i++) buf[pos++] = 0;
    // this.writeAscii(this.cartName.toUpperCase().padEnd(21, ' '), pos); 
    // pos += 21;
    // buf[pos++] = 0x20  // map mode
    //   | (this.root.config.cpuMode === CpuMode.Fast ? 0x10 : 0x00)
    //   | (this.root.config.memoryMode === MemoryMapMode.Hi ? 1 : this.root.config.memoryMode === MemoryMapMode.ExHi ? 5 : 0);
    // buf[pos++] = this.root.config.chipset; // chipset
    // buf[pos++] = this.romSize!; // ROM size
    // buf[pos++] = this.root.config.ramSize; // RAM size
    // buf[pos++] = 0x01; // country
    // buf[pos++] = 0x33; // dev id
    // buf[pos++] = 0x00; // version
  }

  public writeChecksum(values: any): void {
    const buf = this.outBuffer!;

    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];

    const comp = ~sum;

    for(const header of this.root.headers) {
      if(header.condition && !eval(header.condition)) continue;
      let pos = new Address(header.bank, header.address, this.root.config.memoryMode).toLocation();
      for(const part of header.parts) {
        if(part.name === 'checksum') {
          buf[pos] = sum & 0xFF;
          buf[pos + 1] = (sum >> 8) & 0xFF;
        } else if(part.name === 'compliment') {
          buf[pos] = comp & 0xFF;
          buf[pos + 1] = (comp >> 8) & 0xFF;
        }
        pos += part.size;
      }
    }
  
    // const buf = this.outBuffer!;
    // let pos = new Address(0, 0xFFDC, this.root.config.memoryMode).toLocation();
    
    // //Zero out the checksum location
    // buf[pos] = 0xFF;
    // buf[pos + 1] = 0xFF;
    // buf[pos + 2] = 0;
    // buf[pos + 3] = 0;

    // // checksum
    // let sum = 0;
    // for (let i = 0; i < buf.length; i++) sum += buf[i];

    // // complement at 0xFFDC
    // const comp = ~sum;
    // buf[pos] = comp & 0xFF;
    // buf[pos + 1] = (comp >> 8) & 0xFF;

    // // checksum at 0xFFDE
    // buf[pos + 2] = sum & 0xFF;
    // buf[pos + 3] = (sum >> 8) & 0xFF;
  }

  // private async generatePatch(): Promise<void> {
  //   const flips = this._projectRoot.flipsPath;
  //   if (!flips) return;
  //   if (typeof process === 'undefined' || !process.versions?.node) return;
  //   const { spawn } = await import('child_process');
  //   const { resolve } = await import('path');
  //   this.bpsPath = `${this._projectRoot.baseDir}/${this._projectRoot.name}.bps`;
  //   await new Promise<void>((resolvePromise) => {
  //     const p = spawn(flips, ['--create', '--bps', `${this._projectRoot.romPath}`, `${this.romPath}`, `${this.bpsPath}`], {
  //       stdio: ['ignore', 'pipe', 'pipe']
  //     });
  //     p.on('close', () => resolvePromise());
  //   });
  // }

  public writeEntryPoints(asmFiles: ChunkFile[]): void {
    const buf = this.outBuffer!;
    
    // Entry point fixups
    const entryBlocks = (asmFiles
      .filter(x => (x.bank ?? -1) === 0)
      .flatMap(x => x.parts || [])
      .filter(b => !!b.label)) as { label?: string; location: number }[];

    for (const ep of this.root.config.entryPoints) {
      const match = entryBlocks.find(b => b.label === ep.name);
      if (match) {
        let location = match.location;
        if(this.root.config.memoryMode === MemoryMapMode.Lo) location += RomProcessingConstants.PAGE_SIZE;
        buf[ep.location] = location & 0xFF;
        buf[ep.location + 1] = (location >> 8) & 0xFF;
      }
    }
  }

  // public writeTransform(location: number, value: number, size?: number): void {
  //   const buf = this.outBuffer!;

  //   // Determine size based on value range if not explicitly provided
  //   if (size === undefined) {
  //     if (value <= 0xFF) {
  //       size = 1; // byte
  //     } else if (value <= 0xFFFF) {
  //       size = 2; // ushort 
  //     } else if (value <= 0xFFFFFF) {
  //       size = 3; // uint (3 bytes)
  //     } else {
  //       size = 4; // full uint (4 bytes, though C# version only uses 3)
  //     }
  //   }

  //   // Write bytes based on size
  //   switch (size) {
  //     case 1: // byte
  //       buf[location] = value & 0xFF;
  //       break;
  //     case 2: // ushort
  //       buf[location] = value & 0xFF;
  //       buf[location + 1] = (value >> 8) & 0xFF;
  //       break;
  //     case 3: // uint (3 bytes as per C# version)
  //       buf[location] = value & 0xFF;
  //       buf[location + 1] = (value >> 8) & 0xFF;
  //       buf[location + 2] = (value >> 16) & 0xFF;
  //       break;
  //     case 4: // full uint
  //       buf[location] = value & 0xFF;
  //       buf[location + 1] = (value >> 8) & 0xFF;
  //       buf[location + 2] = (value >> 16) & 0xFF;
  //       buf[location + 3] = (value >> 24) & 0xFF;
  //       break;
  //     default:
  //       throw new Error(`Invalid size ${size} for writeTransform`);
  //   }
  // }

  public async writeFile(file: ChunkFile, fileLookup: Map<string, number>): Promise<number> {
    const start = file.location;
    let pos = start;
    const buf = this.outBuffer!;

    if (file.rawData) {
      // Write type-specific headers
      const data = file.rawData;
      let remain = file.size;
      let srcPos = 0;

      if (file.compressed !== true) {
        if (file.type.header === -2) {
          remain -= 2;
          buf[pos++] = remain & 0xFF;
          buf[pos++] = (remain >> 8) & 0xFF;
        } else if (file.type.header > 0) {
          remain -= file.type.header;
          for (let i = 0; i < file.type.header; i++) buf[pos++] = data[srcPos++];
        }
      }

      //Write null compression header
      if (file.compressed === false) {
        remain -= 2;
        const size = (0 - remain) & 0xFFFF;
        buf[pos++] = size & 0xFF;
        buf[pos++] = (size >> 8) & 0xFF;
      }

      // Copy the rest
      while (remain > 0) {
        buf[pos++] = data[srcPos++];
        remain--;
      }
    } else {
      // Handle assembly parts
      if (file.parts && file.parts.length > 0) {
        // For safety, ensure first block location matches file location when present
        if (file.parts[0].location !== file.location && (file.location || 0) !== 0) {
          throw new Error('Assembly was not based properly');
        }
        
        // Parse assembly parts
        RomWriter.parseAssembly(this.root, file.parts, fileLookup, file.includeLookup!, this.outBuffer!, undefined);
      }
    }

    return pos - start;
  }

  // No address mapping required: layout assigns absolute file offsets

  private writeAscii(text: string, pos: number): void {
    const buf = this.outBuffer!;
    for (let i = 0; i < text.length; i++) buf[pos + i] = text.charCodeAt(i) & 0xFF;
  }

  /**
   * Parse assembly blocks and write binary data to output buffer
   * Converted from ext/GaiaLib/Rom/Rebuild/RomWriter.cs ParseAssembly method
   */
  public static parseAssembly(root: DbRoot, blocks: AsmBlock[], fileLookup: Map<string, number>, includeLookup: Map<string, AsmBlock>, outBuffer: Uint8Array, addrOffset?: number): void {
    if (!blocks) {
      throw new Error('Assembly has not been parsed');
    }

    let bix = 0;

    for (const block of blocks) {
      let position = block.location; // Always start at block's absolute location

      const objList = block.objList;
      let oix = 0;
      let opos = 0;

      // Process each object in the block's object list
      const processObject = (obj: unknown, parentOp?: Op): void => {
        let currentObj = obj;

        while (true) { // Top: label equivalent
          if (Array.isArray(currentObj)) {
            for (const obj of currentObj) {
              processObject(obj, parentOp);
            }
            break;
          } else if (currentObj instanceof TableEntry) {
            currentObj = currentObj.object;
            continue;
          } else if (currentObj instanceof Op) {
            const op = currentObj as Op;
            outBuffer[position++] = op.code & 0xFF;
            opos += op.size;

            for (const operand of op.operands) {
              processObject(operand, op);
            }
            break;
          } else if (currentObj instanceof Uint8Array) {
            const arr = currentObj as Uint8Array;
            for (let i = 0; i < arr.length; i++) {
              outBuffer[position + i] = arr[i];
            }
            position += arr.length;
            opos += arr.length;
            break;
          } else if (typeof currentObj === 'string') {
            const str = currentObj as string;
            let label = str;

            let ix = 0;
            while (ix < label.length && RomProcessingConstants.ADDRESS_SPACE.includes(label[ix])) {
              ix++;
            }

            if (ix > 0) {
              label = label.substring(ix);
            }

            let loc: number;
            const isRelative = parentOp && 
              (parentOp.mode === 'PCRelative' || 
               parentOp.mode === 'PCRelativeLong');

            const operatorIdx = RomWriter.indexOfAny(label, RomProcessingConstants.OPERATORS);
            let offset: number | null = null;
            let useMarker = false;

            if (operatorIdx > 0) {
              if (label[operatorIdx + 1] === 'M') {
                useMarker = true;
              } else {
                offset = parseInt(label.substring(operatorIdx + 1), 16);
                if (label[operatorIdx] === '-') {
                  offset = -offset;
                }
              }
              label = label.substring(0, operatorIdx);
            }

            // Search local labels first
            const labelUpper = label.toUpperCase();
            let target: AsmBlock | null = null;

            if(includeLookup.has(labelUpper)) {
              target = includeLookup.get(labelUpper)!;
              loc = target.location;
            } else if(fileLookup.has(labelUpper)) {
              loc = fileLookup.get(labelUpper)!;
            } else {
              // Handle direct hex values
              if (label.startsWith('#')) {
                label = label.substring(1);
              }
              if (label.startsWith('$')) {
                label = label.substring(1);
              }

              if (isRelative && label.length > 4) {
                throw new Error(`Invalid relative operand '${label}'`);
                //const off = parseInt(label, 16) - (block.location + opos);
                //currentObj = parentOp?.size === 2 ? (off & 0xFF) : (off & 0xFFFF);
                //continue; // goto Top
              } else {
                let num: number;
                switch (label.length) {
                  case 1:
                  case 2:
                    currentObj = new Byte(parseInt(label, 16));
                    continue;
                  case 3:
                  case 4:
                    currentObj = new Word(parseInt(label, 16));
                    continue;
                  case 5:
                  case 6:
                    currentObj = new Long(parseInt(label, 16));
                    continue;
                  default:
                    throw new Error(`Invalid operand '${label}'`);
                }
              }
            }

            let type = isRelative ? (parentOp?.size === 3 ? AddressType.WRelative : AddressType.Relative) : Address.typeFromCode(str[0]);
            if (type === AddressType.Unknown) {
              type = parentOp?.size === 4 ? AddressType.Address
                : parentOp?.size === 2 ? AddressType.Unknown : AddressType.Offset;
            }

            if (isRelative) {
              loc -= block.location + opos;
              if (type === AddressType.Unknown && !(loc < 0x80 || loc >= 0x3FFF80)) {
                throw new Error('Relative out of range');
              }
            }

            if (offset !== null) {
              loc += offset;
            } else if (useMarker && target instanceof AsmBlock) {
              let markerOffset = 0;
              for (const part of target.objList) {
                if (RomWriter.isStringMarker(part)) {
                  loc += markerOffset;
                  break;
                } else {
                  markerOffset += RomProcessingConstants.getSize(part);
                }
              }
            }

            if(addrOffset !== undefined) {
              loc += addrOffset;
            }
            else if(!isRelative && type !== AddressType.Location) {
              const address = Address.fromLocation(loc, root.config.memoryMode, root.config.cpuMode);
              loc = address.toInt();
            }

            switch (type) {
              case AddressType.Offset:
              case AddressType.WRelative:
                currentObj = new Word(loc);
                continue;
              case AddressType.Bank:
                currentObj = new Byte(loc >> 16);
                continue;
              case AddressType.WBank:
                currentObj = new Word(loc >> 16);
                continue;
              case AddressType.Address:
              case AddressType.Location:
                currentObj = new Long(loc);
                continue;
              case AddressType.Unknown:
              case AddressType.Relative:
              default:
                currentObj = new Byte(loc);
                continue;
            }
            
          } else if (currentObj instanceof TypedNumber) {
            let value = currentObj.value;
            for (let i = 0; i < currentObj.size; i++) {
              outBuffer[position++] = value & 0xFF;
              value >>= 8;
            }
            break;
          } else if (typeof currentObj === 'number') {
            const num = currentObj as number;
            const size = parentOp?.size ?? 0;
            
            if (num <= 0xFF && size <= 2) {
              // byte
              outBuffer[position] = num & 0xFF;
              position++;
            } else if (num <= 0xFFFF && size <= 3) {
              // ushort
              outBuffer[position] = num & 0xFF;
              outBuffer[position + 1] = (num >> 8) & 0xFF;
              position += 2;
            } else if (num <= 0xFFFFFF && size <= 4) {
              // 3-byte
              outBuffer[position] = num & 0xFF;
              outBuffer[position + 1] = (num >> 8) & 0xFF;
              outBuffer[position + 2] = (num >> 16) & 0xFF;
              position += 3;
            } else {
              // 4-byte
              outBuffer[position] = num & 0xFF;
              outBuffer[position + 1] = (num >> 8) & 0xFF;
              outBuffer[position + 2] = (num >> 16) & 0xFF;
              outBuffer[position + 3] = (num >> 24) & 0xFF;
              position += 4;
            }
            break;
          } else if (RomWriter.isStringMarker(currentObj)) {
            // StringMarker - no operation needed
            break;
          } else {
            throw new Error(`Unable to process '${currentObj}'`);
          }
        }
      };

      for (const obj of objList) {
        oix++;
        processObject(obj);
      }

      // Position management no longer needed since we use absolute locations

      bix++;
    }
  }

  /**
   * Helper method to find index of any character from an array in a string
   */
  public static indexOfAny(str: string, chars: string[]): number {
    for (let i = 0; i < str.length; i++) {
      if (chars.includes(str[i])) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Helper method to check if an object is a StringMarker
   */
  public static isStringMarker(obj: unknown): obj is StringMarker {
    return typeof obj === 'object' && obj !== null && 'offset' in obj;
  }

  public static isTableEntry(obj: unknown): obj is TableEntry {
    return typeof obj === 'object' && obj !== null && 'location' in obj && 'object' in obj;
  }
}


