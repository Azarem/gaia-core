import { DbRoot } from '../../database';
import { AsmBlock } from '../../types/assembly';
import type { StringProcessor } from './string-processor';

/**
 * Shared context interface for assembler components
 * This eliminates circular dependencies between Assembler, AssemblerState, and StringProcessor
 */
export interface AssemblerContext {
  readonly root: DbRoot;
  readonly stringProcessor: StringProcessor;
  currentBlock: AsmBlock | null;
  lineBuffer: string;
  blockIndex: number;
  lastDelimiter: number | null;
  blocks: AsmBlock[];
  eof: boolean;
  lineCount: number;
  
  // Methods that AssemblerState needs
  getLine(): boolean;
  processRawData(): void;
  parseOperand(operand: string): unknown;
}
