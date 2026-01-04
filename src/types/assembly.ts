import { ChunkFile } from "./files";
import { CopDef } from "../database/cop";
import { OpCode } from "../database/opcode";


/**
 * Represents a single assembly operation/instruction
 */
export class Op extends OpCode {
  public location: number;
  public operands: unknown[];
  public size: number;
  public copDef?: CopDef;

  constructor(
    code: OpCode,
    location: number = 0,
    operands: unknown[] = [],
    size: number = 1
  ) {
    super(code.code, code.mnem, code.mode);
    this.code = code.code;
    this.location = location;
    this.operands = operands;
    this.size = size;
  }
}

/**
 * Represents a block of assembly code or data
 */
export class AsmBlock {
  public label?: string;
  public location: number;
  public size: number;
  public isString: boolean;
  public objList: any[];
  public structName?: string;
  public bank?: number;
  public includes?: Set<{block: ChunkFile, part: AsmBlock}>;

  constructor(
    location: number = 0,
    size: number = 0,
    isString: boolean = false,
    label?: string,
    structName?: string,
    bank?: number
  ) {
    this.label = label;
    this.location = location;
    this.size = size;
    this.isString = isString;
    this.objList = [];
    this.structName = structName;
    this.bank = bank;
    this.includes = new Set();
  }
} 

/**
 * Database part utilities
 */
export class AsmBlockUtils {
  /**
   * Check if a location is inside this part
   */
  static isInside(part: AsmBlock, location: number): boolean {
    return location >= part.location && location < (part.location + part.size);
  }

  /**
   * Check if a location is outside this part
   */
  static isOutside(part: AsmBlock, location: number): boolean {
    return location < part.location || location >= (part.location + part.size);
  }
} 