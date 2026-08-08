import { RomDataReader } from './reader';
import {
  Address,
  AddressType,
  AddressSpace,
  LocationWrapper,
  MemberType,
  Byte,
  Word,
} from '../../types';
import type { CopDef } from '../../database';
import type { BlockReader } from './blocks';
import { TransformProcessor } from './transforms';

/**
 * Handles COP (Coprocessor) command processing
 * Converted from GaiaLib/Rom/Extraction/CopCommandProcessor.cs
 */
export class CopCommandProcessor {
  private readonly _blockReader: BlockReader;
  private readonly _romDataReader: RomDataReader;
  private readonly _transformProcessor: TransformProcessor;

  constructor(blockReader: BlockReader, transformProcessor: TransformProcessor) {
    this._blockReader = blockReader;
    this._romDataReader = blockReader._romDataReader;
    this._transformProcessor = transformProcessor;
  }

  /**
   * Parses a COP command based on its definition
   */
  public parseCopCommand(copDef: CopDef, operands: unknown[], reg: Registers): void {

    let parts = copDef.parts;

    if(copDef.conditions) {
      for(const condition of copDef.conditions) {
        let value = this._romDataReader.romData[this._romDataReader.position + condition.offset];
        if(condition.value >= 256) {
          value |= this._romDataReader.romData[this._romDataReader.position + condition.offset + 1] << 8;
        }
        if(condition.logic === '&') {
          if(value & condition.value) {
            parts = condition.parts;
            break;
          }
        } else if(value === condition.value) {
          parts = condition.parts;
          break;
        }
      }
    }

    for (let partStr of parts) {
      let bank : number | null = null;

      //Trim the end for bank hints
      const bankHintIx = partStr.indexOf('$')
      if(bankHintIx > 0) {
        if(partStr[bankHintIx + 1] === '$') bank = reg.value['dataBank'] ?? this._blockReader._root.config.defaultBank ?? 0x81;
        else bank = parseInt(partStr.substring(bankHintIx + 1), 16);
        partStr = partStr.substring(0, bankHintIx);
      }

      // Use the first character to determine the address type (for pointers)
      const addrType = Address.typeFromCode(partStr[0]);
      const isPtr = addrType !== AddressType.Unknown;
      
      // Reference type is the target of a pointer from partStr, or the struct type if not a pointer
      const referenceType = isPtr ? partStr.substring(1) : this._blockReader._currentAsmBlock!.structName ?? 'Binary';
      
      // Member type resolves to the underlying pointer type, or partStr
      const memberTypeName = isPtr ? addrType.toString() : partStr;

      // Resolve member type name to a MemberType enum
      const memberType = this.tryParseMemberType(memberTypeName);
      if (memberType === null) {
        throw new Error('Cannot use structs in cop def'); // Only basic types are allowed in COP definitions
      }
      
      const xform = this._transformProcessor.getTransform();

      operands.push(this.readMemberTypeValue(memberType, partStr, isPtr, referenceType, addrType, bank));

      if(xform) {
        this._transformProcessor.applyTransform(xform, operands.length - 1, operands);
      }

      // If there is a label, ignore reading and use the label instead
      // const label = this._blockReader._root.labels[this._romDataReader.position];
      // if (label) {
      //   this._romDataReader.position += this.getMemberTypeSize(memberType);
      //   operands.push(label);
      // } else {
      //   operands.push(this.readMemberTypeValue(memberType, partStr, isPtr, referenceType, addrType, bank));
      // }

    }
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

  private getMemberTypeSize(memberType: MemberType): number {
    switch (memberType) {
      case MemberType.Byte:
        return 1;
      case MemberType.Word:
      case MemberType.Offset:
        return 2;
      case MemberType.Address:
        return 3;
      default:
        throw new Error('Unsupported COP member type');
    }
  }

  private readMemberTypeValue(
    memberType: MemberType,
    partStr: string,
    isPtr: boolean,
    referenceType: string,
    addrType: AddressType,
    bank: number | null
  ): unknown {
    switch (memberType) {
      case MemberType.Byte:
        return new Byte(this._romDataReader.readByte());
      case MemberType.Word:
        return new Word(this._romDataReader.readUShort());
      case MemberType.Offset:
        return this.createCopLocation(this._romDataReader.readUShort(), bank, partStr, isPtr, referenceType, addrType);
      case MemberType.Address:
        return this.createCopLocation(this._romDataReader.readUShort(), this._romDataReader.readByte(), partStr, isPtr, referenceType, addrType);
      default:
        throw new Error('Unsupported COP member type');
    }
  }

  private createCopLocation(
    offset: number, 
    bank: number | null, 
    partStr: string, 
    isPtr: boolean, 
    otherStr: string, 
    type: AddressType
  ): unknown {
    if (bank === null && offset === 0) {
      return new Word(offset);
    }

    const resolvedBank = bank ?? Address.resolveBank(this._romDataReader.position, this._blockReader._root.config.memoryMode);

    const addr = new Address(resolvedBank, offset, this._blockReader._root.config.memoryMode);
    if (addr.isROM) {
      const location = addr.toLocation();
      if (partStr !== 'Address' && isPtr && !this._blockReader._root.rewrites[location]) {
        this._blockReader.noteType(location, otherStr, true);
      }

      // When address is unknown, try to use the part string (for Offset or Address)
      if (type === AddressType.Unknown) {
        type = this.tryParseAddressType(partStr) ?? AddressType.Unknown;
      }

      return new LocationWrapper(location, type);
    }
    return addr;
  }

  private tryParseAddressType(addressTypeName: string): AddressType | null {
    // Check if the string matches any AddressType enum value (case-insensitive)
    const upperName = addressTypeName.toUpperCase();
    for (const [key, value] of Object.entries(AddressType)) {
      if (key.toUpperCase() === upperName) {
        return value;
      }
    }
    return null;
  }
} 