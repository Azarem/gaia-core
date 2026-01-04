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
import { DbEntryPoint, DbRoot } from '../../database';
import { RomProcessor as RebuildProcessor } from './processor';
import { Op } from '../../types/assembly';

/**
 * ROM writer (binary)
 * Converted from ext/GaiaLib/Rom/Rebuild/RomWriter.cs (subset: binary write only)
 */
export class RomWriter {
  public bpsPath?: string;
  public readonly outBuffer: Uint8Array;
  //public readonly entryPoints: DbEntryPoint[];
  public readonly cartName: string;
  public readonly makerCode: string;
  public readonly root: DbRoot;

  constructor(root: DbRoot, cartName: string, makerCode: string) {
    this.cartName = cartName;
    this.makerCode = makerCode;
    this.root = root;
    //this.entryPoints = entryPoints;
    //There needs to be a way to determine the rom size and makeup
    this.outBuffer = new Uint8Array(0x400000);
  }

  public async repack(files: ChunkFile[]): Promise<Uint8Array> {
    const processor = new RebuildProcessor(this);
    await processor.repack(files);

    this.writeHeader();
    this.writeEntryPoints(files.filter(x => !!x.parts));
    this.writeChecksum();

    //await this.generatePatch();
    return this.outBuffer;
  }

  public writeHeader(): void {
    const buf = this.outBuffer!;
    // Maker/game code at 0xFFB0
    let pos = 0xFFB0;
    this.writeAscii(this.makerCode.padEnd(6, ' '), pos); pos += 6;
    for (let i = 0; i < 10; i++) buf[pos++] = 0;
    this.writeAscii(this.cartName.toUpperCase().padEnd(21, ' '), pos); pos += 21;
    buf[pos++] = 0x31; // map mode
    buf[pos++] = 0x02; // chipset
    buf[pos++] = 0x0C; // ROM size
    buf[pos++] = 0x03; // RAM size
    buf[pos++] = 0x01; // country
    buf[pos++] = 0x33; // dev id
    buf[pos++] = 0x00; // version
  }

  public writeChecksum(): void {
    const buf = this.outBuffer!;
    
    // Not sure why this is needed, but it is
    buf[0xFFDC] = 0xFF;
    buf[0xFFDD] = 0xFF;
    buf[0xFFDE] = 0;
    buf[0xFFDF] = 0;

    // checksum
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];

    // checksum at 0xFFDE
    buf[0xFFDE] = sum & 0xFF;
    buf[0xFFDF] = (sum >> 8) & 0xFF;
    // complement at 0xFFDC
    const comp = ~sum;
    buf[0xFFDC] = comp & 0xFF;
    buf[0xFFDD] = (comp >> 8) & 0xFF;
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
        buf[ep.location] = match.location & 0xFF;
        buf[ep.location + 1] = (match.location >> 8) & 0xFF;
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

