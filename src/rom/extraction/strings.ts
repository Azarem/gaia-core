import { RomDataReader } from './reader';
import { 
  Address, 
  AddressSpace, 
  AddressType, 
  MemberType, 
  RomProcessingConstants,
  ChunkFileUtils, 
  TableEntry 
} from '../../types';
import type { DbStringType, DbStringCommand, DbStringLayer } from '../../database';
import type { StringWrapper } from '../../types';
import type { BlockReader } from './blocks';
import { indexOfAny } from '../../utils';

/**
 * Reads and processes strings from ROM data
 * Converted from GaiaLib/Rom/Extraction/StringReader.cs
 */
export class StringReader {
  public static readonly STRING_REFERENCE_CHARACTERS = ['~', '^'];

  private readonly _blockReader: BlockReader;
  private readonly _romDataReader: RomDataReader;

  constructor(blockReader: BlockReader) {
    this._blockReader = blockReader;
    this._romDataReader = blockReader._romDataReader;
  }

  private resolveCommand(cmd: DbStringCommand, builder: string[]): void {

    builder.push(cmd.dictionary ? "{" : "[");
    builder.push(cmd.name);

    let first = true;
    for (const t of cmd.types ?? []) {
      builder.push(first ? ":" : ",");
      first = false;

      switch (t) {
        case MemberType.Byte:
          builder.push(this._romDataReader.readByte().toString(16).toUpperCase());
          break;
        case MemberType.Word:
          builder.push(this._romDataReader.readUShort().toString(16).toUpperCase());
          break;
        case MemberType.Offset:
          const loc = this._romDataReader.readUShort() | 
            (Address.resolveBank(this._romDataReader.position, this._blockReader._root.config.memoryMode) << 16);
          builder.push(`^${loc.toString(16).toUpperCase().padStart(6, '0')}`);
          break;
        case MemberType.Address:
          builder.push(`~${this._romDataReader.readAddress().toString(16).toUpperCase().padStart(6, '0')}`);
          break;
        case MemberType.Binary:
          let sfirst = true;
          do {
            const r = this._romDataReader.readByte();
            if (cmd.delimiter !== undefined && r === cmd.delimiter) {
              break;
            }
            if (sfirst) {
              sfirst = false;
            } else {
              builder.push(',');
            }
            builder.push(r.toString(16).toUpperCase());
          } while (this._blockReader.partCanContinue());
          break;
        default:
          throw new Error('Unsupported member type');
      }
    }
      
    builder.push(cmd.dictionary ? "}" : "]");
  }

  public parseString(stringType: DbStringType, fixedSize: number): StringWrapper {
    const commands = stringType.commandLookup;
    const dictionaries = stringType.dictionaries;
    const builder: string[] = [];
    const strLoc = this._romDataReader.position;
    const terminator = stringType.terminator;
    const modifiers = stringType.modifiers;
    let currentLayer = stringType.layers[0];

    do {
      const c = this._romDataReader.readByte();
      if (c === terminator) {
        if (stringType.greedyTerminator) {
          while (this._romDataReader.peekByte() === terminator && this._blockReader.partCanContinue()) {
            this._romDataReader.position++;
          }
        }
        break;
      }

      let cmd: DbStringCommand | undefined = undefined;

      const mod = modifiers ? modifiers[c] : undefined;
      if(mod) {
        const prev = builder[builder.length - 1];
        const next = mod[prev]
        if(next) builder[builder.length - 1] = next;
        else builder.push(currentLayer.map[c - (currentLayer.base ?? 0)]);
      } else if ((cmd = commands[c])) {
        this.resolveCommand(cmd, builder);
        if (cmd.halt) {
          break;
        }
      } else {
        let found = false;

        for(const dictionary of Object.values(dictionaries)) {
          if(dictionary.command === undefined && dictionary.base !== undefined 
            && c >= dictionary.base && c < dictionary.base + dictionary.entries.length) {
            builder.push(`{${c.toString(16).padStart(2, '0').toUpperCase()}}`);
            found = true;
            break;
          }
        }

        if(!found) {
          for(const layer of stringType.layers) {
            if(layer.on !== undefined) {
              if(c === layer.on) {
                currentLayer = layer;
                builder.push("[--]");
                found = true;
                break;
              }
            } else if(layer.base && c >= layer.base && c < layer.base + layer.map.length){
              builder.push(layer.map[c - layer.base]);
              found = true;
              break;
            }
          }
        }
        
        if(!found) {
          let index = c - (currentLayer.base ?? 0);
          if(typeof currentLayer.shiftBit === 'number') {
            const shiftBit = 1 << currentLayer.shiftBit;
            const lowerFlag = shiftBit - 1;
            const upperFlag = ~shiftBit & ~lowerFlag;
            index = ((index & upperFlag) >> 1) | (index & lowerFlag);
          }
          //const index = currentLayer.shift ? DbStringTypeUtils.getShiftDown(currentLayer.shift)(c) : c - (currentLayer.base ?? 0);
          if (index >= 0 && index < currentLayer.map.length) {
            builder.push(currentLayer.map[index]);
          } else {
            // Fallback for unknown characters
            builder.push(`[${c.toString(16).toUpperCase()}]`);
          }
        }
      }

      if(fixedSize && this._romDataReader.position >= strLoc + fixedSize) break;
      
    } while (this._blockReader.partCanContinue());

    if(fixedSize && this._romDataReader.position < strLoc + fixedSize) this._romDataReader.position = strLoc + fixedSize;

    return {
      string: builder.join(''),
      type: stringType,
      marker: 0,
      location: strLoc,
      fixedSize
    };
  }

  public resolveString(sw: StringWrapper, isBranch: boolean): void {
    let str = sw.string;
    let ix = indexOfAny(str, StringReader.STRING_REFERENCE_CHARACTERS);

    while(ix >= 0) {
      if(ix + 6 >= str.length) break;
    
      const hexStr = str.substring(ix + 1, ix + 7);
      let sloc = parseInt(hexStr, 16);

      if(isNaN(sloc)) break;
    
      const addrs = new Address((sloc >> 16) & 0xFF, sloc & 0xFFFF, this._blockReader._root.config.memoryMode);
      if (addrs.isROM) {
        sloc = addrs.toLocation();
        this._blockReader.resolveInclude(sloc, false);
        const name = this._blockReader._referenceManager.resolveName(sloc, AddressType.Unknown, false);
        const opix = indexOfAny(name, RomProcessingConstants.OPERATORS);
        
        if (opix > 0) {
          const offsetStr = name.substring(opix + 1);
          let offset: number;
          
          if (offsetStr === 'M') {
            offset = this._blockReader._referenceManager.markerTable.get(sloc) || 0;
          } else {
            offset = parseInt(offsetStr, 16) || 0;
          }

          if (name[opix] === '-') {
            offset = -offset;
          }

          const targetName = name.substring(0, opix);
          const target = sloc - offset;
          
          // Try to find the target using IsOutside pattern
          const [isOutside, block, part] = ChunkFileUtils.isOutsideWithPart(this._blockReader._enrichedChunks, this._blockReader._currentChunk!, sloc);
          if (part != null) {
            const entry = part.objList?.find((x): x is TableEntry => 
              typeof x === 'object' && x !== null && 'location' in x && 'object' in x && (x as TableEntry).location === target) as TableEntry | undefined;
            if (entry && entry.object) {
              (entry.object as StringWrapper).marker = offset;
            }
          }
        }
      }
      
      ix = indexOfAny(str, StringReader.STRING_REFERENCE_CHARACTERS, ix + 7);
    }
  }

}