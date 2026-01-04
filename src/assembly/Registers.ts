import { StatusFlags } from '../types';
import { Stack } from './Stack';

/**
 * Manages the 65816 processor registers and status flags
 */
export class Registers {
  // public accumulatorFlag?: boolean;
  // public indexFlag?: boolean;
  // public direct?: number;
  // public dataBank?: number;
  // public accumulator?: number;
  // public xIndex?: number;
  // public yIndex?: number;
  public value: Record<string, number>;
  public stack: Stack;

  constructor() {
    this.value = {};
    this.stack = new Stack();
  }

  /**
   * Get the current status flags
   */
  // public get statusFlags(): StatusFlags {
  //   let flags = 0;
  //   if (this.accumulatorFlag ?? false) {
  //     flags |= StatusFlags.AccumulatorMode;
  //   }
  //   if (this.indexFlag ?? false) {
  //     flags |= StatusFlags.IndexMode;
  //   }
  //   return flags;
  // }

  // /**
  //  * Set the status flags
  //  */
  // public set statusFlags(value: StatusFlags) {
  //   this.accumulatorFlag = (value & StatusFlags.AccumulatorMode) !== 0;
  //   this.indexFlag = (value & StatusFlags.IndexMode) !== 0;
  // }

  /**
   * Reset all registers to initial state
   */
  // public reset(): void {
  //   this.accumulatorFlag = undefined;
  //   this.indexFlag = undefined;
  //   this.direct = undefined;
  //   this.dataBank = undefined;
  //   this.accumulator = undefined;
  //   this.xIndex = undefined;
  //   this.yIndex = undefined;
  //   this.stack.reset();
  // }
} 