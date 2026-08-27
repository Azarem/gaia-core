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
  Relative = 'Relative',
  WRelative = 'WRelative',
  Location = 'Location',
  OddLocation = 'OddLocation'
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

export enum MemoryMapMode {
  Lo = 'Lo',
  Hi = 'Hi',
  ExHi = 'ExHi'
}

export enum CpuMode {
  Slow = 'Slow',
  Fast = 'Fast'
}

/**
 * SNES address structure
 * Converted from GaiaLib/Types/Address.cs
 */
export class Address {
  public offset: number;
  public bank: number;
  public mode: MemoryMapMode;
  public isShort: boolean;
  
  public static readonly UPPER_BANK = 0x8000;
  public static readonly DATA_BANK_FLAG = 0x40;
  public static readonly FAST_BANK_FLAG = 0x80;

  constructor(bank: number, offset: number, mode: MemoryMapMode, isShort: boolean = false) {
    this.bank = bank & 0xFF;
    this.offset = offset & 0xFFFF;
    this.mode = mode;
    this.isShort = isShort;
  }

  public get isROM(): boolean {
    if(this.bank === 0x7E || this.bank === 0x7F) return false;
    if(this.offset >= Address.UPPER_BANK) return true;
    if(!this.isCodeBank) {
      if(this.mode === MemoryMapMode.Lo && this.bank >= 0x70 && this.bank <= 0x7D) return false;
      return true;
    }
    return false;
  }

  public get isWram(): boolean {
    return this.bank === 0x7E || this.bank === 0x7F;
  }

  public get isCodeBank(): boolean {
    return (this.bank & Address.DATA_BANK_FLAG) === 0;
  }

  // public get space(): AddressSpace {
    
  //   if (this.bank === 0x7E || this.bank === 0x7F) return AddressSpace.WRAM;
  //   if (this.offset >= RomProcessingConstants.PAGE_SIZE) return AddressSpace.ROM;

  //   // Check if bank is in lower half (bank & 0x40 == 0)
  //   if (this.isCodeBank) {
  //     // Memory map for lower banks
  //     if (this.offset >= 0x6000 && (this.bank & 0x20) !== 0) {
  //       return AddressSpace.SRAM;
  //     }
  //     if (this.offset < 0x2000) {
  //       return AddressSpace.WRAM;
  //     } else if (this.offset < 0x2100) {
  //       return AddressSpace.None;
  //     } else if (this.offset < 0x2200) {
  //       return AddressSpace.System;
  //     } else if (this.offset < 0x3000) {
  //       return AddressSpace.None;
  //     } else if (this.offset < 0x4100) {
  //       return AddressSpace.System;
  //     } else if (this.offset < 0x4200) {
  //       return AddressSpace.None;
  //     } else if (this.offset < 0x4500) {
  //       return AddressSpace.System;
  //     } else {
  //       return AddressSpace.None;
  //     }
  //   }


  //   return AddressSpace.ROM;
  // }

  public toLocation(): number {
    if(this.mode === MemoryMapMode.Lo) return ((this.bank & 0x3F) << 15) | (this.offset & 0x7FFF);
    if(this.mode === MemoryMapMode.Hi || (this.bank & Address.FAST_BANK_FLAG)) return ((this.bank & 0x3F) << 16) | (this.offset & 0xFFFF);
    return (this.bank === 0x3E) ? (this.offset + 0x13D0000) : (this.bank === 0x3F) ? (this.offset + 0x13E0000) 
      : ((((this.bank & 0x3F) << 16) | (this.offset & 0xFFFF)) + 0x1000000);
  }

  public static fromLocation(value: number, mode: MemoryMapMode, cpuMode: CpuMode): Address {
    let bankFlag = cpuMode === CpuMode.Fast ? Address.FAST_BANK_FLAG : 0;
    if(mode === MemoryMapMode.Lo) {
      return new Address((value >> 15) & 0x7F | bankFlag, (value & 0x7FFF) | 0x8000, mode);
    }
    if(mode === MemoryMapMode.Hi) {
      if((value & RomProcessingConstants.PAGE_SIZE) === 0) bankFlag = 0xC0
      return new Address((value >> 16) & 0x7F | bankFlag, value & 0xFFFF, mode);
    }
    ///TODO: Handle ExHi mode
    if(value & Address.FAST_BANK_FLAG) return new Address((value >> 16) & 0xFF, value & 0xFFFF, mode);
    if(value >= 0x13D0000 && value < 0x13E0000) return new Address(0x3E, value - 0x13D0000, mode);
    if(value >= 0x13E0000 && value < 0x13F0000) return new Address(0x3F, value - 0x13E0000, mode);
    return new Address((value >> 16) & 0x7F, value & 0xFFFF, mode);
  }

  public static resolveBank(value: number, mode: MemoryMapMode): number {
    if(mode === MemoryMapMode.Lo) return (value >> 15) & 0xFF;
    if(mode === MemoryMapMode.Hi || (value & Address.FAST_BANK_FLAG)) return (value >> 16) & 0xFF;
    if(value >= 0x13D0000 && value < 0x13E0000) return 0x3E;
    if(value >= 0x13E0000 && value < 0x13F0000) return 0x3F;
    return (value >> 16) & 0x7F;  
  }

  public toInt(): number {
    return (this.bank << 16) | this.offset;
  }

  public toOffsetString(): string {
    return this.offset.toString(16).toUpperCase().padStart(4, '0');
  }

  public toString(): string {
    return this.toInt().toString(16).toUpperCase().padStart(6, '0');
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
      case '%':
        return AddressType.Location;
      case '!':
        return AddressType.OddLocation;
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
      case AddressType.Location:
        return '%';
      case AddressType.OddLocation:
        return '!';
      default:
        return null;
    }
  }
} 