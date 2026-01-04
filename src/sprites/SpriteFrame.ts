/**
 * Represents a single frame in a sprite animation sequence
 */
export class SpriteFrame {
  public duration: number;
  public groupIndex: number;
  
  /**
   * Internal offset to the group data (not serialized)
   */
  public groupOffset: number;

  constructor(duration: number = 0, groupIndex: number = 0, groupOffset: number = 0) {
    this.duration = duration;
    this.groupIndex = groupIndex;
    this.groupOffset = groupOffset;
  }
} 