import { SpritePart } from './SpritePart';

/**
 * Represents a group of sprite parts that form a complete sprite frame
 */
export class SpriteGroup {
  public xOffset: number;
  public xOffsetMirror: number;
  public yOffset: number;
  public yOffsetMirror: number;
  public xRecoilHitboxOffset: number;
  public yRecoilHitboxOffset: number;
  public xRecoilHitboxTilesize: number;
  public yRecoilHitboxTilesize: number;
  public xHostileHitboxOffset: number;
  public xHostileHitboxSize: number;
  public yHostileHitboxOffset: number;
  public yHostileHitboxSize: number;
  public parts: SpritePart[];

  constructor() {
    this.xOffset = 0;
    this.xOffsetMirror = 0;
    this.yOffset = 0;
    this.yOffsetMirror = 0;
    this.xRecoilHitboxOffset = 0;
    this.yRecoilHitboxOffset = 0;
    this.xRecoilHitboxTilesize = 0;
    this.yRecoilHitboxTilesize = 0;
    this.xHostileHitboxOffset = 0;
    this.xHostileHitboxSize = 0;
    this.yHostileHitboxOffset = 0;
    this.yHostileHitboxSize = 0;
    this.parts = [];
  }
} 