/**
 * Represents the stack for the 65816 processor
 */
export class Stack {
  public bytes: Uint8Array;
  public location: number;

  constructor() {
    this.bytes = new Uint8Array(70);
    this.location = 10;
  }

  /**
   * Push a byte onto the stack
   */
  public push(value: number): void {
    this.bytes[this.location++] = value & 0xFF;
  }

  /**
   * Push a 16-bit value onto the stack (little-endian)
   */
  public pushUInt16(value: number): void {
    this.bytes[this.location++] = value & 0xFF;
    this.bytes[this.location++] = (value >> 8) & 0xFF;
  }

  /**
   * Pop a byte from the stack
   */
  public popByte(): number {
    return this.bytes[--this.location];
  }

  /**
   * Pop a 16-bit value from the stack (little-endian)
   */
  public popUInt16(): number {
    const high = this.bytes[--this.location];
    const low = this.bytes[--this.location];
    return (high << 8) | low;
  }

  /**
   * Reset the stack to initial state
   */
  public reset(): void {
    this.bytes.fill(0);
    this.location = 10;
  }
} 