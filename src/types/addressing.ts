import { RomProcessingConstants } from './constants';


/**
 * Address type classifications
 * Converted from GaiaLib/Enum/AddressType.cs
 */
export enum AddressType {
  Unknown = 'Unknown',
  Bank = 'Bank',
  Offset = 'Offset',
  Address = 'Address',
  WBank = 'WBank',
  Relative = 'Relative'
}

/**
 * Address space types
 * Converted from GaiaLib/Types/Address.cs
 */
export enum AddressSpace {
  None = 'None',
  ROM = 'ROM',
  WRAM = 'WRAM',
  SRAM = 'SRAM',
  System = 'System'
}

/**
 * SNES address structure
 * Converted from GaiaLib/Types/Address.cs
 */
export class Address {
  public offset: number;
  public bank: number;

  public static readonly UPPER_BANK = 0x8000;
  public static readonly DATA_BANK_FLAG = 0x40;
  public static readonly FAST_BANK_FLAG = 0x80;

  constructor(bank: number, offset: number) {
    this.bank = bank & 0xFF;
    this.offset = offset & 0xFFFF;
  }

  public get isROM(): boolean {
    return this.space === AddressSpace.ROM;
  }

  public get isCodeBank(): boolean {
    return (this.bank & Address.DATA_BANK_FLAG) === 0;
  }

  public get space(): AddressSpace {
    // Check if bank is in lower half (bank & 0x40 == 0)
    if (this.isCodeBank) {
      // Memory map for lower banks
      if (this.offset >= RomProcessingConstants.PAGE_SIZE) {
        return AddressSpace.ROM;
      } else if (this.offset >= 0x6000 && (this.bank & 0x20) !== 0) {
        return AddressSpace.SRAM;
      } else if (this.offset < 0x2000) {
        return AddressSpace.WRAM;
      } else if (this.offset < 0x2100) {
        return AddressSpace.None;
      } else if (this.offset < 0x2200) {
        return AddressSpace.System;
      } else if (this.offset < 0x3000) {
        return AddressSpace.None;
      } else if (this.offset < 0x4100) {
        return AddressSpace.System;
      } else if (this.offset < 0x4200) {
        return AddressSpace.None;
      } else if (this.offset < 0x4500) {
        return AddressSpace.System;
      } else {
        return AddressSpace.None;
      }
    }

    if (this.bank === 0x7E || this.bank === 0x7F) {
      return AddressSpace.WRAM;
    }

    return AddressSpace.ROM;
  }

  public toInt(): number {
    return ((this.bank & 0x3F) << 16) | this.offset;
  }

  public toString(): string {
    return ((this.bank << 16) | this.offset).toString(16).toUpperCase().padStart(6, '0');
  }

  public static fromInt(addr: number): Address {
    return new Address((addr >> 16) & 0xFF, addr & 0xFFFF);
  }

  public static typeFromCode(code: string): AddressType {
    switch (code) {
      case '^':
        return AddressType.Bank;
      case '&':
        return AddressType.Offset;
      case '@':
        return AddressType.Address;
      case '*':
        return AddressType.WBank;
      default:
        return AddressType.Unknown;
    }
  }

  public static codeFromType(type: AddressType): string | null {
    switch (type) {
      case AddressType.Bank:
        return '^';
      case AddressType.Offset:
        return '&';
      case AddressType.Address:
        return '@';
      case AddressType.WBank:
        return '*';
      default:
        return null;
    }
  }
} 