  public async writeFile(file: ChunkFile, _chunkLookup: Map<string, number>): Promise<number> {
    const start = file.location;
    let pos = start;
    const buf = this.outBuffer!;

    if (file.rawData) {
      // Write type-specific headers
      const data = file.rawData;
      let remain = file.size;
      let srcPos = 0;

      if(file.type.header === -2) {
        remain -= 2;
        buf[pos++] = remain & 0xFF;
        buf[pos++] = (remain >> 8) & 0xFF;
      } else if (file.type.header > 0) {
        remain -= file.type.header;
        for (let i = 0; i < file.type.header; i++) buf[pos++] = data[srcPos++];
      }

      // if (file.type === BinType.Tilemap) {
      //   remain -= 2;
      //   buf[pos++] = data[srcPos++];
      //   buf[pos++] = data[srcPos++];
      // } else if (file.type === BinType.Meta17) {
      //   remain -= 4;
      //   for (let i = 0; i < 4; i++) buf[pos++] = data[srcPos++];
      // } else if (file.type === BinType.Sound) {
      //   remain -= 2;
      //   buf[pos++] = remain & 0xFF;
      //   buf[pos++] = (remain >> 8) & 0xFF;
      // }

      //TODO: in the future perhaps we can compress assets, but for now this is not needed

      //Write compression header
      if (file.compressed !== undefined) {
        remain -= 2;
        const inverse = (0 - remain) & 0xFFFF;
        buf[pos++] = inverse & 0xFF;
        buf[pos++] = (inverse >> 8) & 0xFF;
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
        this.parseAssembly(file.parts, _chunkLookup, file.includeLookup!);
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
  private parseAssembly(
    blocks: AsmBlock[], 
    chunkLookup: Map<string, number>, 
    includeLookup: Map<string, AsmBlock>
  ): void {
    if (!blocks) {
      throw new Error('Assembly has not been parsed');
    }

    const buf = this.outBuffer!;

    let bix = 0;

    for (const block of blocks) {
      let oldPos: number | null = null;
      let position = block.location; // Always start at block's absolute location
      
      // Note: C# version had position management logic, but we always use block.location

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
          } else if (this.isTableEntry(currentObj)) {
            currentObj = (currentObj as TableEntry).object;
            continue;
          } else if (currentObj instanceof Op) {
            const op = currentObj as Op;
            buf[position++] = op.code & 0xFF;
            opos += op.size;

            for (const operand of op.operands) {
              processObject(operand, op);
            }
            break;
          } else if (currentObj instanceof Uint8Array) {
            const arr = currentObj as Uint8Array;
            for (let i = 0; i < arr.length; i++) {
              buf[position + i] = arr[i];
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

            const operatorIdx = this.indexOfAny(label, RomProcessingConstants.OPERATORS);
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
            let target: AsmBlock | undefined;

            if (includeLookup.has(labelUpper)) {
              target = includeLookup.get(labelUpper);
              loc = target!.location;
            } else if (chunkLookup.has(labelUpper)) {
              loc = chunkLookup.get(labelUpper)!;
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

            let type = Address.typeFromCode(str[0]);
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
            } else if (useMarker && target) {
              let markerOffset = 0;
              for (const part of target.objList) {
                if (this.isStringMarker(part)) {
                  loc += markerOffset;
                  break;
                } else {
                  markerOffset += RomProcessingConstants.getSize(part);
                }
              }
            }

            switch (type) {
              case AddressType.Offset:
                currentObj = new Word(loc);
                continue;
              case AddressType.Bank:
                currentObj = new Byte(((loc >> 16) | ((loc & 0xFFFF) >= 0x8000 ? 0x80 : 0xC0)));
                continue;
              case AddressType.WBank:
                currentObj = new Word(((loc >> 16) | ((loc & 0xFFFF) >= 0x8000 ? 0x80 : 0xC0)));
                continue;
              case AddressType.Address:
                currentObj = new Long(loc | ((loc & 0xFFFF) >= 0x8000 ? 0x800000 : 0xC00000));
                continue;
              default:
                currentObj = new Byte(loc);
                continue;
            }
            
          } else if (currentObj instanceof TypedNumber) {
            let value = currentObj.value;
            for (let i = 0; i < currentObj.size; i++) {
              buf[position++] = value & 0xFF;
              value >>= 8;
            }
            break;
          } else if (typeof currentObj === 'number') {
            const num = currentObj as number;
            const size = parentOp?.size ?? 0;
            
            if (num <= 0xFF && size <= 2) {
              // byte
              buf[position] = num & 0xFF;
              position++;
            } else if (num <= 0xFFFF && size <= 3) {
              // ushort
              buf[position] = num & 0xFF;
              buf[position + 1] = (num >> 8) & 0xFF;
              position += 2;
            } else if (num <= 0xFFFFFF && size <= 4) {
              // 3-byte
              buf[position] = num & 0xFF;
              buf[position + 1] = (num >> 8) & 0xFF;
              buf[position + 2] = (num >> 16) & 0xFF;
              position += 3;
            } else {
              // 4-byte
              buf[position] = num & 0xFF;
              buf[position + 1] = (num >> 8) & 0xFF;
              buf[position + 2] = (num >> 16) & 0xFF;
              buf[position + 3] = (num >> 24) & 0xFF;
              position += 4;
            }
            break;
          } else if (this.isStringMarker(currentObj)) {
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
  private indexOfAny(str: string, chars: string[]): number {
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
  private isStringMarker(obj: unknown): obj is StringMarker {
    return typeof obj === 'object' && obj !== null && 'offset' in obj;
  }

  private isTableEntry(obj: unknown): obj is TableEntry {
    return typeof obj === 'object' && obj !== null && 'location' in obj && 'object' in obj;
  }
}


