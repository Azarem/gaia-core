import { SpriteFrame } from './SpriteFrame';
import { SpriteGroup } from './SpriteGroup';
import { SpritePart } from './SpritePart';

/**
 * Represents a complete sprite map with frame sets and groups
 */
export class SpriteMap {
  public frameSets: SpriteFrame[][];
  public groups: SpriteGroup[];

  constructor() {
    this.frameSets = [];
    this.groups = [];
  }

  /**
   * Create a SpriteMap from binary data
   * @param data Binary data buffer
   * @returns SpriteMap instance
   */
  public static fromBytes(data: Uint8Array): SpriteMap {
    let position = 0;

    const getByte = (): number => {
      if (position >= data.length) return 0;
      return data[position++];
    };

    const getUshort = (): number => {
      if (position + 1 >= data.length) return 0;
      const low = data[position++];
      const high = data[position++];
      return low | (high << 8);
    };

    const spriteMap = new SpriteMap();
    const setOffsets = new Set<number>();
    const groupOffsets = new Set<number>();

    // Read frame set offsets
    position = 0;
    while (!setOffsets.has(position)) {
      const offset = getUshort() - 0x4000;
      setOffsets.add(offset);
    }

    // Read frame sets
    for (const offStart of setOffsets) {
      position = offStart;
      const frameList: SpriteFrame[] = [];

      while (true) {
        const duration = getUshort();
        if (duration === 0xFFFF) {
          break;
        }

        const groupOffset = getUshort() - 0x4000;
        frameList.push(new SpriteFrame(duration, 0, groupOffset));
        groupOffsets.add(groupOffset);
      }

      spriteMap.frameSets.push(frameList);
    }

    // Read groups
    let grpIx = 0;
    const sortedGroupOffsets = Array.from(groupOffsets).sort((a, b) => a - b);
    
    for (const offStart of sortedGroupOffsets) {
      position = offStart;

      // Update frame group indices
      for (const set of spriteMap.frameSets) {
        for (const frame of set) {
          if (frame.groupOffset === offStart) {
            frame.groupIndex = grpIx;
          }
        }
      }

      const grp = new SpriteGroup();
      grp.xOffset = getByte();
      grp.xOffsetMirror = getByte();
      grp.yOffset = getByte();
      grp.yOffsetMirror = getByte();
      grp.xRecoilHitboxOffset = getByte();
      grp.yRecoilHitboxOffset = getByte();
      grp.xRecoilHitboxTilesize = getByte();
      grp.yRecoilHitboxTilesize = getByte();
      grp.xHostileHitboxOffset = getByte();
      grp.xHostileHitboxSize = getByte();
      grp.yHostileHitboxOffset = getByte();
      grp.yHostileHitboxSize = getByte();

      let numParts = getByte();
      while (numParts-- > 0) {
        const part = new SpritePart();
        part.isLarge = getByte() !== 0;
        part.xOffset = getByte();
        part.xOffsetMirror = getByte();
        part.yOffset = getByte();
        part.yOffsetMirror = getByte();

        const props = getUshort();
        part.vMirror = (props & 0x8000) !== 0;
        part.hMirror = (props & 0x4000) !== 0;
        part.someOffset = (props >> 12) & 0x3;
        part.paletteIndex = (props >> 9) & 0x7;
        part.tileIndex = props & 0x1FF;

        grp.parts.push(part);
      }

      spriteMap.groups.push(grp);
      grpIx++;
    }

    return spriteMap;
  }

  /**
   * Convert this SpriteMap to binary data
   * @returns Binary data buffer
   */
  public toBytes(): Uint8Array {
    // Calculate buffer size (estimate)
    let size = this.frameSets.length * 2; // Frame set offsets
    
    for (const set of this.frameSets) {
      size += (set.length * 4) + 2; // Frames + terminator
    }
    
    for (const grp of this.groups) {
      size += (grp.parts.length * 7) + 13; // Parts + group header
    }

    const buffer = new Uint8Array(size);
    let position = 0;

    const writeShort = (val: number): void => {
      buffer[position++] = val & 0xFF;
      buffer[position++] = (val >> 8) & 0xFF;
    };

    const writeLoc = (val: number): void => writeShort(val + 0x4000);

    let pos = this.frameSets.length << 1;
    const groupPos = new Array<number>(this.groups.length);

    // Write frame set offsets
    for (const set of this.frameSets) {
      writeLoc(pos);
      pos += (set.length << 2) + 2;
    }

    // Calculate group positions
    for (let i = 0; i < this.groups.length; i++) {
      groupPos[i] = pos;
      pos += this.groups[i].parts.length * 7 + 13;
    }

    // Write frame sets
    for (const set of this.frameSets) {
      for (const frm of set) {
        writeShort(frm.duration);
        writeLoc(groupPos[frm.groupIndex]);
      }
      writeShort(0xFFFF);
    }

    // Write groups
    for (const grp of this.groups) {
      buffer[position++] = grp.xOffset;
      buffer[position++] = grp.xOffsetMirror;
      buffer[position++] = grp.yOffset;
      buffer[position++] = grp.yOffsetMirror;
      buffer[position++] = grp.xRecoilHitboxOffset;
      buffer[position++] = grp.yRecoilHitboxOffset;
      buffer[position++] = grp.xRecoilHitboxTilesize;
      buffer[position++] = grp.yRecoilHitboxTilesize;
      buffer[position++] = grp.xHostileHitboxOffset;
      buffer[position++] = grp.xHostileHitboxSize;
      buffer[position++] = grp.yHostileHitboxOffset;
      buffer[position++] = grp.yHostileHitboxSize;
      buffer[position++] = grp.parts.length;

      for (const prt of grp.parts) {
        buffer[position++] = prt.isLarge ? 1 : 0;
        buffer[position++] = prt.xOffset;
        buffer[position++] = prt.xOffsetMirror;
        buffer[position++] = prt.yOffset;
        buffer[position++] = prt.yOffsetMirror;

        const accum = (prt.vMirror ? 0x8000 : 0)
          | (prt.hMirror ? 0x4000 : 0)
          | ((prt.someOffset & 0x3) << 12)
          | ((prt.paletteIndex & 0x7) << 9)
          | prt.tileIndex;

        writeShort(accum);
      }
    }

    // Return trimmed buffer
    return buffer.slice(0, position);
  }
} 