import { RomDataReader } from './reader';
import { ReferenceManager } from './references';
import { RomProcessingConstants } from '../../types/constants';
import type { BlockReader } from './blocks';
import { Address, AddressType } from '../../types/addressing';
import { indexOfAny, LocationWrapper } from '../..';

/**
 * Handles transform processing for assembly instructions
 * Converted from GaiaLib/Rom/Extraction/TransformProcessor.cs
 */
export class TransformProcessor {
  private readonly _blockReader: BlockReader;
  private readonly _romDataReader: RomDataReader;
  private readonly _referenceManager: ReferenceManager;
  private readonly _labelLookup: Record<number, string>;

  // Location regex pattern: _([A-Fa-f0-9]{6})
  private static readonly LOCATION_REGEX = /_([A-Fa-f0-9]{6})/;

  constructor(romReader: BlockReader) {
    this._blockReader = romReader;
    this._romDataReader = romReader._romDataReader;
    this._referenceManager = romReader._referenceManager;
    this._labelLookup = romReader._root.labels;
  }

  /**
   * Retrieves transform information for the current ROM position
   */
  public getTransform(): string | undefined {
    const transform = this._labelLookup[this._romDataReader.position];
    if (transform === '') {
      return transform;
    } else if (!transform) {
      return undefined;
    }

    const transformName = this.cleanTransformName(transform);
    const referenceLocation = this.resolveTransformReference(transformName);
    
    if (referenceLocation !== null) {
      this._blockReader.resolveInclude(referenceLocation, false);
    }

    return transform;
  }

  /**
   * Applies transforms to operands
   */
  public applyTransforms(op1Label: string | undefined, op2Label: string | undefined, operands: any[]): void {
    if(operands.length > 0) operands[0] = this.applyTransform(op1Label, operands[0]);
    if(operands.length > 1) operands[1] = this.applyTransform(op2Label, operands[1]);
  }

  public applyTransform(transform: string | undefined, operand: any | undefined): any {
    if (transform === undefined || operand === undefined) {
      return operand;
    }

    let type = AddressType.Offset;
    let loc : number | undefined;

    if (transform === '' || transform[0] === '$') {
      const offset = operand && 'value' in operand ? operand['value'] : operand as number;
      const bank = transform[0] === '$' 
        ? parseInt(transform.substring(1), 16) 
        : Address.resolveBank(this._romDataReader.position, this._blockReader._root.config.memoryMode);
        const adrs = new Address(bank, offset, this._blockReader._root.config.memoryMode, true);
        loc = adrs.toLocation();
    } else if(transform.match(/^[*^][A-Fa-f0-9]{6}$/)) {
      loc = parseInt(transform.substring(1), 16);
      type = Address.typeFromCode(transform[0]);
    }

    return loc !== undefined ? new LocationWrapper(loc, type) : transform;
  }

  private cleanTransformName(transform: string): string {
    let name = transform;
    
    // Remove address space characters from the start
    while (name.length > 0 && RomProcessingConstants.ADDRESS_SPACE.includes(name[0])) {
      name = name.substring(1);
    }
    
    // Find math operators and truncate at that point
    let mathIndex = -1;
    for (let i = 0; i < name.length; i++) {
      if (RomProcessingConstants.OPERATORS.includes(name[i])) {
        mathIndex = i;
        break;
      }
    }
    
    if (mathIndex > 0) {
      name = name.substring(0, mathIndex);
    }
    
    return name;
  }

  private resolveTransformReference(transformName: string): number | null {
    // Directly resolve by name in the reference table
    const location = this._referenceManager.findLocationByName(transformName);
    if (location !== undefined) {
      return location;
    }

    // Fallback to parsing the location pattern
    const match = TransformProcessor.LOCATION_REGEX.exec(transformName);
    return match ? parseInt(match[1], 16) : null;
  }
}