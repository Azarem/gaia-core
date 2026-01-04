/**
 * Provides low-level ROM data reading functionality
 * Converted from GaiaLib/Rom/Extraction/RomDataReader.cs
 */
export class RomDataReader {
  public readonly romData: Uint8Array;
  public position: number;

  constructor(romData: Uint8Array) {
    if (!romData) {
      throw new Error('romData cannot be null');
    }
    this.romData = romData;
    this.position = 0;
  }

  public readByte(): number {
    return this.romData[this.position++];
  }

  public readSByte(): number {
    const value = this.readByte();
    return value > 127 ? value - 256 : value;
  }

  public readUShort(): number {
    return this.readByte() | (this.readByte() << 8);
  }

  public readShort(): number {
    const value = this.readUShort();
    return value > 32767 ? value - 65536 : value;
  }

  public readAddress(): number {
    return this.readByte() | (this.readByte() << 8) | (this.readByte() << 16);
  }

  public readInt(): number {
    return this.readByte() | (this.readByte() << 8) | (this.readByte() << 16) | (this.readByte() << 24);
  }

  public peekByte(): number {
    return this.romData[this.position];
  }

  public peekShort(): number {
    return this.romData[this.position] | (this.romData[this.position + 1] << 8);
  }

  public peekAddress(): number {
    return this.romData[this.position]
      | (this.romData[this.position + 1] << 8)
      | (this.romData[this.position + 2] << 16);
  }
} 