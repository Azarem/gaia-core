# ROM Mapping Guide — Multi-Phase Plan

A comprehensive, step-by-step guide for agents to map a SNES ROM from zero to fully extracted and documented, using the Illusion of Gaia (IOG) baserom as the reference example. This document is the authoritative procedure for creating a new `@gaialabs/core`-compatible baserom repository.

---

## Table of Contents

1. [Orientation & Prerequisites](#1-orientation--prerequisites)
2. [Phase 1 — Repository Setup & ROM Header Mapping](#phase-1--repository-setup--rom-header-mapping)
3. [Phase 1B — Binary File Identification & files.json Mapping](#phase-1b--binary-file-identification--filesjson-mapping)
4. [Phase 2 — Initial Code Mapping with blocks.json](#phase-2--initial-code-mapping-with-blocksjson)
5. [Phase 3 — Iterative Extraction Passes](#phase-3--iterative-extraction-passes)
6. [Phase 4 — Register State Validation & Overrides](#phase-4--register-state-validation--overrides)
7. [Phase 5 — Data Bank Register Overrides](#phase-5--data-bank-register-overrides)
8. [Phase 6 — Type Overrides with types.json](#phase-6--type-overrides-with-typesjson)
9. [Phase 7 — Struct Identification & Definition](#phase-7--struct-identification--definition)
10. [Phase 7B — String Types & stringTypes.json Mapping](#phase-7b--string-types--stringtypesjson-mapping)
11. [Phase 8 — Scaffolding, Names, and Minimal Part Declarations](#phase-8--scaffolding-names-and-minimal-part-declarations)
12. [Phase 8B — Operand Annotations with labels.json](#phase-8b--operand-annotations-with-labelsjson)
13. [Phase 9 — Code Coagulation & Module Separation](#phase-9--code-coagulation--module-separation)
14. [Phase 10 — Scene Assets, Spawn Tables & Setup Manifests](#phase-10--scene-assets-spawn-tables--setup-manifests)
15. [Phase 11 — Shared Code & Destroy Handlers](#phase-11--shared-code--destroy-handlers)
16. [Phase 12 — Pointer Types & Reference Handling](#phase-12--pointer-types--reference-handling)
17. [Phase 13 — Binary Data & Common Bank $01](#phase-13--binary-data--common-bank-01)
18. [Phase 14 — Game Walkthrough & Single Source of Truth](#phase-14--game-walkthrough--single-source-of-truth)
19. [Phase 15 — Documentation & Code Comments](#phase-15--documentation--code-comments)
20. [Appendix A — blocks.json Part Declaration Formats](#appendix-a--blocksjson-part-declaration-formats)
21. [Appendix B — Complete File Inventory (db-us/)](#appendix-b--complete-file-inventory-db-us)
22. [Appendix C — Validation Checklist](#appendix-c--validation-checklist)

---

## 1. Orientation & Prerequisites

### What this guide covers

This guide walks through the complete process of mapping a SNES ROM so that `@gaialabs/core` can extract it to human-readable assembly and rebuild it back to a byte-perfect ROM. The process is iterative — you will extract, inspect, correct metadata, and re-extract many times.

### Required knowledge

- 65C816 assembly (the SNES CPU) — see [65C816 Opcodes by Bruce Clark](https://6502.org/tutorials/65c816opcodes.html)
- SNES memory map concepts (HiROM/LoROM, banks, mirroring) — see `corpus/nesdev/65c816.md` and `corpus/sfcwiki/65816-reference.md`
- `@gaialabs/core` assembler syntax — read `curated/gaialabs/assembler-syntax.md` before doing ANY assembly work

### Required tools

- Node.js 20+
- `@gaialabs/core` package linked or installed
- The target ROM file (set path in `.env.local`)
- Mesen2 emulator for runtime verification (MCP integration available)
- A hex editor for initial ROM inspection

### Critical concepts

**The Database Triad** — Three JSON files in `db-us/` work together to define ROM structure:

| File | Purpose |
|------|---------|
| `blocks.json` | Defines known code/data blocks and their parts |
| `overrides.json` | Per-address register state and type corrections |
| `names.json` | Human-readable labels for addresses |

**Auto-discovery** — The engine does NOT require every byte to be mapped. It automatically discovers code/data through reference tracing, branch following, and pattern detection. Your job is to provide enough structure for the engine to work correctly, then correct its mistakes.

**Register state cascading** — The engine tracks the M (accumulator size) and X (index register size) flags as it traces through code. When it encounters a `REP #$20` it knows the accumulator switches to 16-bit. This state **cascades forward** through sequential code and branches. Overrides are only needed where the engine cannot determine the state — typically at entry points reached by indirect jumps, function pointers, or after ambiguous paths.

---

## Phase 1 — Repository Setup & ROM Header Mapping

### 1.1 Create the repository structure

```
my-game-baserom/
├── .env.local              # ROM_PATH=path/to/rom.smc (gitignored)
├── .gitignore              # rom files, node_modules, built output
├── db-us/                  # Game database module (US region)
│   ├── config.json         # ROM header + platform configuration
│   ├── blocks.json         # Code/data block definitions
│   ├── overrides.json      # Per-address register/type overrides
│   ├── names.json          # Address → label mapping
│   ├── types.json          # Type overrides for auto-scaffolded data
│   ├── files.json          # ROM file region → extraction folder mapping
│   ├── fileTypes.json      # File type catalog (extensions, compression, internal types)
│   ├── copdef.json         # COP opcode definitions (if applicable)
│   ├── structs.json        # Named struct layouts
│   ├── stringTypes.json    # String type definitions (char maps, commands, dictionaries — NOT hard-coded)
│   ├── labels.json         # Operand transform annotations (reference resolution hints)
│   ├── mnemonics.json      # RAM/WRAM symbolic names
│   ├── scenes.json         # Scene ID → name mapping
│   ├── groups.json         # Scene group organization
│   ├── rewrites.json       # Address rewrite rules for rebuild
│   ├── transforms.json     # Post-extraction transforms
│   └── fixups.json         # Patch fixup hooks + mnemonic definitions
├── extracted/              # Output from extraction (generated)
├── baserom/                # Base ROM patches directory
│   └── patches/            # .patch.asm files
├── src/
│   └── index.ts            # CLI entry point
├── package.json
└── tsconfig.json
```

### 1.2 Set up config.json — The ROM header

`config.json` defines the ROM's SNES header information and platform-specific settings. Every field must match the actual ROM header bytes.

**IOG example (`db-us/config.json`):**

```json
{
  "compression": "QuintetLZ",
  "sfxLocation": 327680,
  "sfxCount": 60,
  "sfxType": "Striped",
  "sfxPack": "Individual",
  "uncompress": true,
  "memoryMode": "Hi",
  "cpuMode": "Fast",
  "chipset": 2,
  "ramSize": 3,
  "countryCode": 1,
  "developerId": 51,
  "makerCode": "01",
  "gameCode": "JG",
  "gameTitle": "ILLUSION OF GAIA USA",
  "gameVersion": 0,
  "nativeCop": "CopVector",
  "nativeBrk": "IrqVector",
  "nativeNmi": "NmiVector",
  "nativeIrq": "IrqVector",
  "emulationReset": "ResetVector"
}
```

**Field-by-field guide:**

| Field | Meaning | How to find |
|-------|---------|-------------|
| `memoryMode` | `"Hi"` (HiROM) or `"Lo"` (LoROM) | ROM header byte at $FFD5 (HiROM) or $7FD5 (LoROM). Bit 0: 0=LoROM, 1=HiROM |
| `cpuMode` | `"Fast"` (3.58 MHz) or `"Slow"` (2.68 MHz) | Same byte, bit 4: 0=Slow, 1=Fast |
| `chipset` | ROM type value (0=ROM, 1=ROM+RAM, 2=ROM+RAM+SRAM, etc.) | Header byte $FFD6/$7FD6 |
| `ramSize` | SRAM size code (0=none, 1=2KB, 3=8KB, 5=32KB) | Header byte $FFD8/$7FD8 |
| `countryCode` | Region code (0=Japan, 1=North America, 2=Europe) | Header byte $FFD9/$7FD9 |
| `developerId` | Developer/licensee code | Header byte $FFDA/$7FDA |
| `makerCode` | 2-character maker ID | Header bytes $FFB0–B1/$7FB0–B1 |
| `gameCode` | 4-character game code | Header bytes $FFB2–B5/$7FB2–B5 |
| `gameTitle` | 21-character internal title (padded with spaces) | Header bytes $FFC0–D4/$7FC0–D4 |
| `gameVersion` | Version number (usually 0) | Header byte $FFDB/$7FDB |
| `compression` | Compression algorithm (`"QuintetLZ"`, `"None"`, etc.) | Game-specific; analyze compressed data blocks |
| `nativeCop` | Label name for the COP vector handler | Native COP vector at $FFE4 (HiROM) |
| `nativeNmi` | Label name for the NMI handler | Native NMI vector at $FFEA |
| `nativeIrq` | Label name for the IRQ handler | Native IRQ vector at $FFEE |
| `emulationReset` | Label name for the reset vector | Emulation reset vector at $FFFC |
| `sfxLocation` | ROM address where SFX data starts | Game-specific analysis |
| `sfxCount` | Number of SFX entries | Game-specific analysis |

**Steps to populate config.json:**

1. Open the ROM in a hex editor
2. Find the SNES header (at $FFC0 for HiROM or $7FC0 for LoROM)
3. Read the game title (21 bytes ASCII at header+$00)
4. Read the mapping mode byte (header+$15) — determines HiROM/LoROM and Fast/Slow
5. Read chipset, RAM size, country code from subsequent header bytes
6. Read the interrupt vectors from the vector table ($FFE0–FFFF for HiROM)
7. Name the vector handler labels — these become the first entries in `names.json`

### 1.3 Set up initial files.json

`files.json` maps ROM address regions to extraction output folders. It defines the top-level scene groupings — every asset (tileset, tilemap, palette, bitmap, spritemap, music) is organized by game location.

**IOG example structure** — each top-level key is a location group, with nested subkeys for specific scenes. Each entry maps an asset name to its ROM address range and type:

```json
{
  "south_cape": {
    "": {
      "gfx_southcape_interior": {"start":79258,"end":86030,"type":"Bitmap"},
      "gfx_southcape_effect": {"start":673911,"end":680075,"type":"Bitmap"}
    },
    "south_cape": {
      "gfx_southcape": {"start":655360,"end":661558,"type":"Bitmap"},
      "set_southcape": {"start":1532305,"end":1534034,"type":"Tileset"},
      "map_sc01": {"start":1643128,"end":1644699,"type":"Tilemap"},
      "pal_southcape": {"start":1977395,"end":1977619,"type":"Palette"}
    }
  }
}
```

**File type categories:**

| Type | Description |
|------|-------------|
| `Bitmap` | Compressed tile graphics (4bpp SNES format) |
| `BitmapRaw` | Uncompressed tile graphics (set `"upper": true` for upper-half banks) |
| `Tileset` | Compressed tileset arrangement data |
| `Tilemap` | Compressed tilemap layer data |
| `Palette` | Color palette data (SNES 15-bit BGR) |
| `Spritemap` | Compressed OAM sprite layout tables |
| `Music` | SPC700 music sequence data |
| `Unknown` | Unidentified data regions |

### 1.4 Set up initial names.json

Start with the interrupt vectors and any known entry points:

```json
{
  "32768": "ResetVector",
  "32775": "CopVector",
  "32779": "NmiVector",
  "32783": "IrqVector"
}
```

> **Note:** All addresses in `names.json` (and `blocks.json`, `overrides.json`, `types.json`) are **decimal ROM file offsets**, not SNES addresses. For a HiROM game: ROM offset = SNES address − $C00000 (for bank $C0+) or = SNES address − $800000 (for bank $80+, mirrored).

### 1.5 Start with empty JSON files

```json
// blocks.json - start empty, build incrementally
{}

// overrides.json - start empty
{}

// types.json - start empty
{}
```

---

## Phase 1B — Binary File Identification & files.json Mapping

This phase covers identifying and cataloging all non-code data in the ROM — the graphics, tilemaps, palettes, music, and other binary assets that make up the game's visual and audio content. These are mapped through `files.json` and the `fileTypes.json` type definitions.

### 1B.1 Understanding SNES binary data types

A SNES ROM contains several distinct categories of binary data. Learning to identify them by their byte patterns is essential for mapping.

#### Graphics (Bitmap / BitmapRaw)

SNES tile graphics use a planar bitfield format called **4bpp** (4 bits per pixel). Each 8×8 tile occupies 32 bytes arranged in bitplane pairs. Key identification traits:

- **Compressed (`Bitmap`):** Begins with a 2-byte little-endian decompressed size header. The remaining bytes are compressed data (game-specific algorithm). If the first two bytes decoded as a 16-bit value match a plausible decompressed size (multiple of 32 for tiles), it's likely compressed graphics.
- **Uncompressed (`BitmapRaw`):** Raw 4bpp tile data with no header. Each 32-byte block is one tile. Look for repeating 32-byte patterns. Often found in fixed bank locations (e.g., character sprites at known VRAM destinations).

**How to find graphics banks:** Look for DMA transfer code — `STA $4302` (DMA source address) and `STA $4305` (DMA size) instructions will point you to graphic data locations. The VRAM destination (`$2116`/`$2117`) tells you what the graphics are for (sprites, BG tiles, etc.).

#### Tilesets

Tilesets define how 8×8 tiles are arranged into 16×16 metatiles. In IOG these are always **compressed**. Each tileset entry contains tile index, palette, flip flags, and priority bits packed into 2 bytes per metatile quadrant.

- Always compressed in Quintet games
- Referenced by scene meta setup commands (discriminator byte `$05`)
- Typically 1000–2000 bytes compressed

#### Tilemaps

Tilemaps define the spatial arrangement of metatiles on the screen layers (BG1, BG2, BG3). They are essentially 2D grids of metatile indices.

- Usually compressed, with a **2-byte header** indicating the decompressed map dimensions
- Referenced by scene meta setup commands (discriminator byte `$06`)
- Size varies enormously — small rooms may be 100 bytes compressed, large overworld maps several kilobytes

#### Palettes

SNES palettes use **15-bit BGR format** — each color is 2 bytes: `0BBBBBGG GGGRRRRR`. A full 16-color sub-palette is 32 bytes.

- **Not compressed** — always stored raw
- Easy to identify: sequential 2-byte color values where bit 15 is always 0
- Standard sizes: 32 bytes (one sub-palette), 224 bytes (full 7-subpalette BG set), 512 bytes (full 16-subpalette set)
- Look for addresses referenced by CGRAM DMA code (`STA $2121` for palette index, then DMA transfer)

#### Spritemaps

Spritemaps define how tiles from a sprite graphics sheet are arranged into animation frames. In IOG, these are compressed and use a struct-based format.

- Compressed with the game's LZ algorithm
- Extracted as `.sprite.asm` files (assembly text, not binary)
- Defined by the `&sprite-set` struct in `structs.json`
- May have a `base` property for VRAM tile offset: `"base": 16384`

#### Music

SPC700 music sequences for the S-DSP sound processor. Game-specific format — not standard SPC.

- Not compressed in IOG (stored raw)
- Referenced by the music pointer table
- Identified by tracing `StartMusic` COP calls and the music pointer array

#### Sound Effects (SFX)

Audio samples and effect data. IOG uses a "Striped" format with individual packing.

- Location and count defined in `config.json` (`sfxLocation`, `sfxCount`)
- Format specified by `sfxType` and `sfxPack` in config

### 1B.2 Compression identification

Games use different compression algorithms. You must identify which one(s) your target ROM uses.

#### QuintetLZ (used by IOG, Robotrek, Soul Blazer)

Dictionary-based LZ compression. Identification traits:

- **First 2 bytes:** Little-endian decompressed size (if `$8000` bit is set, size = `$10000 - value`)
- **If first 2 bytes are `$0000`:** Data is stored uncompressed (the remaining bytes are raw)
- **Bit-level encoding:** After the size header, data alternates between literal bytes (1-bit flag = 1) and dictionary references (1-bit flag = 0, followed by 8-bit dictionary index + 4-bit length)
- **Dictionary:** 256-byte circular buffer initialized with `$20` (space character), starting position `$EF`

Set in `config.json`:

```json
{
  "compression": "QuintetLZ"
}
```

#### Identifying unknown compression

If you don't know the compression algorithm:

1. Find DMA transfer code that reads from ROM and writes to VRAM
2. Check if there's a decompression routine called before the DMA
3. Trace the decompression routine to understand the algorithm
4. Look for known patterns: LZ77 header bytes, Huffman trees, run-length markers
5. Check community resources (Data Crystal, romhacking.net) for documented formats

#### The `uncompress` flag

Setting `"uncompress": true` in `config.json` tells the engine to decompress assets during extraction and recompress during rebuild. This means extracted binary files contain the raw decompressed data, which is easier to edit.

### 1B.3 Setting up fileTypes.json

`fileTypes.json` defines the **file type catalog** — how each asset type maps to file extensions, compression settings, and internal type names. This is required for the engine to know how to read and write each category of binary data.

**IOG fileTypes.json:**

```json
{
  "Bitmap": {
    "extension": "bin",
    "type": "Bitmap",
    "compressed": true
  },
  "BitmapRaw": {
    "extension": "raw.bin",
    "type": "Bitmap"
  },
  "Tilemap": {
    "extension": "map",
    "header": 2,
    "type": "Tilemap",
    "compressed": true
  },
  "Tileset": {
    "extension": "set",
    "type": "Tileset",
    "compressed": true
  },
  "Spritemap": {
    "extension": "sprite.asm",
    "type": "Spritemap",
    "compressed": true,
    "struct": "&sprite-set",
    "base": 16384
  },
  "Music": {
    "extension": "bgm",
    "type": "Music"
  },
  "Sound": {
    "extension": "sfx",
    "header": -2,
    "type": "Sound"
  },
  "Unknown": {
    "extension": "unk",
    "type": "Binary"
  },
  "Patch": {
    "extension": "patch.asm",
    "type": "Patch",
    "isPatch": true
  },
  "Assembly": {
    "extension": "asm",
    "type": "Assembly",
    "isBlock": true
  },
  "Palette": {
    "extension": "pal",
    "type": "Palette"
  },
  "Meta17": {
    "extension": "dmp",
    "header": 4,
    "type": "Meta17",
    "compressed": true
  }
}
```

**FileType properties:**

| Property | Description |
|----------|-------------|
| `extension` | File extension used during extraction (e.g., `.bin`, `.map`, `.pal`) |
| `type` | Internal type name for the engine's processor |
| `compressed` | Whether this type uses the ROM's compression algorithm (from `config.json`) |
| `header` | Number of header bytes to skip/preserve. Positive = header before data, negative = header at end |
| `struct` | Struct name from `structs.json` for structured binary types |
| `base` | VRAM base tile offset for spritemaps |
| `isPatch` | Whether this file type is a patch overlay |
| `isBlock` | Whether this file type contains code/data blocks |

### 1B.4 Populating files.json — the asset catalog

`files.json` maps every binary asset in the ROM to a name, location, type, and scene folder. This is the most labor-intensive part of the initial mapping — a complete game can have hundreds of assets.

#### Structure

```json
{
  "location_group": {
    "": {
      "shared_asset_name": {"start": offset, "end": offset, "type": "Type"}
    },
    "scene_name": {
      "scene_asset_name": {"start": offset, "end": offset, "type": "Type"}
    }
  }
}
```

- **Top-level keys** are location groups (matching `groups.json` keys)
- **`""` (empty string) key** holds assets shared across all scenes in that location
- **Scene-name keys** hold assets specific to that scene
- Assets shared across the entire game go in the `"shared"` location group

#### File entry properties

| Property | Required | Description |
|----------|----------|-------------|
| `start` | Yes | ROM file offset where the asset begins (decimal) |
| `end` | Yes | ROM file offset where the asset ends (exclusive, decimal) |
| `type` | Yes | Type name from `fileTypes.json` (e.g., `"Bitmap"`, `"Tilemap"`, `"Palette"`) |
| `compressed` | No | Override the type's default compression setting (`true`/`false`) |
| `upper` | No | Set `true` for data in the upper half of a bank ($8000–$FFFF offset within the bank). Used for `BitmapRaw` in HiROM games |
| `base` | No | Override the VRAM base tile offset for spritemaps |

#### Extraction output

Each `files.json` entry produces one extracted file with the extension from `fileTypes.json`:

```
files.json entry                              → Extracted file
─────────────────────────────────────────────────────────────────
"gfx_southcape" (Bitmap)                      → south_cape/south_cape/gfx_southcape.bin
"set_southcape" (Tileset)                     → south_cape/south_cape/set_southcape.set
"map_sc01" (Tilemap)                          → south_cape/south_cape/map_sc01.map
"pal_southcape" (Palette)                     → south_cape/south_cape/pal_southcape.pal
"spm_southcape_sprites" (Spritemap)           → south_cape/south_cape/spm_southcape_sprites.sprite.asm
"gfx_000000" (BitmapRaw)                      → system/gfx_000000.raw.bin
"will_sprites_1A8000" (BitmapRaw, upper:true) → system/will_sprites_1A8000.raw.bin
"bgm_illusion_of_gaia" (Music)                → music/bgm_illusion_of_gaia.bgm
"radar_layout_001E00" (Unknown)               → system/radar_layout_001E00.unk
```

### 1B.5 Systematic binary data discovery

Use these techniques to find all binary data in the ROM:

#### 1. Trace DMA/HDMA setup code

Search for writes to DMA registers (`$4300`–`$437F`). Each DMA channel setup reveals:
- Source address → ROM location of the data
- Destination register → what kind of data (VRAM, CGRAM, OAM)
- Transfer size → data length

```asm
LDA #$addr_lo        ; ← Source address low bytes → files.json start
STA $4302
LDA #$bank           ; ← Source bank byte
STA $4304
LDA #$size           ; ← Transfer size → helps calculate end
STA $4305
LDA #$01             ; ← DMA to $2118 (VRAM write)
STA $4301
```

#### 2. Trace scene loading code

The scene loading system reads `scene-meta` records that reference every asset needed for each scene. Find the scene meta table and decode each record to discover:
- All tilesets, tilemaps, and palettes per scene
- All bitmap graphics loaded for backgrounds and sprites
- Spritemap data for NPC/enemy animation frames

#### 3. Trace music loading code

Find the music pointer table (referenced by `StartMusic` COP handler) and decode each entry to find all BGM data.

#### 4. Entropy analysis

Compressed data has high entropy (near-random byte distribution). Uncompressed data — especially tile graphics — shows clear patterns. A hex editor with entropy visualization can help locate compressed blocks.

#### 5. Cross-reference against known boundaries

Once you have the `blocks.json` code blocks and `files.json` assets, check for unmapped gaps. Any significant gap between known blocks likely contains undiscovered assets.

### 1B.6 Handling compression edge cases

#### Assets with explicit compression overrides

Most asset types inherit their compression setting from `fileTypes.json`. However, some individual assets override this:

```json
"gfx_inventory_sprites": {"start":897023,"end":913409,"type":"Bitmap","compressed":false}
```

This Bitmap is explicitly **not** compressed, overriding the default `"compressed": true` from `fileTypes.json`. Use this when a specific asset breaks the pattern.

#### Assets with custom VRAM base

Spritemaps may need a `base` override when their tile indices are offset from the default:

```json
"spm_credits": {"start":1732031,"end":1733269,"type":"Spritemap","compressed":true,"base":24576}
```

The `base` value (in bytes, decimal) specifies the VRAM tile base address that spritemap tile indices are relative to.

#### Upper-half bank flag

In HiROM games, some binary data lives in the upper half of a bank (SNES addresses $xx8000–$xxFFFF). The `"upper": true` flag tells the engine to handle the bank mapping correctly:

```json
"will_sprites_1A8000": {"start":1736704,"end":1753088,"type":"BitmapRaw","upper":true}
```

This is primarily used for `BitmapRaw` and `Palette` data that the game accesses via fixed bank-relative addresses.

### 1B.7 Naming conventions for assets

Use consistent, descriptive names that identify the asset's purpose:

| Prefix | Type | Example |
|--------|------|---------|
| `gfx_` | Graphics (Bitmap/BitmapRaw) | `gfx_southcape`, `gfx_castle_sprites` |
| `set_` | Tileset | `set_southcape`, `set_castle_effect` |
| `map_` | Tilemap | `map_sc01`, `map_sc01_effect` |
| `pal_` | Palette | `pal_southcape`, `pal_castle_sprites` |
| `spm_` | Spritemap | `spm_southcape_sprites`, `spm_castoth` |
| `bgm_` | Music | `bgm_illusion_of_gaia`, `bgm_royal_anthem` |
| `sfx_` | Sound effect | `sfx_sword_swing` |

**Suffixes:**
- `_effect` — BG2/BG3 effect layer variant (tilesets, tilemaps)
- `_sprites` — sprite graphics/palettes (vs background tiles)
- `_alt` — alternate version (different area state or lighting)
- `_dark` — dark/modified palette variant
- `_interior` — interior variant of a location

### 1B.8 Verification after asset mapping

After populating `files.json`, verify by extracting and checking:

1. **File sizes** — extracted binary files should have plausible sizes (graphics in multiples of 32 bytes, palettes in multiples of 2 bytes)
2. **Decompression** — compressed files should decompress without errors. If extraction crashes or produces garbage, the start/end offsets or type are wrong
3. **Visual inspection** — use a tile viewer to check extracted graphics. If tiles look scrambled, the format or boundaries may be wrong
4. **Round-trip** — rebuild should reproduce the original compressed data byte-for-byte. Any mismatch indicates incorrect boundaries or compression settings
5. **Coverage** — check that every byte in the ROM is accounted for by either `blocks.json` (code/data) or `files.json` (binary assets), with minimal unmapped gaps

---

## Phase 2 — Initial Code Mapping with blocks.json

### 2.1 Understanding blocks.json structure

`blocks.json` is the primary structure file. It defines **logical blocks** — groups of related code/data — containing **parts** — the individual code/data pieces. The top-level keys organize blocks by category.

**IOG top-level categories:**

```json
{
  "system": { /* engine code, COP handlers, player movement, scene management */ },
  "actors": { /* reusable actor code (doors, jewels, rewards) */ },
  "thinkers": { /* background processors (palette cyclers, HDMA effects) */ },
  "unused": { /* dead code, debug stubs */ },
  "south_cape": { /* South Cape scene actors */ },
  "edward_castle": { /* Edward's Castle scene actors */ },
  "gold_ship": { /* Gold Ship scene actors */ },
  /* ... one key per game location ... */
}
```

### 2.2 Part declaration formats

`blocks.json` supports multiple declaration formats for parts. Understanding these is critical:

#### Format 1: Flat block (no sub-parts)

A block that IS a single part — used for monolithic code chunks:

```json
"system_core": { "start": 32768, "end": 33901, "type": "Code", "scene": "engine" }
```

This declares a single contiguous code region. The block name IS the part name.

#### Format 2: Block with explicit parts

A block containing named sub-parts — used when a logical unit has multiple pieces:

```json
"cop_handlers_audio": {
  "scene": "engine",
  "parts": {
    "StartMusic": { "start": 34580, "end": 34934, "type": "Code" }
  }
}
```

#### Format 3: Block with parts and block-level properties

Block-level properties (`scene`, `movable`, `group`) plus named sub-parts:

```json
"sE6_gaia": {
  "movable": true,
  "scene": "dark_space",
  "parts": {
    "sE6_gaia": { "start": 579496, "end": 579562, "type": "actor-def" },
    "DarkSpaceExit": { "start": 579562, "end": 580506, "type": "Code" },
    "dialogstring_08DD0B": { "start": 580875, "end": 581234, "type": "DialogString" },
    "GaiaHintSceneTable": { "start": 581234, "end": 581270, "type": "Binary" }
  }
}
```

#### Format 4: Parts with custom ordering

Parts can have an `order` field to control their position in extracted output, independent of their ROM address:

```json
"sFA_diary_menu": {
  "movable": false,
  "scene": "diary_menu",
  "parts": {
    "sFA_diary_menu": { "start": 778807, "end": 778956, "type": "actor-def" },
    "dialogstring_0BF3F4": { "start": 783348, "end": 783931, "order": 784046, "type": "DialogString" },
    "table_0BF63B": { "start": 783931, "end": 783975, "order": 784047, "type": "&DialogString" }
  }
}
```

The `order` field tells the assembler where to place this part during output — useful when parts are non-contiguous in ROM but logically belong together.

### 2.3 Part property reference

| Property | Required | Description |
|----------|----------|-------------|
| `start` | Yes | ROM file offset where this piece begins (decimal) |
| `end` | Yes | ROM file offset where this piece ends (exclusive, decimal) |
| `type` | Yes | Data type — primitives (`"Code"`, `"Byte"`, `"Word"`, `"Binary"`, etc.), struct names (`"actor-def"`, `"thinker-def"`), string types from `stringTypes.json` (`"DialogString"`, etc.), or pointer types (`"&Code"`, `"&DialogString"`, `"@Binary"`) |
| `scene` | No | Scene association for extraction folder routing |
| `movable` | No | Whether the block can be relocated during rebuild (`true`/`false`) |
| `order` | No | Custom sort position in extracted output |
| `group` | No | Grouping key for organization |
| `transforms` | No | Post-extraction transforms to apply |
| `compressed` | No | Whether the data is compressed (for file entries) |
| `upper` | No | Whether this is in the upper-half bank (for BitmapRaw) |

### 2.4 Start mapping: identify the reset vector

Every SNES ROM begins executing at the reset vector. Map this first:

1. Read the reset vector from the ROM header ($FFFC–FFFD for HiROM)
2. Convert to a ROM file offset
3. Trace the initialization code forward from there
4. Create the first `blocks.json` entry

```json
{
  "system": {
    "system_core": { "start": 32768, "end": 33901, "type": "Code", "scene": "engine" }
  }
}
```

### 2.5 Map major system entry points

After the reset vector, identify and map:

1. **Interrupt handlers** — NMI, IRQ, COP, BRK vectors
2. **Main game loop** — the core frame update cycle
3. **COP dispatch table** — if the game uses COP for scripting (Quintet games do)
4. **Scene loading system** — how the game loads new areas
5. **Player movement code** — the player character's tick function
6. **DMA/HDMA setup** — graphics transfer routines

### 2.6 Not everything needs mapping

**Critical principle:** You do NOT need to declare every piece of code in `blocks.json`. The engine's auto-discovery will:

- Follow branches and jumps to find code boundaries
- Detect data tables from access patterns
- Identify string references
- Scaffold types from content patterns

Only declare parts when:
- You need to **name** a logical unit (block-level grouping)
- You need to **set the type** when auto-detection fails
- You need to **set the scene** for extraction folder routing
- You need to **control movability** for rebuild
- You need to **group related pieces** that are non-contiguous

---

## Phase 3 — Iterative Extraction Passes

### 3.1 The extract-inspect-correct cycle

ROM mapping is inherently iterative. Each pass reveals more structure:

```
Pass 1: Minimal blocks.json → Extract → Inspect → Fix obvious errors
Pass 2: Add system code blocks → Extract → Verify code boundaries
Pass 3: Add scene actors → Extract → Check COP operand parsing
Pass 4: Add data tables → Extract → Verify struct layouts
Pass 5+: Refine types, names, overrides → Extract → Verify rebuild
```

### 3.2 Running extraction

```bash
npm run extract
# or explicitly:
node --env-file=.env.local src/index.ts extract <rom.smc> ./extracted
```

### 3.3 What to check after each extraction

1. **Assembly correctness** — Open extracted `.asm` files and verify:
   - Instructions look valid (no garbage opcodes)
   - Branch targets resolve to actual code
   - Data tables are formatted correctly
   - Strings are readable

2. **Type detection** — Check that the engine correctly identified:
   - Code vs. data boundaries
   - Table element sizes
   - String delimiters

3. **Register states** — Look for suspicious patterns:
   - 16-bit operations on 8-bit data (or vice versa)
   - Instructions that should be 16-bit showing as 8-bit
   - Incorrect accumulator/index sizes in code after `REP`/`SEP` instructions

4. **Code boundaries** — Verify:
   - Functions don't run into unrelated data
   - Data tables don't get disassembled as code
   - `RTL`/`RTS` endings are recognized

### 3.4 Rebuild verification

After making corrections, always verify with rebuild:

```bash
npm run rebuild
```

**The rebuild MUST produce a byte-perfect ROM.** Compare checksums:
- The rebuilt ROM must match the original ROM exactly (before any patches are applied)
- Any mismatch indicates a metadata error in your JSON files

### 3.5 Runtime verification with Mesen2

Use the Mesen2 MCP tools for runtime validation:

1. `load_rom` — Load the rebuilt ROM
2. `get_disassembly` — Compare against extracted ASM
3. `set_breakpoints` — Break on specific addresses to verify execution flow
4. `read_memory` — Check RAM state at runtime
5. `take_screenshot` — Visual verification of scenes

---

## Phase 4 — Register State Validation & Overrides

### 4.1 How register state cascading works

The 65C816 has two critical status flags that affect instruction encoding:

- **M flag** (bit 5 of P register): Controls accumulator size
  - M=1: 8-bit accumulator (A is 1 byte)
  - M=0: 16-bit accumulator (A is 2 bytes)
- **X flag** (bit 4 of P register): Controls index register size
  - X=1: 8-bit index registers (X, Y are 1 byte)
  - X=0: 16-bit index registers (X, Y are 2 bytes)

The engine **tracks these flags as it traces through code**. When it encounters:

```asm
REP #$20    ; Clear M flag → 16-bit accumulator
SEP #$20    ; Set M flag → 8-bit accumulator
REP #$10    ; Clear X flag → 16-bit index
SEP #$10    ; Set X flag → 8-bit index
REP #$30    ; Clear both → 16-bit everything
SEP #$30    ; Set both → 8-bit everything
```

The state change **cascades forward** through:
- Sequential instructions (fall-through)
- Unconditional branches (`BRA`, `JMP`)
- Conditional branches (both taken and not-taken paths)

### 4.2 When the engine gets it wrong

The engine cannot determine register state at:
- **Indirect jump targets** — `JMP ($xxxx)` or `JMP ($xxxx,X)` where the target is computed
- **Function pointer calls** — code reached via tables of pointers
- **After RTL/RTS returns** — the engine assumes the caller's state, but can't always track through complex call graphs
- **COP handler entry points** — actor code entered via the COP dispatch system
- **Conflicting branch paths** — when two paths to the same address have different M/X states

### 4.3 Adding register state overrides

When you identify incorrect register states, add overrides to `overrides.json`:

```json
{
  "36173": { "M": 0 },
  "164770": { "M": 1 },
  "165571": { "B": 129 },
  "186244": { "M": 0 }
}
```

| Key | Value | Meaning |
|-----|-------|---------|
| `"M"` | `0` | Force 16-bit accumulator at this address |
| `"M"` | `1` | Force 8-bit accumulator at this address |
| `"X"` | `0` | Force 16-bit index registers at this address |
| `"X"` | `1` | Force 8-bit index registers at this address |
| `"B"` | `129` | Force data bank register to $81 (decimal 129) |

### 4.4 How to diagnose wrong register states

**Symptom 1: Instruction operand size mismatch**

If you see `LDA #$0200` in a context where the code clearly expects an 8-bit value, the M flag is wrong. The extracted ASM will show:

```asm
LDA #$02   ; This is correct (8-bit)
; vs
LDA #$0200 ; This might be wrong if the code only needs $02
```

**Symptom 2: Subsequent instruction misalignment**

Wrong register size causes the next instruction to be decoded starting at the wrong byte, creating a cascade of garbage:

```asm
LDA #$0200    ; Engine thinks M=0 (16-bit), reads 2 bytes
BCS $FF       ; Next "instruction" is actually the high byte of the previous operand
```

**Symptom 3: Data table misalignment**

When code reads a table with the wrong accumulator size, the table entries will be parsed at the wrong width.

**Diagnostic process:**

1. Find the suspicious code in the extracted ASM
2. Trace backward to find where the M/X flag was last set
3. Check if there's an indirect jump or function pointer call that breaks the trace
4. Add an override at the target address
5. Re-extract and verify the fix cascades correctly

### 4.5 COP entrancy state

For games using COP-based scripting (all Quintet games), COP handlers always enter with a known state:

- `m=0, x=0, d=0, i=1`
- `X = D = ActorID`
- `DBR = $81`

The engine should know this from the COP dispatch analysis, but entry points reached by function pointers within COP handlers may still need overrides.

---

## Phase 5 — Data Bank Register Overrides

### 5.1 What the Data Bank Register does

The 65C816's **Data Bank Register (DBR/B)** determines which bank is used for absolute addressing modes (e.g., `LDA $1234` reads from address `BB:1234` where BB is the DBR value). This is critical for correct data access.

### 5.2 When DBR overrides are needed

Most code runs with DBR set by the game's initialization. However, some routines change DBR explicitly:

```asm
PHB          ; Push current DBR
PHK          ; Push program bank (current code bank)
PLB          ; Pull into DBR — now DBR = code bank
; ... code that accesses data in the code bank ...
PLB          ; Restore original DBR
```

Or:

```asm
LDA #$7E
PHA
PLB          ; DBR = $7E (WRAM bank)
```

The engine tracks these changes, but when code is reached via indirect jumps after a DBR change, you may need to tell the engine explicitly:

```json
{
  "165571": { "B": 129 },
  "637860": { "B": 126 }
}
```

Here, `129` = `$81` and `126` = `$7E` (values are decimal).

### 5.3 Common DBR values in Quintet games

| DBR (hex) | DBR (decimal) | Typical use |
|-----------|---------------|-------------|
| `$81` | `129` | Actor COP handler context (mirrors $01 in bank $80–$BF) |
| `$7E` | `126` | Direct WRAM access |
| `$00`–`$3F` | `0`–`63` | LoROM data banks |
| `$C0`+ | `192`+ | HiROM code/data banks |

### 5.4 Diagnosing wrong DBR

**Symptom:** Absolute address references (e.g., `LDA $1234`) point to unexpected data because the engine assumes a different bank.

**Fix:** Add a `"B"` override at the entry point of the affected code section.

---

## Phase 6 — Type Overrides with types.json

### 6.1 Purpose of types.json

`types.json` provides **type overrides for auto-scaffolded data pieces**. While `blocks.json` explicitly declares the types of mapped parts, the engine auto-discovers many data pieces during extraction. `types.json` corrects the types of these auto-discovered pieces without needing to add them to `blocks.json`.

This is key to the **minimal declarations** philosophy: instead of adding every small data piece to `blocks.json`, let the engine discover it and correct the type in `types.json` if needed.

### 6.2 Format

`types.json` is a simple address → type mapping:

```json
{
  "33900": "Byte",
  "34379": "Code",
  "45341": "Byte",
  "48045": "Word",
  "49938": "boss-reward-range",
  "50960": "&Code$2",
  "53352": "Binary",
  "164886": "&Code",
  "391099": "spawn-trigger",
  "446125": "actor-def",
  "575164": "zone-trigger"
}
```

### 6.3 Available types

**Primitive types (hard-coded in the engine `MemberType` enum):**

| Type | Size | Description |
|------|------|-------------|
| `Code` | Variable | 65C816 machine code |
| `Byte` | 1 byte | Raw byte data |
| `Word` | 2 bytes | 16-bit word |
| `Offset` | 2 bytes | 16-bit offset within a bank — resolves to a reference using the bank from context (or bank hint `$N` suffix) |
| `Address` | 3 bytes | 24-bit absolute address (bank byte + 16-bit offset) |
| `Binary` | Variable | Raw binary blob |
| `Branch` | Variable | Branch target (used internally by the engine for code flow) |
| `Location` | 3 bytes | Physical ROM file location (16-bit offset + bank byte, composed directly — **not** a SNES address) |
| `OddLocation` | 3 bytes | Calculated address using a complex bank-boundary formula (see `parser.ts` `parseLocation`). Due to ROM expansion/relocation, encoding back into `OddLocation` is not possible and requires a patch (see Robotrek `baserom/meta_load.patch.asm`) |

> ⚠ **`Console` and `DialogString` are NOT primitive types.** String type names like `DialogString`, `ConsoleString`, `SpriteString` come entirely from `stringTypes.json` and are game-specific. See [Phase 7B](#phase-7b--string-types--stringtypesjson-mapping).

**Pointer types (see Phase 12):**

| Type | Size | Description |
|------|------|-------------|
| `&Code` | 2 bytes | Short pointer to code (same bank) |
| `@Code` | 3 bytes | Long pointer to code (cross-bank) |
| `&Binary` | 2 bytes | Short pointer to binary data |
| `@Binary` | 3 bytes | Long pointer to binary data |
| `&Code$2` | 2 bytes | Short pointer to code — targeting **bank $02** (see [Bank hints on pointer types](#64-bank-hints-on-pointer-types)) |
| `&Code$$` | 2 bytes | Short pointer to code — targeting the **current data bank register** (DBR) |

**String types (from `stringTypes.json` — NOT hard-coded):** Any key defined in `stringTypes.json` becomes a valid type. Pointer prefixes work too (e.g., `&DialogString`, `@ConsoleString`). See [Phase 7B](#phase-7b--string-types--stringtypesjson-mapping).

**Struct types:** Any name defined in `structs.json` (e.g., `"boss-reward-range"`, `"spawn-trigger"`, `"actor-def"`)

**Type modifiers (advanced):**

| Modifier | Syntax | Example | Meaning |
|----------|--------|---------|---------|
| Array | `Type[N]` | `Word[10]` | Fixed-size array of N elements (hex count) |
| Fixed-size | `Type(N)` | `DialogString(200)` | String/binary with fixed size N (hex) |
| Soft | `~Type` | `~Code` | Soft type hint — does not forcefully override existing types |
| Raw | `Type!` | `DialogString!` | Raw mode — suppresses command parsing for strings |

### 6.4 Bank hints on pointer types

Short pointer types (`&`-prefixed) read a **2-byte offset** from ROM, but the engine needs to know which **bank** that offset belongs to in order to resolve it to a full ROM location. By default, the engine resolves the bank from the current code position (same bank). You can override this with a **bank hint suffix**:

**Syntax:** `&TypeName$N` where `N` is a hex bank number, or `$$` for the current DBR.

| Type | Meaning |
|------|---------|
| `&Code` | Short pointer to code — bank resolved from current position (same bank) |
| `&Code$2` | Short pointer to code — targeting bank `$02` |
| `&Code$0` | Short pointer to code — targeting bank `$00` |
| `&Code$8` | Short pointer to code — targeting bank `$08` |
| `&Code$$` | Short pointer to code — targeting the current **Data Bank Register** (DBR) value |
| `&Binary$1C` | Short pointer to binary data — targeting bank `$1C` |

Bank hints work with **any** `&`-prefixed pointer type: `&Code$N`, `&Binary$N`, `&DialogString$N`, `&actor-def$N`, etc.

**How it works:** The engine parses the `$N` suffix as a hex bank number, combines it with the 2-byte offset read from ROM, and resolves the full address. The special `$$` variant uses the data bank register value from `overrides.json` (or the game's default bank, typically `$81`).

**Example from IOG `types.json`:**

```json
{
  "50960": "&Code$2"
}
```

This tells the engine: "At ROM address 50960, read 2-byte offsets as short pointers to code in bank `$02`."

> ⚠ **`$N` is a bank hint, not a size declaration.** All `&`-prefixed types are always 2 bytes. The `$N` controls which bank the offset is resolved against.

### 6.5 When to use types.json vs blocks.json

| Situation | Use |
|-----------|-----|
| A named, important code/data block you want to organize | `blocks.json` |
| A small data piece the engine found but typed wrong | `types.json` |
| A piece that needs scene routing or movability flags | `blocks.json` |
| A table whose element type the engine can't detect | `types.json` |
| Binary padding or filler bytes between blocks | `types.json` (`"Binary"`) |

**Rule of thumb:** Prefer `types.json` for corrections, `blocks.json` for organization.

---

## Phase 7 — Struct Identification & Definition

### 7.1 What structs are

Structs define the layout of repeated data records — tables where each row has a fixed set of typed fields. The engine uses struct definitions to parse these tables into readable assembly.

### 7.2 Defining structs in structs.json

```json
{
  "spawn-trigger": { "types": [ "Word", "Word", "Word" ], "delimiter": 65535 },
  "enemy-spawn": {
    "discriminator": 6,
    "delimiter": 255,
    "types": ["Byte", "Byte", "Byte", "@actor-def", "Byte", "Byte", "Byte"]
  },
  "actor-def": { "types": [ "Byte", "Byte", "Byte", "Code" ] },
  "thinker-def": { "types": [ "Byte", "Byte", "Code" ] },
  "warp-def": { "types": [ "scene-warp", "stair-warp" ] },
  "scene-warp": { 
    "types": [ "Byte", "Byte", "Byte", "Byte", "Byte", "Word", "Word", "Byte", "Word" ], 
    "delimiter": 255 
  }
}
```

### 7.3 Struct properties

| Property | Description |
|----------|-------------|
| `types` | Array of field types, in order (primitives, pointers, or other struct names) |
| `delimiter` | End-of-record or end-of-table marker value |
| `tail` | Number of trailing bytes after the main record |
| `discriminator` | Field index (0-based) used to distinguish subtypes |
| `parent` | Parent struct name for polymorphic struct hierarchies |

### 7.4 Polymorphic structs (meta-structs)

IOG uses a **meta-struct** system for scene setup data. A discriminator byte determines which subtype to parse:

```json
{
  "meta<>": { "discriminator": 0, "delimiter": 0 },
  "bitmap": {
    "parent": "meta<>",
    "discriminator": 3,
    "types": ["Byte", "Byte", "Byte", "@Binary", "Byte"]
  },
  "tileset": {
    "parent": "meta<>",
    "discriminator": 5,
    "types": ["Byte", "Byte", "Byte", "Byte", "@Binary"]
  },
  "tilemap": {
    "parent": "meta<>",
    "discriminator": 6,
    "types": ["Byte", "@Binary"]
  }
}
```

When the engine encounters a `meta<>` record, it reads the discriminator byte (field 0) and dispatches to the matching child struct.

### 7.5 How to identify structs

1. **Find repeated data patterns** — look for tables where every N bytes follows the same layout
2. **Check access code** — the code that reads the table reveals field sizes and types
3. **Look for delimiters** — tables often end with `$FF` or `$FFFF` sentinel values
4. **Check pointer fields** — fields that reference other data are either `&` (2-byte) or `@` (3-byte) pointers
5. **Verify with Mesen2** — set breakpoints on table reads to confirm field boundaries

### 7.6 IOG core structs reference

| Struct | Fields | Used for |
|--------|--------|----------|
| `actor-def` | Byte, Byte, Byte, Code | Actor initialization records |
| `thinker-def` | Byte, Byte, Code | Background processor records |
| `enemy-spawn` | Byte×3, @actor-def, Byte×3 | Scene enemy spawn tables |
| `actor-spawn` | Byte×3, @actor-def | Scene NPC spawn tables |
| `thinker-spawn` | Byte, @thinker-def | Scene thinker spawn tables |
| `scene-meta` | Word, meta<> | Scene asset/setup manifest |
| `spawn-trigger` | Word, Word, Word | Scene spawn trigger conditions |
| `zone-trigger` | Byte×5 | Zone boundary trigger conditions |
| `warp-def` | scene-warp, stair-warp | Scene transition definitions |

---

## Phase 7B — String Types & stringTypes.json Mapping

### 7B.1 String types are NOT hard-coded

**Critical:** The names `DialogString`, `ConsoleString`, `SpriteString`, etc. are **not** built-in engine types. They are defined entirely in `stringTypes.json` and can be named anything. The engine reads `stringTypes.json` at startup and registers each key as a valid type name. If you name a string type `"MyCustomString"` in `stringTypes.json`, then `"MyCustomString"` becomes a valid type in `blocks.json`, `types.json`, and `structs.json`.

This means:
- Every game defines its own string type names
- The character encoding, commands, and delimiters are fully configurable per type
- A game can have any number of string types (IOG has three: `DialogString`, `ConsoleString`, `SpriteString`)
- Pointer types like `&DialogString` and `&ConsoleString` are also derived from the names in `stringTypes.json`

### 7B.2 stringTypes.json structure

Each key in `stringTypes.json` defines a complete string type with its encoding, delimiter, terminator, character map, and embedded commands:

```json
{
  "DialogString": {
    "delimiter": "`",
    "terminator": 202,
    "greedyTerminator": true,
    "layers": [ /* character maps */ ],
    "commands": { /* embedded command definitions */ },
    "dictionaries": { /* compression dictionaries */ }
  },
  "ConsoleString": {
    "delimiter": "|",
    "terminator": 0,
    "layers": [ /* character maps */ ],
    "commands": { /* embedded command definitions */ }
  },
  "SpriteString": {
    "delimiter": "~",
    "terminator": 202,
    "layers": [ /* character maps */ ],
    "commands": { /* embedded command definitions */ }
  }
}
```

### 7B.3 String type properties

| Property | Description |
|----------|-------------|
| `delimiter` | The character used to delimit the string in extracted `.asm` text. Each type uses a different delimiter so the engine can distinguish types: `` ` `` for DialogString, `\|` for ConsoleString, `~` for SpriteString |
| `terminator` | The byte value that ends the string in the ROM binary (e.g., `202` = `$CA`, `0` = `$00`) |
| `greedyTerminator` | If `true`, the engine consumes the terminator as part of the string (treats it as the `[END]`/`[RET]` command). If absent/false, the terminator is a separate sentinel |
| `layers` | Array of character map layers — defines the byte-to-character mapping |
| `commands` | Object mapping command names to their binary encoding and parameter types |
| `dictionaries` | Optional compression dictionaries — lookup tables for common words/phrases |

### 7B.4 Character map layers

Each `layers` entry defines a mapping from byte values to display characters:

```json
{
  "layers": [
    {
      "shiftBit": 4,
      "map": [
        "Ǫ", "į", "ņ", "ţ", "ę", "ť", "Ĕ", "Ň", "Ĭ", "Ẋ", "Ẍ", "Ĉ", "Č", "?", "'", "▼",
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ".", ",", "►", "\"", "ˮ", ":",
        "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "!",
        /* ... */
      ]
    },
    {
      "base": 224,
      "map": [
        "à", "á", "â", "ã", "À", "Á", "è", "é", /* ... */
      ]
    }
  ]
}
```

| Layer property | Description |
|----------------|-------------|
| `map` | Array of characters indexed by byte value. `null` entries mean "not a printable character" (byte is a command or unused) |
| `shiftBit` | If present, characters in this layer use a shifted encoding — the byte value is right-shifted by this many bits to get the index |
| `base` | If present, this layer maps bytes starting from this value (e.g., `"base": 224` means byte `$E0` maps to `map[0]`) |

### 7B.5 Embedded commands

String commands are byte sequences embedded within strings that control text formatting, flow, and display. In extracted `.asm` they appear as `[COMMAND:args]` inside the string delimiters.

```json
"commands": {
  "END": { "id": 192, "types": [], "halt": true },
  "DLG": { "id": 193, "types": [ "Byte", "Byte" ] },
  "PAL": { "id": 195, "types": [ "Byte" ] },
  "N": { "id": 203, "types": [] },
  "SFX": { "id": 210, "types": [ "Byte" ] },
  "DEF": { "id": 211, "types": [] },
  "LU1": { "id": 214, "types": [ "Byte" ] },
  "ESC": { "id": 216, "types": [ "Binary" ], "delimiter": 0 }
}
```

**Command properties:**

| Property | Description |
|----------|-------------|
| `id` | The byte value that triggers this command in the ROM binary |
| `types` | Array of parameter types following the command byte (e.g., `["Byte", "Byte"]` means two 1-byte parameters) |
| `halt` | If `true`, this command terminates the string (e.g., `[END]`, `[RET]`) |
| `delimiter` | For commands with variable-length payloads (like `ESC`), the byte that ends the payload |

**IOG DialogString commands reference:**

| Command | ID | Parameters | Purpose |
|---------|----|------------|---------|
| `[END]` | 192 | None | Terminate string, close dialog box |
| `[DLG:x,y]` | 193 | Byte, Byte | Set dialog box position and size |
| `[TPL:n]` | 194 | Byte | Set text palette |
| `[PAL:n]` | 195 | Byte | Set overall palette |
| `[ADR:offset,word]` | 197 | Offset, Word | Address reference (text pointer) |
| `[BCD:addr,len]` | 198 | Word, Word | Print BCD number from RAM |
| `[SIZ:w,h]` | 199 | Byte, Byte | Set dialog box dimensions |
| `[CLD]` | 200 | None | Clear dialog box |
| `[PAU:n]` | 201 | Byte | Pause for N frames |
| `[RET]` | 202 | None | Return (close without clearing) |
| `[N]` | 203 | None | Newline |
| `[SKP:n]` | 204 | Byte | Skip N pixels horizontally |
| `[PRT:addr]` | 205 | Address | Print string at address |
| `[CLR]` | 206 | None | Clear text |
| `[FIN]` | 207 | None | Finalize |
| `[WAI]` | 208 | None | Wait for button press |
| `[JMP:offset]` | 209 | Offset | Jump to string offset |
| `[SFX:n]` | 210 | Byte | Play sound effect |
| `[DEF]` | 211 | None | Default formatting |
| `[SEP:n,word]` | 212 | Byte, Word | Separator/conditional |
| `[DLY:n]` | 213 | Byte | Delay N frames |
| `[LU1:n]` | 214 | Byte | Dictionary 1 lookup — insert common word/phrase |
| `[LU2:n]` | 215 | Byte | Dictionary 2 lookup — insert common word/phrase |
| `[ESC:...]` | 216 | Binary (0-terminated) | Raw escape sequence |
| `[BOR:n]` | 217 | Byte | Border style |
| `[NAM:n]` | 218 | Byte | Character name substitution |

### 7B.6 String dictionaries

Games may use dictionary compression for strings — common words and phrases stored in lookup tables and referenced by index. This dramatically reduces dialogue size.

```json
"dictionaries": {
  "dictionary_01EBA8": {
    "command": 214,
    "commandName": "LU1",
    "entries": [
      "Attack ", "Angel ", "After ", "Aura ", "Ankor ",
      "Black ", "Bill: ", "Crystal ", "City ", "Come ",
      /* ... 128 entries ... */
    ]
  },
  "dictionary_01F54D": {
    "command": 215,
    "commandName": "LU2",
    "entries": [ "1994 ", "Actually, ", "Button ", /* ... */ ]
  }
}
```

| Dictionary property | Description |
|---------------------|-------------|
| `command` | The command byte ID that triggers this dictionary lookup |
| `commandName` | The command name used in extracted text (e.g., `LU1`) |
| `entries` | Array of strings indexed by the parameter byte — `[LU1:5]` inserts `entries[5]` |

### 7B.7 How strings appear in extracted ASM

Each string type uses its unique delimiter character in the extracted output:

**DialogString** — backtick delimiters (`` ` ``):

```asm
dialogstring_0483F6 `[DEF]Gosh.[N]I can't pull it up...[END]`

dialogstring_048479 `[DLG:3,11][SIZ:D,3]You've found[N]a Red Jewel![END]`
```

**ConsoleString** — pipe delimiters (`|`):

```asm
consolestring_01DA47 |[NHM:4][CUR:D0,4]PUSH START BUTTON|
```

**SpriteString** — tilde delimiters (`~`):

```asm
spritestring_03B244 ~South Cape~

spritestring_03B25A ~Edward's Castle~
```

### 7B.8 Using string types in blocks.json and types.json

String type names from `stringTypes.json` are used directly as type values anywhere in the database:

```json
// blocks.json — explicit string part declarations
"dialogstring_08DD0B": { "start": 580875, "end": 581234, "type": "DialogString" }

// types.json — type override for auto-discovered strings
"172393": "DialogString"
"505338": "DialogString"

// Pointer types to strings
"table_08EB8F": { "start": 584591, "end": 584659, "type": "&DialogString" }

// In struct fields (structs.json)
"diary-entry": { "types": [ "DialogString", "Binary" ] }
"map-label": { "types": [ "Byte", "&SpriteString" ], "delimiter": 0 }
"scene-event": { "types": [ "enemy-spawn", "DialogString" ] }
```

### 7B.9 Defining string types for a new game

When mapping a new ROM:

1. **Find the text rendering routine** — trace from where characters appear on screen backward to find the string parser
2. **Identify the encoding** — map byte values to displayed characters by setting breakpoints on the renderer and stepping through strings
3. **Find the terminator** — what byte ends a string? (`$00`, `$CA`, `$FF`, etc.)
4. **Identify embedded commands** — non-printable bytes within strings that trigger special behavior (newlines, pauses, palette changes, sound effects)
5. **Map command parameters** — for each command byte, determine how many parameter bytes follow and their types
6. **Find dictionaries** — if strings use lookup commands, find the dictionary tables in ROM
7. **Choose a delimiter** — pick a character NOT used in the string's own character map (backtick, pipe, tilde are common choices)
8. **Define everything in `stringTypes.json`** — the engine handles the rest

### 7B.10 Multiple string systems

A game typically has different string types for different rendering contexts:

| Type | Typical use | Encoding | Commands |
|------|-------------|----------|----------|
| `DialogString` | NPC dialogue, story text, item descriptions | Proportional font, variable-width | Rich: newlines, pauses, palette, SFX, dialog box positioning, dictionary lookup |
| `ConsoleString` | Menu text, UI labels, status screens | Fixed-width tile font, VRAM-direct | Moderate: cursor positioning, rectangles, number formatting |
| `SpriteString` | World map labels, sprite-overlaid text | Sprite-based font, OAM rendering | Minimal: newline, return |

Each string system has its own character encoding because each uses different font tile arrangements in VRAM.

---

## Phase 8 — Scaffolding, Names, and Minimal Part Declarations

### 8.1 The minimal declarations philosophy

The engine's auto-discovery is powerful. Rather than declaring every small function and data table as a separate part in `blocks.json`, the preferred approach is:

1. **Map large contiguous ranges** as single blocks in `blocks.json`
2. **Use `names.json`** to label important addresses within those ranges
3. **Use `types.json`** to correct auto-detected types
4. **Only split into explicit parts** when you need different scenes, movability, or types for sub-ranges

### 8.2 Example: mapping a large code range

Instead of:

```json
"cop_handlers": {
  "parts": {
    "StartMusic": { "start": 34580, "end": 34633, "type": "Code" },
    "FadeThenStartMusic": { "start": 34633, "end": 34686, "type": "Code" },
    "PlaySoundCh2": { "start": 34686, "end": 34706, "type": "Code" },
    "PlaySoundCh1": { "start": 34706, "end": 34726, "type": "Code" },
    "PlaySoundBoth": { "start": 34726, "end": 34741, "type": "Code" }
  }
}
```

Prefer mapping the whole range as one block and naming sub-pieces via `names.json`:

```json
// blocks.json — one entry covers the entire COP audio handler range
"cop_handlers_audio": {
  "scene": "engine",
  "parts": {
    "StartMusic": { "start": 34580, "end": 34934, "type": "Code" }
  }
}
```

```json
// names.json — labels within the range
{
  "34580": "StartMusic",
  "34633": "FadeThenStartMusic",
  "34686": "PlaySoundCh2",
  "34706": "PlaySoundCh1",
  "34726": "PlaySoundBoth",
  "34741": "WriteApuIo1",
  "34761": "WriteApuIo0",
  "34781": "MusicAndText"
}
```

The engine will auto-discover the sub-functions within the range and apply the names from `names.json`.

### 8.3 When to use explicit parts

Use explicit parts only when:

- **Different types within a block** — e.g., a block has both Code and data tables
- **Non-contiguous pieces** — code that belongs together but has gaps in ROM
- **Different movability** — some pieces can move, others can't
- **Different scenes** — pieces that extract to different folders
- **Custom ordering** — pieces that need `order` fields

### 8.4 Names.json best practices

- **Name every major function entry point** — anything a human would want to reference
- **Name all COP handler addresses** — these appear in the dispatch table
- **Name data table bases** — the start of lookup tables and struct arrays
- **Name string addresses** — dialogue strings with meaningful names
- **Use descriptive names** — `PlayerMovementTick` not `code_02D050`
- **Follow naming conventions:**
  - COP handlers: `VerbNoun` (e.g., `StartMusic`, `SetTilePos`)
  - Actor entry points: `scXX_descriptive_name` (e.g., `sc01_fisherman`)
  - System functions: `FunctionName` (e.g., `GenHdmaSine`)
  - Data tables: `tablename_descriptor` (e.g., `sine_table_8bit`)

---

## Phase 8B — Operand Annotations with labels.json

### 8B.1 What labels.json does

`labels.json` provides **operand transform annotations** — it tells the engine how to resolve raw numeric operand bytes at specific ROM addresses into meaningful symbolic references. Without these annotations, the engine may output raw hex values or misidentify which bank a 2-byte offset points to.

This is distinct from `names.json` (which maps addresses to human-readable label names). `labels.json` controls how the engine **interprets operand data** during extraction — it transforms a raw byte/word value into a resolved reference.

### 8B.2 Annotation patterns

Each key in `labels.json` is a decimal ROM file offset (the address of the operand, not the instruction). The value is an annotation string:

```json
{
  "33888": "",
  "34819": "$2",
  "33883": "^00846C",
  "34593": "*03E1D6",
  "34145": "#$0000"
}
```

#### Pattern reference

| Pattern | Name | Meaning | Example |
|---------|------|---------|---------|
| `""` (empty string) | Same-bank short | The 2-byte operand at this address is a **short reference** to the same bank as the current code | `"33888": ""` |
| `"$N"` | Cross-bank short | The 2-byte operand is a short reference targeting **bank N** (hex) | `"34819": "$2"` — offset points into bank `$02` |
| `"^XXXXXX"` | Bank byte | The 1-byte operand is the **bank byte** of the part at ROM location `XXXXXX` (hex) | `"33883": "^00846C"` — byte here is the bank of code at `$00846C` |
| `"*XXXXXX"` | Word bank | The 2-byte operand is the **bank portion** (stored as a word) of a reference to ROM location `XXXXXX` (hex) | `"34593": "*03E1D6"` — word here is the bank of address `$03E1D6` |
| `"#$XXXX"` | Immediate literal | Force the operand to be output as a **raw literal value** instead of resolving it as a reference | `"34145": "#$0000"` — output `#$0000` literally |

### 8B.3 How annotations resolve

The engine processes annotations in `TransformProcessor.applyTransform()`:

**Blank (`""`):** Reads the 2-byte operand value, determines the bank from the current code position using `Address.resolveBank()`, and resolves the full address. This is the most common pattern — it simply tells the engine "this is a reference, figure out the bank from context."

**`$N` (bank hint):** Reads the 2-byte operand value, parses `N` as a hex bank number, and combines them into a full address. Use this when the operand is a short pointer but the target is in a **different bank** than the current code.

**`^XXXXXX` (bank byte):** The operand at this position is a single bank byte. The `XXXXXX` is the ROM location it references. The engine uses `AddressType.Bank` to emit a `^` prefix in the output (e.g., `^PartName`).

**`*XXXXXX` (word bank):** The 2-byte operand is the bank portion of a reference, stored as a word. The `XXXXXX` is the target ROM location. The engine uses `AddressType.WBank` to emit a `*` prefix in the output.

**`#$XXXX` (literal):** No resolution is performed — the engine outputs the annotation string literally. Use for operands that are numeric constants, not address references.

### 8B.4 Common patterns in practice

**Paired `^` and `""` entries** — Long pointers stored as separate bank byte + word:

Many SNES games split a 3-byte pointer across two operands. The bank byte gets `^XXXXXX` and the word gets `""` or `$N`:

```json
{
  "33883": "^00846C",
  "33888": ""
}
```

This means: at address 33883, the byte is the bank of code at `$00846C`. At address 33888, the word is the offset portion (same bank as current code).

**Paired `*` and `$N` entries** — Bank (as word) and offset stored separately:

```json
{
  "34593": "*03E1D6",
  "34640": "$3"
}
```

At 34593, the 2-byte value is the bank of address `$03E1D6`. At 34640, the 2-byte value is a short offset into bank `$03`.

**Vector table entries** — Null pointers as literals:

```json
{
  "34145": "#$0000",
  "34147": "#$0000",
  "34149": "#$0000"
}
```

These entries in the interrupt vector table are null pointers. The `#$0000` annotation prevents the engine from trying to resolve `$0000` as an address reference.

### 8B.5 When to add labels.json entries

Add annotations when:

1. **The engine outputs raw hex values** where a named reference should appear — add `""` or `"$N"` to resolve the reference
2. **The engine resolves to the wrong bank** — add `"$N"` with the correct bank
3. **A pointer is split across operands** — use `"^XXXXXX"` for bank bytes and `""` or `"$N"` for offset words
4. **A bank value is stored as a word** — use `"*XXXXXX"` for the 2-byte bank operand
5. **A value should NOT be resolved** as a reference — use `"#$XXXX"` to force literal output
6. **Cross-bank data references** in COP operands or struct fields need bank disambiguation

### 8B.6 labels.json vs types.json bank hints

Both `labels.json` and `types.json` can specify bank information, but they serve different purposes:

| Mechanism | Scope | Used for |
|-----------|-------|----------|
| `labels.json` annotations | Individual operand at a specific ROM address | Assembly instruction operands, COP operand bytes, struct field values |
| `types.json` bank hints (`&Code$2`) | All entries in a data table | Tables of short pointers where every entry targets the same bank |

Use `labels.json` for one-off operand corrections. Use type bank hints when an entire table of pointers targets a specific bank.

---

## Phase 9 — Code Coagulation & Module Separation

### 9.1 What is code coagulation?

Code coagulation is the process of grouping related code pieces into logical blocks that:
- Extract to the same `.asm` file
- Rebuild together as a unit
- Share `$&` (same-bank) references safely

The goal is to create blocks that mirror the game's logical architecture — not the physical ROM layout.

### 9.2 Coagulation rules

**Group together:**
- An actor's initialization code, its behavior handlers, and its dialogue strings
- A COP handler cluster that shares internal `$&` references
- A system with its lookup tables and helper functions
- Non-contiguous pieces that belong to the same logical unit (use `order` fields)

**Separate:**
- Code for different scenes — each scene gets its own extraction folder
- Reusable functions that multiple blocks reference — put in `functions/` or `actors/`
- Data tables shared across the whole game — put in `tables/`
- Unused/dead code — put in `unused/`

### 9.3 Deciding on block boundaries

1. **Trace `$&` references** — all code connected by `$&` (same-bank) refs MUST stay in the same block
2. **Check `?INCLUDE` chains** — these define compile-time dependencies and should align with block boundaries
3. **Check `?BANK` declarations** — these are hard bank constraints that limit block placement
4. **Identify shared code** — routines called by multiple blocks should be factored out

### 9.4 Module separation patterns

**Scene actors** — each scene gets a folder with one `.asm` file per actor:

```
extracted/south_cape/south_cape/
├── sc01_fisherman.asm    # One actor per file
├── sc01_guard.asm
├── sc01_girl1.asm
└── sc01_seagull.asm
```

**System code** — core engine in `system/`, organized by function:

```
extracted/system/
├── system_core.asm           # Reset, NMI, frame loop
├── scene_script.asm          # Scene loading/unloading
├── spc_transfer.asm          # SPC700 audio transfer
└── diary_menu/
    └── sFA_diary_menu.asm    # Menu system (sub-folder for complex blocks)
```

**Reusable actors** — shared code in `actors/`:

```
extracted/actors/
├── town_door.asm             # Used by many scenes
├── hidden_red_jewel.asm      # Generic collectible
└── floor_button.asm          # Pressure plate actor
```

### 9.5 The scene property

The `scene` property on blocks controls extraction folder routing:

```json
"ec0A_torch1": { "start": 311184, "end": 311226, "type": "actor-def", 
                 "scene": "edward_castle", "movable": true }
```

Scene values match keys in `groups.json`:

```json
{
  "system": {
    "prefix": "sy",
    "scenes": {
      "dark_space": { "id": 230, "description": "Dark Space" },
      "engine": { /* no id — engine-only scene */ }
    }
  },
  "south_cape": {
    "prefix": "sc",
    "scenes": {
      "south_cape": { "id": 1, "description": "South Cape" },
      "coastal_cave": { "id": 2, "description": "Coastal Cave" }
    }
  }
}
```

---

## Phase 10 — Scene Assets, Spawn Tables & Setup Manifests

### 10.1 Scene meta structure

In Quintet games, each scene has a **scene meta record** — a manifest that defines all assets to load (tilesets, tilemaps, palettes, spritemaps, music) and all actors/thinkers to spawn. These are indexed by scene ID.

**IOG scene meta format** (from `structs.json`):

```json
"scene-meta": { "types": [ "Word", "meta<>" ] }
```

Each scene meta record contains a series of tagged setup commands using the polymorphic `meta<>` struct.

### 10.2 Finding scene meta tables

1. **Look for the scene loading routine** — it reads a scene ID, indexes into a pointer table, and processes meta records
2. **The pointer table** is typically a list of `&scene-meta` entries indexed by scene ID
3. **Map the pointer table** in `blocks.json` and use `scene-meta` as the type

IOG example from `extracted/tables/scene_meta.asm`:

```asm
scene-meta_list [
  &scene_meta_0000   ;00
  &scene_meta_0001   ;01
  &scene_meta_0002   ;02
  ; ... one entry per scene ID
]
```

### 10.3 Spawn tables

Spawn tables define which actors and thinkers appear in each scene:

**Enemy/actor spawns** (from `structs.json`):

```json
"enemy-spawn": {
  "discriminator": 6,
  "delimiter": 255,
  "types": ["Byte", "Byte", "Byte", "@actor-def", "Byte", "Byte", "Byte"]
}
```

Fields: X position, Y position, sprite frame, actor code address, direction, variant, flags. Terminated by `$FF`.

**Thinker spawns:**

```json
"thinker-spawn": { "types": [ "Byte", "@thinker-def" ], "delimiter": 255 }
```

### 10.4 Identifying spawn triggers

Spawn triggers determine when a group of enemies appears based on kill counts or event flags:

```json
"spawn-trigger": { "types": [ "Word", "Word", "Word" ], "delimiter": 65535 }
```

Use `types.json` to mark spawn trigger data:

```json
{
  "391099": "spawn-trigger",
  "563368": "spawn-trigger"
}
```

### 10.5 Warp definitions

Scene warps define transitions between areas:

```json
"warp-def": { "types": [ "scene-warp", "stair-warp" ] },
"scene-warp": { 
  "types": [ "Byte", "Byte", "Byte", "Byte", "Byte", "Word", "Word", "Byte", "Word" ], 
  "delimiter": 255 
}
```

---

## Phase 11 — Shared Code & Destroy Handlers

### 11.1 Identifying shared code

Some code pieces are referenced by multiple independent actors or systems. These should be factored out as separate blocks:

**Common patterns:**
- **Destroy handlers** — `_destroy` code that cleans up an actor on death, referenced by multiple actors
- **Collision response handlers** — shared hit/damage processing
- **Animation utility functions** — sprite frame cycling, palette effects
- **Movement helpers** — pathfinding, grid alignment

### 11.2 Mapping shared destroy handlers

Many actors share a common destroy handler (often just `RTL` or a short cleanup sequence):

```json
"btE3_kara": {
  "scene": "babel_upper_floors",
  "movable": true,
  "parts": {
    "btE3_kara": { "start": 623893, "end": 624160, "type": "actor-def" },
    "btE3_kara_destroy": { "start": 624351, "end": 624353, "type": "Code" }
  }
}
```

**How to identify shared destroy handlers:**

1. Look for short code pieces (2–10 bytes) near actor definitions
2. Check if they're referenced by multiple actors' `SetDeathCallback` COP calls
3. If shared by actors in different blocks, factor to `functions/` or `actors/`
4. If only shared within one block, keep as a `parts` sibling

### 11.3 Factoring to functions/

When a helper is truly global (used across many scenes):

```json
// blocks.json - separate reusable code
"actors": {
  "hit_stagger_controller": { "start": 55415, "end": 55928, "type": "Code", "movable": true },
  "field_reveal_object": { "start": 55928, "end": 56202, "type": "Code", "movable": true }
}
```

These extract to `extracted/actors/` and are `?INCLUDE`d by actor files that reference them.

### 11.4 The `?INCLUDE` pattern

When shared code is factored out, actor files reference it via `?INCLUDE`:

```asm
?INCLUDE 'hidden_red_jewel'
?INCLUDE 'spriteset_npc_props'
```

This creates compile-time dependencies. The `?INCLUDE` chain defines the logical compilation unit — all included files must be assembled together.

---

## Phase 12 — Pointer Types & Reference Handling

### 12.1 Reference prefixes

The assembler uses sigils to encode address reference sizes:

#### Assembly operand prefixes

| Prefix | Size | Meaning |
|--------|------|---------|
| `$&label` | 2 bytes | Short reference — target in same bank |
| `$@label` | 3 bytes | Long reference — cross-bank OK |
| `#$&label` | 2 bytes | Immediate short pointer constant |
| `#$@label` | 3 bytes | Immediate long pointer constant |
| `&Code` | 2 bytes | COP operand — offset in current script bank |
| `@Code` / `Address` | 3 bytes | COP operand — far pointer |

#### Address type sigils (used internally and in labels.json output)

The engine uses additional sigils for specific address resolution types:

| Sigil | AddressType | Size | Meaning |
|-------|-------------|------|---------|
| `&` | `Offset` | 2 bytes | Short offset within a bank |
| `@` | `Address` | 3 bytes | Full 24-bit address (bank + offset) |
| `^` | `Bank` | 1 byte | Bank byte only — references the bank of a target address |
| `*` | `WBank` | 2 bytes | Bank portion of an address stored as a word (2 bytes) |
| `%` | `Location` | 3 bytes | Physical ROM file location (not a SNES address) |
| `!` | `OddLocation` | 3 bytes | Calculated address with complex bank-boundary formula; cannot round-trip through rebuild without a patch |

The `^` and `*` sigils appear in extracted `.asm` output when `labels.json` annotations produce split-pointer references (see [Phase 8B](#phase-8b--operand-annotations-with-labelsjson)).

### 12.2 Pointer type declarations

When declaring parts in `blocks.json` or types in `types.json`, pointer types indicate that the data contains pointers TO other data:

| Type declaration | Meaning |
|------------------|---------|
| `"&Code"` | Table of 2-byte pointers to code (same bank) |
| `"@Code"` | Table of 3-byte pointers to code (cross-bank) |
| `"&Binary"` | Table of 2-byte pointers to binary data |
| `"@Binary"` | Table of 3-byte pointers to binary data |
| `"&DialogString"` | Table of 2-byte pointers to dialogue strings (string type from `stringTypes.json`) |
| `"&SpriteString"` | Table of 2-byte pointers to sprite strings (string type from `stringTypes.json`) |
| `"&Code$2"` | Short pointer to code — targeting **bank $02** (see [Phase 6.4](#64-bank-hints-on-pointer-types)) |
| `"&Code$$"` | Short pointer to code — targeting the **current DBR** |
| `"&route-step"` | Table of 2-byte pointers to route-step structs |
| `"&diary-entry"` | Table of 2-byte pointers to diary-entry structs |
| `"@actor-def"` | Table of 3-byte pointers to actor definitions |
| `"@thinker-def"` | Table of 3-byte pointers to thinker definitions |

> The `&`/`@` prefix works with **any** type — primitives, struct names, or string type names from `stringTypes.json`.

### 12.3 Pointer tables in practice

IOG example — a table of pointers to dialogue strings:

```json
"table_08EB8F": { "start": 584591, "end": 584659, "type": "&DialogString" }
```

This tells the engine: "starting at address 584591, read 2-byte pointers until address 584659. Each pointer references a DialogString."

Cross-bank pointer table:

```json
"music_pointer_array": { "start": 117670, "end": 117760, "type": "@Binary" }
```

3-byte pointers to music data across banks.

### 12.4 Getting pointer types right

**Check the code that reads the table:**
- `LDA table,X` where X is doubled → 2-byte (`&`) pointers
- `LDA table,X` followed by bank byte read → 3-byte (`@`) pointers
- `JSR ($xxxx,X)` → 2-byte code pointers (`&Code`)
- `JSL [addr]` → 3-byte code pointers (`@Code`)

**`$&` vs `$@` constraint:**
- A `$&` reference CANNOT cross banks — all code connected by `$&` must stay together
- A `$@` reference CAN cross banks — these create soft dependencies

---

## Phase 13 — Binary Data & Common Bank $01

### 13.1 Binary data regions

Regions of ROM that aren't code, strings, or structured data should be typed as `Binary`. This prevents the engine from trying to disassemble them:

```json
// types.json
{
  "53352": "Binary",
  "61843": "Binary",
  "168464": "Binary",
  "171854": "Binary"
}
```

### 13.2 The common data bank ($01)

In HiROM games, bank $01 (ROM addresses $008000–$00FFFF, file offsets 0–32767) often contains raw binary data — graphics, lookup tables, and non-code resources. This data is accessed via DBR-relative reads with DBR set to $01 (or mirrored banks $81, etc.).

**Mapping bank $01 data:**

1. Identify which code accesses bank $01 data (look for `PHB`/`PLB` sequences or direct `$01:xxxx` references)
2. Map the data regions in `files.json` with appropriate types:

```json
{
  "system": {
    "": {
      "gfx_000000": {"start":0,"end":7168,"type":"BitmapRaw"},
      "radar_icons_001C00": {"start":7168,"end":7680,"type":"BitmapRaw"},
      "radar_layout_001E00": {"start":7680,"end":9088,"type":"Unknown"}
    }
  }
}
```

3. Mark these with the `"upper": true` flag if they're in the upper half of the bank (offsets $8000–$FFFF within the bank):

```json
"will_sprites_1A8000": {"start":1736704,"end":1753088,"type":"BitmapRaw","upper":true}
```

### 13.3 Binary blob handling

For large binary regions where you don't know the internal structure yet:

1. Mark as `"Binary"` in `types.json`
2. The engine will emit them as raw byte arrays in the `.asm` output
3. Revisit later once you understand the access patterns
4. Convert to proper struct types as you identify them

---

## Phase 14 — Game Walkthrough & Single Source of Truth

### 14.1 Why prepare a walkthrough

A game walkthrough serves as the **single source of truth** for game facts — scene names, NPC identities, item names, boss names, and gameplay progression. Without this, agents will invent names and get game lore wrong.

### 14.2 What to include

Create a `docs/walkthrough.md` (or similar) in the baserom repo containing:

1. **Scene inventory** — every scene ID with its human-readable name and area group
2. **NPC catalog** — every named character with their scene(s)
3. **Item catalog** — every collectible with its game name
4. **Boss catalog** — every boss/mini-boss with name, lair scene, and reward
5. **Event progression** — the canonical order of story events
6. **Flag reference** — known event flags with their meaning
7. **Music track list** — BGM names matched to scene usage

### 14.3 Maintaining the walkthrough

The walkthrough should be populated from:
- The game's own text (dialogue strings extracted from the ROM)
- Official game guides or manuals
- Verified community wikis (cross-reference against ROM data)
- Runtime testing in Mesen2

**Never invent game facts.** If you don't know a character's name, leave a placeholder like `[NPC at scene $0A, tile 12,15]` and verify later.

### 14.4 Using scenes.json and groups.json

These files provide the canonical scene catalog:

**scenes.json** — ordered list of scenes:

```json
[
  { "group": "south-cape", "index": 1, "name": "south-cape", "description": "South Cape" },
  { "group": "south-cape", "index": 2, "name": "coastal-cave", "description": "Coastal Cave" },
  { "group": "edward-castle", "index": 10, "name": "edward-castle", "description": "Edward's Castle" }
]
```

**groups.json** — location groupings with prefixes and scene metadata:

```json
{
  "south_cape": {
    "prefix": "sc",
    "scenes": {
      "south_cape": { "id": 1, "description": "South Cape" },
      "coastal_cave": { "id": 2, "description": "Coastal Cave" }
    }
  }
}
```

The `prefix` is used in actor naming: `sc01_fisherman` = South Cape scene 01, fisherman NPC.

---

## Phase 15 — Documentation & Code Comments

### 15.1 In-ASM documentation

Every extracted `.asm` file should have documentation comments following the standards in `curated/gaialabs/code-bank-documentation.md`. The key format uses a header block at the top of each file:

```asm
; South Cape fisherman NPC with the Lola Melody sidequest.
; 
; Multi-state actor: initially fishing (flag $15), then gives the
; teapot item after catching it. After the castle summons, dialog
; changes. Returns in the endgame with Lola Melody when flag $15 is set.
---------------------------------------------
```

### 15.2 Comment standards

**File header (mandatory):** 1–4 lines explaining what the actor/system does in gameplay terms.

**Section separators:** Use `---------------------------------------------` between logical sections.

**Inline comments for non-obvious logic:**

```asm
; Per-frame proximity check: branches to interact loop when player is 
; within range, otherwise returns to wait for next frame.
TownDoorProximityCheck:
    COP [BranchIfPlayerNear] ( #01, &TownDoorInteractLoop )
    RTL 
```

### 15.3 The Three Questions Test

Every documented routine must answer:
1. **When does this execute?** (What calls it? What triggers it?)
2. **What does the player see?** (Visual effect, sound, UI change)
3. **Why does this exist?** (What would break without it?)

### 15.4 Bank-level documentation

For major code banks, create documentation suites following the hub + spokes model:

```
docs/bank02/
├── index.md                  # Hub: overview, memory map, file inventory
├── hardware-and-init.md      # Topic: infrastructure
├── scene-script.md           # Topic: scene bytecode engine
├── player-character.md       # Topic: player state machine
└── player-movement.md        # Topic: movement physics
```

See `curated/gaialabs/code-bank-documentation.md` for complete standards.

---

## Appendix A — blocks.json Part Declaration Formats

### Summary of all supported formats

**1. Flat block (block = single part):**

```json
"block_name": { "start": 32768, "end": 33901, "type": "Code" }
```

**2. Flat block with metadata:**

```json
"block_name": { "start": 32768, "end": 33901, "type": "Code", 
                "scene": "engine", "movable": true }
```

**3. Block with parts (no block-level start/end):**

```json
"block_name": {
  "scene": "engine",
  "parts": {
    "PartA": { "start": 34580, "end": 34934, "type": "Code" },
    "PartB": { "start": 34934, "end": 35865, "type": "Code" }
  }
}
```

**4. Block with parts and movability:**

```json
"block_name": {
  "movable": true,
  "scene": "dark_space",
  "parts": {
    "PartA": { "start": 579496, "end": 579562, "type": "actor-def" },
    "PartB": { "start": 579562, "end": 580506, "type": "Code" }
  }
}
```

**5. Parts with custom ordering:**

```json
"block_name": {
  "parts": {
    "PartA": { "start": 778807, "end": 778956, "type": "actor-def" },
    "PartB": { "start": 783348, "end": 783931, "order": 784046, "type": "DialogString" }
  }
}
```

**6. Mixed contiguous and non-contiguous parts:**

```json
"block_name": {
  "movable": true,
  "scene": "ship_wreck",
  "parts": {
    "main_actor": { "start": 364953, "end": 365652, "type": "actor-def" },
    "helper_code": { "start": 361880, "end": 361990, "order": 364957, "type": "Code" },
    "keyframe_data": { "start": 361990, "end": 362028, "order": 364958, "type": "camera-keyframe" }
  }
}
```

---

## Appendix B — Complete File Inventory (db-us/)

| File | Purpose | Required |
|------|---------|----------|
| `config.json` | ROM header, platform flags, compression, interrupt vectors | Yes |
| `blocks.json` | Code/data block and part definitions | Yes |
| `overrides.json` | Per-address register state (M, X, B) and type corrections | Yes |
| `names.json` | Address → human-readable label mapping | Yes |
| `types.json` | Type overrides for auto-scaffolded pieces | Yes |
| `files.json` | ROM file regions → extraction folders (binary assets) | Yes |
| `fileTypes.json` | File type catalog — extensions, compression defaults, internal types | Yes |
| `copdef.json` | COP opcode → operand layout definitions | If game uses COP |
| `structs.json` | Named struct record layouts | Yes |
| `stringTypes.json` | String type definitions — character maps, delimiters, terminators, embedded commands, dictionaries (type names are NOT hard-coded; all come from this file) | If game has text |
| `labels.json` | Operand transform annotations — tells the engine how to resolve raw operand bytes into named references (see [Phase 8B](#phase-8b--operand-annotations-with-labelsjson)) | Optional |
| `mnemonics.json` | RAM/WRAM symbolic address names | Optional |
| `scenes.json` | Scene ID → name/group mapping | Yes |
| `groups.json` | Location group organization with prefixes | Yes |
| `rewrites.json` | Address rewrite rules for rebuild | Optional |
| `transforms.json` | Post-extraction transforms | Optional |
| `fixups.json` | Patch fixup hooks and mnemonic definitions | Optional |

> ⚠ The `"name"` key in `overrides.json` is **deprecated and non-functional**. Always use `names.json` for address naming.

---

## Appendix C — Validation Checklist

### After each extraction pass

- [ ] No unknown opcodes or garbage instructions in extracted ASM
- [ ] Branch targets resolve to valid code addresses
- [ ] Data tables have correct element sizes
- [ ] String delimiters are recognized
- [ ] Register states (M/X) look correct at function entry points
- [ ] Code doesn't run into data (check boundaries)
- [ ] No auto-generated names remain for major labeled addresses

### After completing blocks.json mapping

- [ ] Every code bank has at least one block entry
- [ ] Scene actors have correct scene assignments
- [ ] Movable blocks are marked (`movable: true`)
- [ ] Bank-locked code is NOT marked movable
- [ ] Related parts are grouped in the same block
- [ ] Non-contiguous parts use `order` fields correctly

### After completing overrides

- [ ] All indirect jump targets have register state overrides
- [ ] COP handler entry points have correct M/X states
- [ ] DBR overrides are set for code that changes the data bank
- [ ] No cascading register state errors remain

### Before final rebuild

- [ ] Rebuild produces byte-perfect ROM (checksum match)
- [ ] ROM boots in Mesen2
- [ ] All scenes are playable (spot-check major areas)
- [ ] No visual glitches from incorrect register states
- [ ] All dialogue strings render correctly
- [ ] Music plays correctly in all scenes

### Documentation completeness

- [ ] Every ASM file has a header comment
- [ ] Major routines have the Three Questions Test answered
- [ ] Named labels match `names.json` (no stale auto-names)
- [ ] Walkthrough covers all scenes and NPCs
- [ ] Scene catalog matches `scenes.json` / `groups.json`

---

## Quick Reference: Mapping Priority Order

When starting a brand new ROM, map in this order:

1. **ROM header** → `config.json`
2. **File type catalog** → `fileTypes.json` (define all asset types and extensions)
3. **Interrupt vectors** → `names.json` first entries
4. **Reset/init code** → first `blocks.json` entries
5. **Main loop** → identify the frame update cycle
6. **COP dispatch** (if applicable) → `copdef.json` + dispatch table block
7. **String types** → trace text renderers, define all string types in `stringTypes.json` (character maps, commands, dictionaries)
8. **Binary asset identification** → trace DMA code, find graphics/palettes/music/tilemaps
9. **Asset mapping** → `files.json` (catalog all binary assets with start/end/type/compression)
10. **Scene loading** → scene meta struct definitions
11. **Scene spawn tables** → struct definitions + type overrides
12. **Player code** → player character block(s)
13. **System routines** → DMA, HDMA, SPC transfer, save system
14. **Scene actors** — one location at a time, following game progression
15. **Data tables** → lookup tables, configuration data
16. **Unused code** → debug stubs, unreferenced routines
17. **Documentation** → walkthrough, bank docs, inline comments

Each step is iterative. Extract after every significant metadata change to verify correctness before moving on.

---

## See Also

- `assembler-syntax.md` — Label prefix rules, directive syntax
- `reference-model.md` — Database triad details
- `code-bank-documentation.md` — Documentation standards
- `extraction-rebuild.md` — CLI workflow
- `gaia-iog-baserom/docs/cop/index.md` — IOG COP reference (family docs)
- `corpus/games/iog/project-docs/actor-organization-analysis.md` — IOG code organization
- [65C816 Opcodes by Bruce Clark](https://6502.org/tutorials/65c816opcodes.html) — CPU reference
