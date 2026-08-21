import { Op } from '../../types/assembly';
import { Registers } from '../../assembly';
import { RomDataReader } from './reader';
import { StringReader } from './strings';
import { ReferenceManager } from './references';
import {
  Address,
  AddressSpace,
  AddressType,
  ChunkFileUtils,
  LocationWrapper,
  MemberType,
  StructDef,
  Byte,
  Word, 
  CpuMode,
} from '../../types';
import type { DbStringType } from '../../database';
import type { BlockReader } from './blocks';

/**
 * Handles parsing of different data types from ROM
 * Converted from GaiaLib/Rom/Extraction/TypeParser.cs
 */
export class TypeParser {
  private readonly _blockReader: BlockReader;
  private readonly _romDataReader: RomDataReader;
  private readonly _stringReader: StringReader;
  private readonly _stringTypes: Record<string, DbStringType>;
  private readonly _referenceManager: ReferenceManager;

  constructor(blockReader: BlockReader) {
    this._blockReader = blockReader;
    this._referenceManager = blockReader._referenceManager;
    this._romDataReader = blockReader._romDataReader;
    this._stringReader = blockReader._stringReader;
    this._stringTypes = blockReader._root.stringTypes;
  }

  public parseType(typeName: string, reg: Registers | null, depth: number, bank?: number, single?: boolean): unknown {
    
    const objects: unknown[] = [];
    const arrayIx = typeName.indexOf('[');
    const arrayCount = arrayIx !== -1 ? parseInt(typeName.substring(arrayIx + 1, typeName.length - 1), 16) : 0;
    const arrayTypeName = arrayIx !== -1 ? typeName.substring(0, arrayIx) : typeName;
    
    if(arrayCount > 0) {
      for(let i = 0; i < arrayCount; i++) {
        objects.push(this.parseType(arrayTypeName, reg, depth + 1, bank, true));
      }
      return objects;
    }
    
    const isSoft = arrayTypeName[0] === '~';
    const realTypeName = isSoft ? arrayTypeName.substring(1) : arrayTypeName;
    
    const fixedIx = realTypeName.indexOf('(');
    const fixedSize = fixedIx !== -1 ? parseInt(realTypeName.substring(fixedIx + 1, realTypeName.length - 1), 16) : 0;
    let fixedTypeName = fixedIx !== -1 ? realTypeName.substring(0, fixedIx) : realTypeName;

    const stringType = this._stringTypes[fixedTypeName];
    
    if (stringType) return this._stringReader.parseString(stringType, fixedSize);

    // Shortcut for symbolic Offsets
    if (fixedTypeName[0] === '&') {
      const bankIx = fixedTypeName.indexOf('$');
      if(bankIx !== -1) {
        if(fixedTypeName[bankIx + 1] === '$') bank = reg?.value['dataBank'];
        else bank = parseInt(fixedTypeName.substring(bankIx + 1, fixedTypeName.length), 16);
        fixedTypeName = fixedTypeName.substring(0, bankIx);
      }
      return this.parseLocation(this._romDataReader.readUShort(), bank, fixedTypeName.substring(1), AddressType.Offset, isSoft, reg);
    }

    // Shortcut for symbolic Addresses
    if (fixedTypeName[0] === '@') {
      return this.parseLocation(this._romDataReader.readUShort(), this._romDataReader.readByte(), fixedTypeName.substring(1), AddressType.Address, isSoft);
    }
    
    // Shortcut for symbolic Locations
    if (fixedTypeName[0] === '%') {
      return this.parseLocation(this._romDataReader.readUShort(), this._romDataReader.readByte(), fixedTypeName.substring(1), AddressType.Location, isSoft);
    }
    
    // Shortcut for symbolic OddLocations
    if (fixedTypeName[0] === '!') {
      return this.parseLocation(this._romDataReader.readUShort(), this._romDataReader.readByte(), fixedTypeName.substring(1), AddressType.OddLocation, isSoft);
    }
    
    // const isFixed = realTypeName[realTypeName.length - 1] === ')';
    // let fixedTypeName = realTypeName;
    // let fixedSize = 0;

    // if(isFixed) {
    //   const startIx = realTypeName.indexOf('(');
    //   fixedTypeName = realTypeName.substring(0, startIx);
    //   fixedSize = parseInt(realTypeName.substring(startIx + 1, realTypeName.length - 1), 10);
    // }


    // Parse raw values
    const mType = this.tryParseMemberType(fixedTypeName);
    if (mType !== null) {
      switch (mType) {
        case MemberType.Byte:
          return new Byte(this._romDataReader.readByte());
        case MemberType.Word:
          return new Word(this.parseWordSafe());
        case MemberType.Offset:
          return this.parseLocation(this._romDataReader.readUShort(), bank, null, AddressType.Offset, isSoft);
        case MemberType.Address:
          return this.parseLocation(this._romDataReader.readUShort(), this._romDataReader.readByte(), null, AddressType.Address, isSoft);
        case MemberType.Location:
          return this.parseLocation(this._romDataReader.readUShort(), this._romDataReader.readByte(), null, AddressType.Location, isSoft);
        case MemberType.Binary:
          return this.parseBinary(fixedSize);
        case MemberType.Code:
        case MemberType.Branch:
          return this.parseCode(reg!);
        default:
          throw new Error('Invalid member type');
      }
    }

    const parentType = this._blockReader._root.structs[fixedTypeName];
    if (!parentType) {
      throw new Error(`Unknown type: ${fixedTypeName}`);
    }

    const delimiter = parentType.delimiter;
    const discOffset = parentType.discriminator;
    const discLogic = parentType.discriminatorLogic;
    const discSize = parentType.discriminatorSize ?? 1;
    const nullValue = parentType.null;

    if(delimiter === undefined && this._blockReader.delimiterReached(nullValue)) {
      objects.push({ name: parentType.name, parts: [ "null" ]})
      return objects;
    }

    // Continue to iterate until end or delimiter is reached
    let delReached: boolean;
    while (!(delReached = this._blockReader.delimiterReached(delimiter))) {
      const startPosition = this._romDataReader.position;
      let targetType = parentType;

      if(this._blockReader.delimiterReached(nullValue)) {
        objects.push({ name: parentType.name, parts: [ "null" ]})
      } else {        
        // If a discriminator offset is present, use it to identify the type
        if (discOffset !== undefined) {
          // Get discriminator position in ROM
          const discPosition = this._romDataReader.position + discOffset;

          // Get discriminator value
          const disc = this._romDataReader.romData[discPosition];
          const disc16 = this._romDataReader.romData[discPosition + 1] << 8 | disc;

          // Match discriminator to type
          const matchedStruct = Object.values(this._blockReader._root.structs).find(x => {
            if (x.parent !== fixedTypeName || x.discriminator === undefined) return false;
            const size = x.discriminatorSize ?? discSize;
            const value = size > 1 || x.discriminator > 255 ? disc16 : disc;
            if(discLogic === '&') return (x.discriminator & value) !== 0;
            return x.discriminator === value;
          });
          targetType = matchedStruct || parentType; // Default to parent if no match is found
          
          // Advance position (hide value) if discriminator is first
          if (discOffset === 0 && parentType != targetType && discLogic === '=') {
            this._romDataReader.position++;
            if((targetType.discriminatorSize ?? discSize) > 1 || targetType.discriminator! >= 256) this._romDataReader.position++;
          }
        }

        const types = targetType.types;
        if (types) {
          const memberCount = types.length;
          const prevPosition = this._romDataReader.position;
          const parts = new Array(memberCount); // Create new member collection
          const def: StructDef = { name: targetType.name, parts, location: prevPosition };

          let partLocation = prevPosition;

          // Parse each member of the struct
          for (let i = 0; i < memberCount; i++) {
            const transform = this._blockReader._transformProcessor.getTransform();
            parts[i] = this.parseType(types[i], reg, depth + 1, bank);
            this._blockReader._transformProcessor.applyTransform(transform, i, parts);
          }

          // Advance (hide) discriminator if it is the last member
          if (discOffset !== undefined 
            && discOffset === this._romDataReader.position - prevPosition
            && targetType.discriminator !== undefined
            && discLogic === '='
            && types?.length > 0) {
            this._romDataReader.position++;
            if((targetType.discriminatorSize ?? discSize) > 1 || targetType.discriminator >= 256) this._romDataReader.position++;
          }

          if(targetType.tail !== undefined) {
            this._romDataReader.position += targetType.tail;
          }

          objects.push(def);
        } else {
          this._romDataReader.position++;
        }
      }
      
      // Roll back work if struct overflows a chunk boundary
      // SHOULD only happen for the inventory sprite map
      let checkPosition = startPosition;
      while (++checkPosition < this._romDataReader.position) {
        const struct = this._referenceManager.tryGetStruct(checkPosition)
        if (struct.found && struct.chunkType !== "Code" && struct.chunkType !== "Branch") {
          this._romDataReader.position = checkPosition;
          break;
        }
      }

      // Stop if the reader should not continue
      if (!this._blockReader.partCanContinue()) break;
      if (nullValue !== undefined) break;
      if(single) break;
    }

    // If we have reached delimiter and at depth 0, note the struct
    if (delReached && depth === 0) {
      this._referenceManager.tryAddStruct(this._romDataReader.position, typeName);
    }

    if(single) return objects[0];
    else return objects;
  }

