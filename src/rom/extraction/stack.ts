import { Registers } from '../../assembly';
import { StatusFlags } from '../../types';
import type { BlockReader } from './blocks';

/**
 * Handles stack operations for various stack-related instructions
 * Converted from GaiaLib/Rom/Extraction/StackOperations.cs
 */
export class StackOperations {
  private readonly _registers: Registers;
  private readonly _blockReader: BlockReader;

  constructor(registers: Registers, blockReader: BlockReader) {
    this._registers = registers;
    this._blockReader = blockReader;
  }

  public handleStackOperation(mnemonic: string): void {
    switch (mnemonic) {
      case 'PHD':
        this._registers.stack.push(this._registers.value['direct'] ?? 0);
        break;
        
      case 'PLD':
        this._registers.value['direct'] = this._registers.stack.popUInt16();
        break;
        
      case 'PHK':
        this._registers.stack.push((this._blockReader._romDataReader.position >> 16) | 0x80);
        break;
        
      case 'PHB':
        this._registers.stack.push(this._registers.value['dataBank'] ?? 0x81);
        break;
        
      case 'PLB':
        this._registers.value['dataBank'] = this._registers.stack.popByte();
        break;
        
      case 'PHP':
        this._registers.stack.push(this._registers.value['statusFlags'] ?? 0);
        break;
        
      case 'PLP':
        this._registers.value['statusFlags'] = this._registers.stack.popByte();
        break;

      case 'PHA':
        this.handleAccumulatorPush();
        break;

      case 'PLA':
        this.handleAccumulatorPull();
        break;

      case 'PHX':
        this.handleXIndexPush();
        break;

      case 'PLX':
        this.handleXIndexPull();
        break;

      case 'PHY':
        this.handleYIndexPush();
        break;

      case 'PLY':
        this.handleYIndexPull();
        break;

      case 'XBA':
        this.handleExchangeBytes();
        break;

      case 'RTL':
      case 'RTS':
        this._blockReader._referenceManager.tryAddStruct(this._blockReader._romDataReader.position, 'Code');
        break;
    }
  }

  private handleAccumulatorPush(): void {
    if (this._registers.value['statusFlags'] & StatusFlags.AccumulatorMode) {
      this._registers.stack.push(this._registers.value['accumulator'] ?? 0);
    } else {
      this._registers.stack.pushUInt16(this._registers.value['accumulator'] ?? 0);
    }
  }

  private handleAccumulatorPull(): void {
    if (this._registers.value['statusFlags'] & StatusFlags.AccumulatorMode) {
      this._registers.value['accumulator'] = ((this._registers.value['accumulator'] ?? 0) & 0xFF00) | this._registers.stack.popByte();
    } else {
      this._registers.value['accumulator'] = this._registers.stack.popUInt16();
    }
  }

  private handleXIndexPush(): void {
    if (this._registers.value['statusFlags'] & StatusFlags.IndexMode) {
      this._registers.stack.push((this._registers.value['xIndex'] ?? 0) & 0xFF);
    } else {
      this._registers.stack.pushUInt16(this._registers.value['xIndex'] ?? 0);
    }
  }

  private handleXIndexPull(): void {
    if (this._registers.value['statusFlags'] & StatusFlags.IndexMode) {
      this._registers.value['xIndex'] = ((this._registers.value['xIndex'] ?? 0) & 0xFF00) | this._registers.stack.popByte();
    } else {
      this._registers.value['xIndex'] = this._registers.stack.popUInt16();
    }
  }

  private handleYIndexPush(): void {
    if (this._registers.value['statusFlags'] & StatusFlags.IndexMode) {
      this._registers.stack.push((this._registers.value['yIndex'] ?? 0) & 0xFF);
    } else {
      this._registers.stack.pushUInt16(this._registers.value['yIndex'] ?? 0);
    }
  }

  private handleYIndexPull(): void {
    if (this._registers.value['statusFlags'] & StatusFlags.IndexMode) {
      this._registers.value['yIndex'] = ((this._registers.value['yIndex'] ?? 0) & 0xFF00) | this._registers.stack.popByte();
    } else {
      this._registers.value['yIndex'] = this._registers.stack.popUInt16();
    }
  }

  private handleExchangeBytes(): void {
    const acc = this._registers.value['accumulator'] ?? 0;
    this._registers.value['accumulator'] = ((acc >> 8) | (acc << 8)) & 0xFFFF;
  }
} 