/**
 * Processor register type definitions
 * Converted from GaiaLib/Enum/RegisterType.cs
 */
export enum RegisterType {
  M = 'M',
  X = 'X',
  B = 'B'
}

/**
 * Status flags for 65816 processor
 * Converted from GaiaLib/Enum/StatusFlags.cs
 * 
 * Bit pattern: [ n v m x d i z c ]
 * n = Negative
 * v = Overflow
 * m = Accumulator Mode
 * x = Index Mode
 * d = Decimal Mode
 * i = IRQ Disable
 * z = Zero
 * c = Carry
 */
export enum StatusFlags {
  /**
   * Clear before starting addition or subtraction.
   * Arithmetic overflow:
   * [addition - carry out of high bit:]
   * 0 = no carry
   * 1 = carry
   * [subtraction - borrow required to subtract:]
   * 0 = borrow required
   * 1 = no borrow required
   * [Logic:]
   * receives bit shifted or rotated out;
   * source of bit rotated in
   */
  Carry = 0x01,
  /**
   * Indicates zero or non-zero result:
   * 0 = non-zero result
   * 1 = zero result
   */
  Zero = 0x02,
  /**
   * Enables or disables processor's IRQ interrupt line:
   * Set to disable interrupts by masking the IRQ line
   * Clear to enable IRQ interrupts
   */
  IrqDisable = 0x04,
  /**
   * Determines mode for add/subtract (not increment/decrement, though):
   * Set to force decimal operation (BCD)
   * Clear to return to binary operation
   */
  DecimalMode = 0x08,
  IndexMode = 0x10,
  AccumulatorMode = 0x20,
  /**
   * Clear to reverse "set-overflow" hardware input.
   * Indicates invalid carry into high bit of arithmetic
   * result (two's-complement overflow):
   * 0 = two's-complement result ok
   * 1 = error if two's-complement arithmetic
   */
  Overflow = 0x40,
  /**
   * Reflects most significant bit of result
   * (the sign of a two's-complement binary number):
   * 0 = high bit clear (positive result)
   * 1 = high bit set (negative result)
   */
  Negative = 0x80
} 