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
} from '../../types';
import type { DbRoot, DbBlock, DbPart } from '../../database';
import type { DbStruct } from '../../database';
import type { DbStringType } from '../../database';
import { AsmReader } from './asm';
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

  public parseType(typeName: string, reg: Registers | null, depth: number, bank?: number): unknown {
    
    // Shortcut for symbolic Offsets
    if (typeName[0] === '&') {
      return this.parseLocation(this._romDataReader.readUShort(), bank, typeName.substring(1), AddressType.Offset);
    }

    // Shortcut for symbolic Addresses
    if (typeName[0] === '@') {
      return this.parseLocation(this._romDataReader.readUShort(), this._romDataReader.readByte(), typeName.substring(1), AddressType.Address);
    }

    // Check string types
    const stringType = this._stringTypes[typeName];
    if (stringType) {
      return this._stringReader.parseString(stringType);
    }

    // Parse raw values
    const mType = this.tryParseMemberType(typeName);
    if (mType !== null) {
      switch (mType) {
        case MemberType.Byte:
          return new Byte(this._romDataReader.readByte());
        case MemberType.Word:
          return new Word(this.parseWordSafe());
        case MemberType.Offset:
          return this.parseLocation(this._romDataReader.readUShort(), bank, null, AddressType.Offset);
        case MemberType.Address:
          return this.parseLocation(this._romDataReader.readUShort(), this._romDataReader.readByte(), null, AddressType.Address);
        case MemberType.Binary:
          return this.parseBinary();
        case MemberType.Code:
          return this.parseCode(reg!);
        default:
          throw new Error('Invalid member type');
      }
    }

    const parentType = this._blockReader._root.structs[typeName];
    if (!parentType) {
      throw new Error(`Unknown type: ${typeName}`);
    }

    const delimiter = parentType.delimiter;
    const discOffset = parentType.discriminator;
    const objects: unknown[] = [];

    // Continue to iterate until end or delimiter is reached
    let delReached: boolean;
    while (!(delReached = this._blockReader.delimiterReached(delimiter))) {
      const startPosition = this._romDataReader.position;
      let targetType = parentType;

      // If a discriminator offset is present, use it to identify the type
      if (discOffset !== undefined) {
        // Get discriminator position in ROM
        const discPosition = this._romDataReader.position + discOffset;

        // Get discriminator value
        const desc = this._romDataReader.romData[discPosition];

        // Advance position (hide value) if discriminator is first
        if (discOffset === 0) {
          this._romDataReader.position++;
        }

        // Match discriminator to type
        const matchedStruct = Object.values(this._blockReader._root.structs).find(
          x => x.parent === typeName && x.discriminator === desc
        );
        targetType = matchedStruct || parentType; // Default to parent if no match is found
      }

      const types = targetType.types;
      if (types && types.length > 0) {
        const memberCount = types.length;
        const prevPosition = this._romDataReader.position;
        const parts = new Array(memberCount); // Create new member collection
        const def: StructDef = { name: targetType.name, parts };

        // Parse each member of the struct
        for (let i = 0; i < memberCount; i++) {
          parts[i] = this.parseType(types[i], null, depth + 1, bank);
        }

        // Advance (hide) discriminator if it is the last member
        if (discOffset !== undefined && discOffset === this._romDataReader.position - prevPosition) {
          this._romDataReader.position++;
        }

        objects.push(def);
      }

      // Roll back work if struct overflows a chunk boundary
      // SHOULD only happen for the inventory sprite map
      let checkPosition = startPosition;
      while (++checkPosition < this._romDataReader.position) {
        if (this._referenceManager.containsStruct(checkPosition)) {
          this._romDataReader.position = checkPosition;
          break;
        }
      }

      // Stop if the reader should not continue
      if (!this._blockReader.partCanContinue()) {
        break;
      }
    }

    // If we have reached delimiter and at depth 0, note the struct
    if (delReached && depth === 0) {
      this._referenceManager.tryAddStruct(this._romDataReader.position, typeName);
    }

    return objects;
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

  private parseBinary(): Uint8Array {
    // Store old position for length calculation
    const startPosition = this._romDataReader.position;

    // Advance the reader until we reach the end of the section
    do {
      this._romDataReader.position++;
    } while (this._blockReader.partCanContinue());

    // Length is determined by the new position relative to the old
    const len = this._romDataReader.position - startPosition;

    // Create buffer for the raw bytes
    const outBuffer = new Uint8Array(len);

    // Copy raw bytes from ROM to buffer
    for (let i = 0; i < len; i++) {
      outBuffer[i] = this._romDataReader.romData[startPosition + i];
    }

    return outBuffer;
  }

  private parseLocation(offset: number, bank: number | undefined, typeName: string | null, addrType: AddressType): unknown {
    // If bank is not provided and offset is 0, it should resolve to #$0000
    if ((bank === undefined || bank === null) && offset === 0) {
      return new Word(offset);
    }

    // Bank cannot be null, instead use bank from current position
    const resolvedBank = bank ?? (this._romDataReader.position >> 16);

    // Create the address with resolved bank
    const adrs = new Address(resolvedBank, offset);

    // If we have a system address, keep it as is
    if (adrs.space !== AddressSpace.ROM) {
      return adrs;
    }

    // Convert address to ROM location
    const loc = adrs.toInt();

    // If the location is inside the current block and there is no rewrite for it...
    if (
      this._blockReader._currentChunk &&
      ChunkFileUtils.isInside(this._blockReader._currentChunk, loc) &&
      !this._blockReader._root.rewrites[loc]
    ) {
      // Normalize the type name to default to current part definition
      const resolvedTypeName = typeName ?? this._blockReader._currentAsmBlock!.structName ?? 'Binary';

      // Add the struct type to our chunk table if it is not already present
      this._referenceManager.tryAddStruct(loc, resolvedTypeName);

      // If the location is not already in the reference table, add it
      const referenceName = `${resolvedTypeName.toLowerCase()}_${loc.toString(16).toUpperCase().padStart(6, '0')}`;
      this._referenceManager.tryAddName(loc, referenceName);
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
      } else if (this._referenceManager.containsStruct(this._romDataReader.position)) {
        break;
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