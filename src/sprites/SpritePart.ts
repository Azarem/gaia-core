/**
 * Represents a single part/piece of a sprite
 */
export class SpritePart {
  public isLarge: boolean;
  public xOffset: number;
  public xOffsetMirror: number;
  public yOffset: number;
  public yOffsetMirror: number;
  public vMirror: boolean;
  public hMirror: boolean;
  public someOffset: number;
  public paletteIndex: number;
  public tileIndex: number;

  constructor() {
    this.isLarge = false;
    this.xOffset = 0;
    this.xOffsetMirror = 0;
    this.yOffset = 0;
    this.yOffsetMirror = 0;
    this.vMirror = false;
    this.hMirror = false;
    this.someOffset = 0;
    this.paletteIndex = 0;
    this.tileIndex = 0;
  }
} 