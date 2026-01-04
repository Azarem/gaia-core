/**
 * Bit stream for reading/writing binary data at bit level
 * Converted from GaiaLib/Types/BitStream.cs
 */
export class BitStream {
  private static readonly NIBBLE_MASK = 0xF;
  private static readonly NIBBLE_PERFECT_POSITION = 0x08;

  private data: Uint8Array;
  private position: number;
  private bitFlag: number = 0x80;
  private writeSample: number = 0;

  constructor(data: Uint8Array, position: number = 0) {
    this.data = data;
    this.position = position;
  }

  public get dataArray(): Uint8Array {
    return this.data;
  }

  public get currentPosition(): number {
    return this.position;
  }

  public set currentPosition(value: number) {
    this.position = value;
  }

  /**
   * Read a byte from the stream
   * @returns The byte read, or -1 if the end of the data has been reached
   */
  public readByte(): number {
    // If we've reached the end of the data, return -1
    if (this.position >= this.data.length) {
      return -1;
    }

    // Read the current byte, and advance the position
    let sample = this.data[this.position++];

    // If the bit flag is not the most significant bit, we need to include the next byte
    if (this.bitFlag !== 0x80) {
      // Include the next byte in the sample
      sample = (sample << 8) | this.data[this.position];

      // Shift the (temporary) bit flag to the right until it is 0
      for (let x = this.bitFlag; x > 0; x >>= 1) {
        // Shift sample for each iteration so it will line up with the byte boundary
        sample >>= 1;
      }
    }

    // Return the sample
    return sample & 0xFF;
  }

  /**
   * Read a ushort from the stream (ignores the current bit flag)
   * @returns The short read, or -1 if the end of the data has been reached
   */
  public readShort(): number {
    // If end of stream (position would overlap data.length), return -1
    if (this.position + 1 >= this.data.length) {
      return -1;
    }

    // Read sample using two bytes to form a ushort. Advance position by 2
    const value = this.data[this.position++] | (this.data[this.position++] << 8);

    // Return the value
    return value;
  }

  /**
   * Read a bit from the stream
   * @returns True if the current bit at bitFlag is set, false otherwise
   */
  public readBit(): boolean {
    // If we've reached the end of the data, return false
    if (this.position >= this.data.length) {
      return false;
    }

    // Read the current bit and test it against current bit flag
    const sample = this.data[this.position] & this.bitFlag;

    // Shift the bit flag to the right
    this.bitFlag >>= 1;

    // If the bit flag is 0, we need to move to the next byte
    if (this.bitFlag === 0) {
      // Reset the bit flag to the most significant bit
      this.bitFlag = 0x80;
      // Advance the position to the next byte
      this.position++;
    }

    // Return true if the bit is set, false otherwise
    return sample !== 0;
  }

  /**
   * Read a nibble from the stream
   * @returns The nibble read, or -1 if the end of the data has been reached
   */
  public readNibble(): number {
    // If we've reached the end of the data, return -1
    if (this.position >= this.data.length) {
      return -1;
    }

    // Read the current (unshifted) byte sample
    let sample = this.data[this.position];

    if (this.bitFlag === BitStream.NIBBLE_PERFECT_POSITION) {
      // Reset the bit flag to the most significant bit
      this.bitFlag = 0x80;
      // Advance the position to the next byte
      this.position++;
    } else {
      // Initialize the bit position to -4 (will be incremented as we shift the bit flag to the right)
      let bitPos = -4;

      // Shift the bit flag to the right until it is 0
      while (this.bitFlag !== 0) {
        // Shift the bit flag to the right
        this.bitFlag >>= 1;
        // Increment the bit position
        bitPos++;
      }

      // If the bit position is less than 0, we need to include the next byte
      if (bitPos < 0) {
        // Include the next byte in the sample, and advance the position
        sample = (sample << 8) | this.data[++this.position];

        // Advance the bit position by 8 (will no longer be less than 0)
        bitPos += 8;
      }

      // Shift the sample to the right by the bit position
      sample >>= bitPos;

      // Set the bit flag to the new bit position
      this.bitFlag = 1 << (bitPos - 1);
    }

    // Return the nibble
    return sample & BitStream.NIBBLE_MASK;
  }

  /**
   * Write a bit to the stream
   * @param set True if the current bit should be set, false otherwise
   */
  public writeBit(set: boolean): void {
    // If the bit should be set, set the bit in the write sample
    if (set) {
      this.writeSample |= this.bitFlag;
    }

    // Shift the bit flag to the right
    this.bitFlag >>= 1;

    // If the bit flag is 0, we need to move to the next byte
    if (this.bitFlag === 0) {
      // Reset the bit flag to the most significant bit
      this.bitFlag = 0x80;
      // Write the sample to the data stream
      this.data[this.position++] = this.writeSample;
      // Reset the write sample
      this.writeSample = 0;
    }
  }

  /**
   * Write a byte to the stream
   * @param value The byte to write
   */
  public writeByte(value: number): void {
    // If the bit flag is the most significant bit, we can write the byte directly
    if (this.bitFlag === 0x80) {
      this.data[this.position++] = value;
    } else {
      // Shift the value to the left until it is aligned with the bit flag
      for (let x = 1; x <= this.bitFlag; x <<= 1) {
        value <<= 1;
      }

      // Write the value to the data stream
      this.data[this.position++] = (this.writeSample | (value >> 8)) & 0xFF;

      // Update the write sample
      this.writeSample = value & 0xFF;
    }
  }

  /**
   * Write a nibble to the stream
   * @param value The nibble to write
   */
  public writeNibble(value: number): void {
    value &= BitStream.NIBBLE_MASK;

    if (this.bitFlag >= 0x10) {
      let shift = 0;
      switch (this.bitFlag) {
        case 0x80: shift = 4; break;
        case 0x40: shift = 3; break;
        case 0x20: shift = 2; break;
        case 0x10: shift = 1; break;
      }
      this.writeSample |= (value << shift);
      this.bitFlag >>= 4;
    } else {
      let shift = 0;
      switch (this.bitFlag) {
        case 0x8: shift = 0; break;
        case 0x4: shift = 1; break;
        case 0x2: shift = 2; break;
        case 0x1: shift = 3; break;
      }
      this.data[this.position++] = (this.writeSample | (value >> shift));
      this.writeSample = (value << (8 - shift));
      this.bitFlag <<= 4;
    }
  }

  public flush(): void {
    if (this.bitFlag !== 0x80) {
      this.data[this.position++] = this.writeSample;
    }
  }
} 