  private tryParseMemberType(memberTypeName: string): MemberType | null {
    // Check if the string matches any MemberType enum value (case-insensitive)
    const upperName = memberTypeName.toUpperCase();
    for (const [key, value] of Object.entries(MemberType)) {
      if (key.toUpperCase() === upperName) {
        return value;
      }
    }
    return null;
  }

  private parseWordSafe(): number {
    return this._referenceManager.containsStruct(this._romDataReader.position + 1)
      ? this._romDataReader.readByte()
      : this._romDataReader.readUShort();
  }

  private parseBinary(size: number): Uint8Array {
    // Store old position for length calculation
    const startPosition = this._romDataReader.position;

    //Calculate length if it is not provided
    let len = 0;

    // Advance the reader until we reach the end of the section
    do {
      this._romDataReader.position++;
      len++;
    } while (len !== size && this._blockReader.partCanContinue());

    // Create buffer for the raw bytes
    const outBuffer = new Uint8Array(len);

    // Copy raw bytes from ROM to buffer
    for (let i = 0; i < len; i++) {
      outBuffer[i] = this._romDataReader.romData[startPosition + i];
    }

    return outBuffer;
  }

  private parseLocation(offset: number, bank: number | undefined, typeName: string | null, addrType: AddressType, isSoft: boolean = false): unknown {
    // If bank is not provided and offset is 0, it should resolve to #$0000
    if ((bank === undefined || bank === null) && (offset === 0 || offset === 0xFFFF)) {
      return new Word(offset);
    }

    const hasOffset = this._romDataReader.offset !== undefined;

    if(hasOffset) offset -= this._romDataReader.offset!;

    let adrs: Address;
    let loc: number;
    if(addrType === AddressType.Location || hasOffset) {
      loc = offset | (bank! << 16);
      if(hasOffset && !this._blockReader._currentChunk!.compressed) loc += this._blockReader._currentChunk!.location;
      //adrs = Address.fromInt(loc, this._blockReader._root.config.memoryMode);
    } else {
      if(addrType === AddressType.OddLocation) {
        const bankFlag = this._blockReader._root.config.cpuMode === CpuMode.Fast ? Address.FAST_BANK_FLAG : 0;
        const bankReal = this._romDataReader.position >> 16;
        const isVeryOdd = bankReal !== this._blockReader._root.config.oddLocationBase;
        const bankSpan = this._blockReader._root.config.oddLocationSpan ?? (this._romDataReader.romData.length >> 16);

        let oddBank = bank! << 1 | (offset & 0x8000 ? 1 : 0);
        offset &= 0x7FFF;

        oddBank += bankReal;

        if(oddBank >= bankSpan) {
          oddBank += Address.DATA_BANK_FLAG - bankSpan; 
        } else if(isVeryOdd) {
          oddBank |= Address.DATA_BANK_FLAG;
        } else {
          offset |= 0x8000;
        }

        bank = oddBank & 0x7F | bankFlag;
      }
      // Bank cannot be null, instead use bank from current position
      const resolvedBank = bank ?? Address.resolveBank(this._romDataReader.position, this._blockReader._root.config.memoryMode);
  
      // Create the address with resolved bank
      adrs = new Address(resolvedBank, offset, this._blockReader._root.config.memoryMode, addrType === AddressType.Offset);
  
      // If we have a system address, keep it as is
      if (!adrs.isROM) return adrs;
  
      // Convert address to ROM location
      loc = adrs.toLocation();
    }


    // If the location is inside the current block and there is no rewrite for it...
    if (
      //this._blockReader._currentChunk &&
      //ChunkFileUtils.isInside(this._blockReader._currentChunk, loc) &&
      typeName && 
      (hasOffset || !this._blockReader._root.rewrites[loc])
    ) {
      // Normalize the type name to default to current part definition
      //const resolvedTypeName = typeName ?? this._blockReader._currentAsmBlock!.structName ?? 'Binary';

      // Add the struct type to our chunk table if it is not already present
      this._referenceManager.tryAddStruct(loc, isSoft ? "~" + typeName : typeName);
      //if(!oldStruct || oldStruct === 'Branch') this._referenceManager.structTable.set(loc, typeName);

      //const resolvedTypeName = typeName[0] === '~' ? typeName.substring(1) : typeName;
      // If the location is not already in the reference table, add it
      //const referenceName = `${resolvedTypeName.toLowerCase()}_${adrs.toString()}`;
      const referenceName = `${typeName.toLowerCase()}_${loc.toString(16).toUpperCase().padStart(6, '0')}`;
      this._referenceManager.tryAddName(loc, isSoft ? "~" + referenceName : referenceName);
    }

    return new LocationWrapper(loc, addrType);
  }

  private parseCode(reg: Registers): Op[] {
    // Output list
    const opList: Op[] = [];

    let first = true;
    while (this._romDataReader.position < this._blockReader._partEnd) {
      // Check the chunk table for a new type block, but not on the first iteration
      if (first) {
        first = false;
      } else {
        const struct = this._referenceManager.tryGetStruct(this._romDataReader.position);
        if (struct.found && struct.chunkType !== "Branch") break;
      }

      // Process register adjustments before parse
      if (reg) {
        this._blockReader.hydrateRegisters(reg);
      }

      // Parse instruction
      const op = this._blockReader._asmReader.parseAsm(reg);

      // Add instruction to list
      opList.push(op);
    }

    return opList;
  }
} 