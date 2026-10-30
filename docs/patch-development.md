# Patch Development Guide

Comprehensive reference for writing `.patch.asm` files that modify SNES ROMs using the `@gaialabs/core` rebuild engine.

## Overview

A **patch file** (`.patch.asm`) is an assembly source file that modifies an existing ROM without touching the extracted base code. Patches can:

- **Replace** existing code/data parts by matching their label names
- **Insert** new code/data before or after existing parts
- **Add** entirely new standalone code blocks to the ROM

During rebuild, the engine assembles all patches alongside the extracted ROM source, merges patch parts into the base code's block structure, and produces a new ROM binary.

```
extract → edit .asm / create patches → rebuild → test in emulator
```

---

## File Layering and Replacement

The rebuild system applies files in layers: baserom files → base project files → selected modules → manual files. When a file in a later layer shares the **same name** as a file from an earlier layer, it **replaces the earlier file entirely**.

- **Assembly/patch files** (`.asm`, `.patch.asm`): The `textData` of the existing file is overwritten with the new file's content. The file is then re-assembled from the new source.
- **Binary files** (graphics, sound, etc.): The `rawData` and `size` of the existing file are replaced.

This means a module or patch layer can completely override an extracted block, a baserom patch, or even another module's file simply by using the same filename. The engine does not merge file contents — it is a full replacement.

```
Layer 1 (baserom):  patches/Utils.patch.asm  ← original
Layer 2 (module):   patches/Utils.patch.asm  ← replaces Layer 1 entirely
```

New files (names that don't match any existing file) are appended to the build. Patch-type files are additionally tracked in the patch list for label matching.

---

## Patch File Structure

A patch file has two layers:

1. **Preamble** — directives (`?`), tags (`!`), and comments processed during parsing but not emitted as bytes
2. **Parts** — labeled code/data blocks that get merged into the ROM

```asm
; =============================================
; Preamble: directives, tags, comments
; =============================================

?BANK 03

?INCLUDE 'camera_scroll_controller'
?INCLUDE 'sprite_composition'

!WS_EXTRA                       0040
!WS_RIGHT_EDGE                  0140

; =============================================
; Topmost content (new standalone blocks)
; Everything BEFORE the first override label
; =============================================

my_new_routine {
    LDA #$0001
    RTL
}

; =============================================
; Rewrite content (override labels)
; Everything FROM the first override label onwards
; =============================================

ExistingLabel! {
    ; Replaces the original ExistingLabel part
    LDA #$0002
    RTS
}
```

---

## Directives (`?` prefix)

Directives are processed by the assembler during parsing. They control bank placement, dependency tracking, and conditional compilation. All directives are consumed during parsing and do not produce output bytes.

### `?BANK` — ROM Bank Assignment

```asm
?BANK 03
```

Declares which ROM bank the **topmost content** (unlabeled code at the top of the file) should reside in after rebuild. The value is a **hexadecimal** bank number.

**Behavior:**

- If `?BANK` is present, the patch file's standalone content is constrained to the specified bank during ROM layout. The layout engine will only place this file in a page belonging to that bank.
- If `?BANK` is **absent**, the topmost content will be placed in a size-calculated position — the layout engine finds the best-fit page anywhere in the ROM's upper address space.
- `?BANK` does **not** affect rewrite/insert parts. Those parts are spliced into their target block's file, which has its own bank assignment from extraction.

**When to use:** Use `?BANK` when your new code must reside in a specific bank (e.g., for same-bank `$&` references from existing code, or hardware constraints like DMA source banks).

### `?INCLUDE` — Block References (Informational)

```asm
?INCLUDE 'camera_scroll_controller'
?INCLUDE 'sprite_composition'
```

Declares which extracted blocks this patch references. The value is a block name (the name from `blocks.json`) wrapped in single quotes.

**Behavior:**

- `?INCLUDE` was historically used to generate scoped address lookup tables for linking. In the current engine, **all label references are global** — the assembler maintains a single `masterLookup` table across all files.
- `?INCLUDE` is now **informational only** and is **optional**. It serves as documentation for developers and agents reading the patch.
- The disassembler generates `?INCLUDE` lines automatically during extraction for reference purposes.

### `?IF` / `?ELSEIF` / `?ELSE` / `?ENDIF` — Conditional Assembly

```asm
?IF 'title-demo'
    LDA #$0001       ; only assembled when title-demo module is active
?ELSEIF 'alt-intro'
    LDA #$0002       ; only assembled when alt-intro module is active
?ELSE
    LDA #$0003       ; assembled when neither module is active
?ENDIF
```

Conditional blocks include or exclude assembly content based on which **modules** and **file names** are active during the rebuild.

**Condition matching:** A condition name matches if it appears in:
- The **modules list** passed to the rebuild command
- Any **chunk file name** in the current build

**Rules:**
- `?IF` must have a condition; `?ELSE` must not
- Only one branch executes — the first matching `?IF`/`?ELSEIF`, or `?ELSE` if none match
- Cannot nest `?IF` blocks (a second `?IF` before `?ENDIF` throws an error)
- Lines inside a failing condition are silently discarded

---

## Tags (`!` prefix)

Tags define named constants — hex address values or magic numbers that can be referenced by name in assembly code. They are declared at the top of the file as part of the preamble.

### Declaration Syntax

```asm
!tag_name                       HHHH
```

- The `!` prefix marks the line as a tag declaration (not to be confused with the `!` label suffix)
- The tag name is followed by whitespace and a **hex value**
- Values should be **1 to 3 bytes** (2, 4, or 6 hex characters) — e.g., `E6`, `065A`, `7E0000`
- **No address markers** (`$`, `#`, `&`, `@`) in the value — just raw hex digits

### Multiple Tags Per Line

Multiple name/value pairs can appear on a single line separated by whitespace:

```asm
!token 00E6  joypad_mask_std 065A
```

### Usage in Code

When a tag name appears in an instruction operand, the assembler replaces it with the defined hex value:

```asm
!token                          00E6
!joypad_mask_std                065A

; ...

LDA $token           ; assembles as LDA $00E6
LDA $joypad_mask_std ; assembles as LDA $065A
```

### Resolution Priority

Tags are **file-local** — they exist only within the patch file that declares them. During operand parsing, the assembler resolves names in this order:

1. **File-local tags** (`assembler.tags[name]`) — highest priority
2. **Global mnemonics** (`dbRoot.mnemonicsLookup[name]`) — from the game's `mnemonics.json`

File-local tags override global mnemonics of the same name.

### Mnemonics (Auto-Available Tags)

Two sources of pre-defined mnemonics are available without explicit tag declarations:

**`mnemonics.json`** (per-game, in the baserom's `us/` or `db-us/` folder):
Maps WRAM addresses and hardware registers to human-readable names. Format: `{ "decimal_address": "symbol_name" }`. These are loaded into `DbRoot.mnemonicsLookup` and available in all assembly files automatically.

```json
{ "1626": "joypadMaskStd", "512": "deathFlag" }
```

**`vectors.json`** (platform-level, in `gaia-core/snes/`):
Maps SNES hardware register addresses to standard names (e.g., `INIDISP`, `VMADDL`). These are defined at the platform level but are **not** automatically loaded into the assembler's mnemonic lookup during rebuild. To use SNES register names in patches, declare them as file-local tags:

```asm
!VMADDL                         2116
!A1T0L                          4302
```

**Disassembler output:** The disassembler automatically generates both `?INCLUDE` and `!tag` declarations in extracted `.asm` files for all referenced blocks and mnemonics. These serve as documentation and can be copied into patch files, but are optional since references are resolved globally.

---

## Label Matching and Part Placement

The core mechanism of patching is **label matching** — patch labels are compared against the global label table built from all extracted ROM parts, and matching determines how patch content is merged.

### Global Label Table (`masterLookup`)

Before patch application, the engine builds a global lookup table mapping every label (uppercased) to its `AsmBlock`. This includes all parts from all extracted blocks and any standalone patch content.

**References are global.** When a label appears as `block_name.part_name` in disassembler output, this is for documentation only. The block prefix before the `.` is ignored during lookup — only the part name is matched. All labels share a single global namespace.

```asm
; Disassembler may output: camera_scroll_controller.code_00EAF0
; But the lookup key is just: CODE_00EAF0
; The block prefix "camera_scroll_controller" is stripped and ignored
```

### Label Suffixes (Override Characters)

Labels in patch files use **override suffixes** to declare rewrite operations. Every operation has a **symbol** form and an equivalent **verb** form — use whichever reads better; they are interchangeable. These suffixes are the boundary between topmost content and rewrite content — the first label with an override suffix marks where rewrite processing begins.

| Operation | Symbol | Verb | Behavior |
|-----------|--------|------|----------|
| **Replace** block | `Label!` | `Label.replace` | **Replace** the matched label in-place. Works for any label — top-level block labels, internal colon labels, or nested labels. |
| Insert **before** | `Label-` | `Label.before` | Splice the content in as a **separate part before** the matched part. Always a pure splice, regardless of delimiters. |
| Insert **after** | `Label+` | `Label.after` | Splice the content in as a **separate part after** the matched part. Always a pure splice, regardless of delimiters. |
| Merge into **head** | `Label-=` | `Label.prepend` | **Merge** the content into the **start** of the matched part. The target stays in place and the replacement part is consumed. Delimiters are preserved (see [Head/Tail Merge](#headtail-merge---and-)). |
| Merge into **tail** | `Label+=` | `Label.append` | **Merge** the content onto the **end** of the matched part. The target stays in place and the replacement part is consumed. Delimiters are preserved. |
| Replace **bytes** | `Label#[hex]` | `Label.at([hex])` | **Replace bytes** inside the matched part. The block's content overwrites `size(block)` bytes of the target starting at the hex byte offset (no offset = `0`). **Error** if the range runs past the end of the target part. |
| *(none, after override)* | `Label` | — | **Chained insert** at the current cursor position in the target file. |

**How to read the symbols:** the sign is the *direction* (`-` toward the start, `+` toward the end). A bare sign adds a **new part beside** the block; adding `=` (like `+=` in most languages) merges **into** the block itself. `!` is "overwrite", and `#` is "number/offset".

```asm
Label! { ... }          ; same as  Label.replace { ... }
Label- { ... }          ;          Label.before { ... }
Label+ { ... }          ;          Label.after { ... }
Label-= [ ... ]         ;          Label.prepend [ ... ]
Label+= [ ... ]         ;          Label.append [ ... ]
Label#1F { ... }        ;          Label.at(1F) { ... }
Label# { ... }          ;          Label.at { ... }          (offset 0)
```

Verbs are case-insensitive and must be the text after the **last `.`** of the label (`Label.at(1F)` is the only verb that takes an argument, and it is hex). Both forms work with the colon one-liner style (`Label+=: entry < ... >`, `Label.append: entry < ... >`).

**All override suffixes require a match.** There are no silent rewrites — if an override label does not match any existing part in the codebase, the build fails with an error.

**Warning for `+` / `-` on delimited blocks:** splicing a part after a block that ends with a delimiter (e.g. a `]`-terminated struct list) puts your entries *after the list terminator*, which is almost never intended. The build prints a warning suggesting `+=` / `-=` when this happens.

**Labels without suffixes** are never treated as rewrites. They are either:
- **Topmost content** — if they appear before the first override label
- **Chained inserts** — if they appear after an override label has established a target file

**Duplicate label protection:** During label table construction, any non-override label that conflicts with an existing label name throws an error. Override labels (any symbol or verb form above) are allowed to conflict because they are expected to target existing parts.

### Matching Algorithm

The patch application algorithm (`RomProcessor.applyPatches`) processes each patch file in two phases:

**Phase 1 — Separate topmost from rewrites:**

The engine scans the patch's parts list from the beginning, looking for the first label that carries an override suffix (symbol or verb form). Everything before that boundary is **topmost content** and stays in the patch file. Everything from that point onwards is extracted into a **rewrite list** for processing.

```
Patch parts: [A] [B] [C!] [D] [E-] [F]
                        ↑ first override char
Topmost:     [A] [B]           ← stays in patch file
Rewrites:    [C!] [D] [E-] [F] ← processed below
```

**Phase 2 — Process rewrites:**

```
file = patch, dstIx = -1

For each part in the rewrite list:

  If label has an override suffix (! - + -= += #  /  .replace .before .after .prepend .append .at):
    1. Strip suffix, lookup label in masterLookup (case-insensitive)
    2. If NO MATCH → THROW ERROR (all overrides require a match)
    3. Set file = matched part's file, dstIx = matched position

    If replace (! / .replace):
      → REPLACE the matched part in-place
      → Update masterLookup to point to the new part

    If bytes (#[hex] / .at([hex])):
      → REPLACE BYTES inside the matched part (see "Byte Replacement" below)
      → The matched part stays in place; the new part's objects are moved into it

    If head (-= / .prepend) or tail (+= / .append):
      → MERGE the new part's objects into the matched part's object list
           head inserts at the beginning, tail inserts at the end
      → Trailing delimiters are detached and a single one is re-attached at the end
      → The new part is consumed (never placed in a file)
      → dstIx: after the match for tail, at the match for head (chained inserts follow)

    If before (- / .before) or after (+ / .after):
      → SPLICE as a new part before / after the match
        (no delimiter handling — the target is never modified;
         a warning is printed if the target ends with a delimiter)

  Else (no override suffix):
    → INSERT at advancing dstIx cursor (chained insert)
```

### Head/Tail Merge (`-=` and `+=`)

`Label-=` (`Label.prepend`) and `Label+=` (`Label.append`) merge new content into the **start** or **end** of an existing part, which is the way to extend data tables and struct lists (anything terminated by a **delimiter**, such as the closing `]` of an array/struct block) without replacing the whole part. The target part stays in place; the patch's replacement part is consumed and takes no further part in processing.

> **`+` / `-` never merge.** They always splice the new content in as a separate part before/after the target, even when the target ends with a delimiter. Appending a `+` block to a delimited list therefore leaves the list's terminator *before* your new entries — use `+=` instead. The build warns when this happens.

**Delimiter handling.** A delimiter is the terminating Byte/Word that `]` emits for a struct list. A delimiter is only ever valid at the very end of a list, so for both operations:

1. The trailing delimiter (if any) is detached from the target and from the replacement.
2. The replacement's objects are inserted at the head (`-=`) or tail (`+=`) of the target.
3. If either side had a delimiter, exactly one is re-attached at the end of the target:
   - **`+=`**: the replacement's delimiter wins; otherwise the target's is restored.
   - **`-=`**: the target's delimiter wins; otherwise the replacement's is attached (so a delimiter written in the replacement is preserved even when the target had none).
4. If neither side has a delimiter the objects are simply concatenated.

The target's size is updated by the bytes actually added or removed (delimiter sizes are measured, so Byte and Word delimiters are both handled).

**Cursor.** Chained inserts that follow a `+=` override land after the target part; those following a `-=` override land before it.

**Works on non-delimited blocks too.** With no delimiter on either side the objects are simply concatenated onto the head or tail of the target.

**Example — appending entries to a thinker spawn list:**

```asm
; Original extracted part:
thinker_spawn_0CEB2F [
  thinker-spawn < #00, @some_thinker >
]

; Patch appends new entries into the same list:
thinker_spawn_0CEB2F+= [
  thinker-spawn < #74, @ambient_palette_cycler >
  thinker-spawn < #00, @ending_comet_dma_setup >
  thinker-spawn < #24, @scanline_band_hdma_thinker >
]

; Result after merge:
thinker_spawn_0CEB2F [
  thinker-spawn < #00, @some_thinker >
  thinker-spawn < #74, @ambient_palette_cycler >
  thinker-spawn < #00, @ending_comet_dma_setup >
  thinker-spawn < #24, @scanline_band_hdma_thinker >
]
```

**Example — prepending an entry (`-=`) and adding a single entry in colon form (`+=:`), with the verb equivalents:**

```asm
thinker_spawn_0CEB30-= [
  thinker-spawn < #11, @IrisCircleEffect >
]

thinker_spawn_0CEB30+=: thinker-spawn < #22, @IrisCircleEffect >

; Identical, written with verbs:
thinker_spawn_0CEB30.prepend [
  thinker-spawn < #11, @IrisCircleEffect >
]

thinker_spawn_0CEB30.append: thinker-spawn < #22, @IrisCircleEffect >
```

**Example — inserting code before a matched part:**

```asm
; Insert instructions before code_068114 (pure splice as a separate part)
code_068114- {
    LDA #$4000
    TSB $09EC
    COP [4F] ( $7F0200, #$7800, #$0100 )
}
```

### Byte Replacement (`#` / `.at`)

`Label#[hex] { ... }` (verb form: `Label.at([hex]) { ... }`) overwrites a byte range *inside* an existing part without replacing the whole part. The range starts `hex` bytes after the start of `Label` (omit the hex for offset `0`) and is exactly as long as the replacement block's assembled size.

```asm
; Original:  TXY / LDX $0004, Y / LDA $7F0014, X ...
;            offset 0: TXY (1 byte), offsets 1-3: LDX $0004, Y (3 bytes)

; Replace the LDX (offset 1, 3 bytes) with NOPs — size unchanged:
CopySiblingFollowState#1 {
    NOP
    NOP
    NOP
}

; Replace the first byte (offset omitted = 0):
CopySiblingFollowState# { NOP }

; Verb form of the first example:
CopySiblingFollowState.at(1) { NOP NOP NOP }
```

Rules:

- **Offsets are hex**, relative to the start of the matched part (not the file).
- **Crossing data is swallowed whole.** Part contents are stored as discrete objects (instructions, words, pointers, strings). Any object only partly covered by `[offset, offset + size)` is removed entirely and replaced by the new content, which is placed where the first removed object began. If the range is not aligned to object boundaries the target part's size changes by `newSize - removedBytes` (a 1-byte `#2` replacement over a 3-byte instruction at offset 1 shrinks the part by 2).
- **The range must fit in the part.** `offset + size` beyond the part's end is a build error — `#` never spills into the next label. For parts with sub-labels, target the sub-label itself.
- **The target part is edited in place**, so references to it stay valid and `masterLookup` is unchanged. Multiple `#` overrides on the same label apply in patch order; later offsets are measured against the already-modified part.
- **Chained inserts** following a `#` override are placed after the target part, same as `!`.
- The replacement block's content can contain label references (`$&label`, `$@label`) — they resolve at write time like any other code.
- Unlike `!`, no sub-label orphaning occurs: untouched bytes (and any sub-labels) are left as they were. Prefer `#` over `!` for small in-place edits.

### Topmost Content (Standalone Blocks)

Code that appears **before the first override label** (any override suffix, symbol or verb) in the patch file remains in the patch file as **topmost content**. This content becomes a new standalone ROM chunk placed by the layout engine.

**Key rule:** New code that should exist as a single standalone unit (not patched into other blocks) **must** be declared at the top of the file, before any override labels. Once the engine encounters a label with an override suffix, all remaining parts are treated as rewrite/insert operations.

```asm
?BANK 03

; === TOPMOST CONTENT ===
; This stays in the patch file as a new ROM chunk
; It will be placed by the layout engine (in bank 03 per ?BANK)

my_new_subroutine {
    LDA #$0001
    STA $0200
    RTL
}

helper_function {
    PHB
    ; ...
    PLB
    RTS
}

; === REWRITE CONTENT ===
; These match existing parts and get spliced into their target files

ExistingLabel! {
    ; This replaces the original ExistingLabel part
    JSL $@my_new_subroutine
    RTS
}
```

**Visibility in layout output:** Patches that have topmost content appear in the block placement table during rebuild (the console log showing `0xXXXXXX: filename`). Patches with no topmost content — where every part was matched and spliced into existing files — do not appear in placement output since there is nothing to place.

### Chained Inserts

After an override label establishes a target file and cursor position (`dstIx`), subsequent parts **without override suffixes** are inserted sequentially at the advancing cursor position. This allows inserting multiple new parts into an existing block:

```asm
; Override match — sets the target file and cursor position
ExistingLabel! {
    ; Replace existing code
    JSR $&new_helper_a
    JSR $&new_helper_b
    RTS
}

; These have no override suffix, so they INSERT after ExistingLabel
new_helper_a {
    LDA #$0001
    RTS
}

new_helper_b {
    LDA #$0002
    RTS
}
```

A subsequent override label (any symbol or verb form) resets the target file and cursor to the new match location. Non-override labels continue inserting at whatever cursor position was last established.

### Size and Rebase Rules

After patch application, the engine recalculates file sizes and rebases block locations:

- **Size calculation** sums all part sizes within a file. It stops at the **second unlabeled block** — only one leading unlabeled region is valid per file.
- **Rebase** assigns sequential locations to parts within each file starting from the file's assigned ROM location. It also stops at the second unlabeled block.

This means a file structure is conceptually: `[topmost-unlabeled] [label1] [label2] ...`

---

## Address References

Patch code references other parts using address prefix sigils that encode linkage size:

| Prefix | Size | Meaning | Use When |
|--------|------|---------|----------|
| `$&label` | 2 bytes | Short offset (word only) | Target is in the **same ROM bank** |
| `$@label` | 3 bytes | Long address (word + bank byte) | Target may be in a **different bank** |
| `#$&label` | 2 bytes | Immediate short pointer | Pointer constant, same bank |
| `#$@label` | 3 bytes | Immediate long pointer | Pointer constant, cross-bank |

**Critical:** Do not mix `$&` and `$@`. A 2-byte `$&` reference cannot reach a label in another bank. A 3-byte `$@` reference in a word-sized slot misaligns data.

**Resolution:** At write time, the engine resolves label names to ROM addresses via the global `masterLookup`. Labels can include offset suffixes (`+NN`, `-NN`) and string marker offsets (`+M`). The block prefix in `block.part` references is stripped — only the part name is used for lookup.

---

## Line Continuations

Any line ending with `\` is automatically concatenated with the following line before any other processing occurs. This allows long statements — especially string literals — to be split across multiple lines for readability.

```asm
; A multi-page dialogue string split across lines with \
string_05A5F1 `[DF4][TPL:2]Ha ha ha! You're finally[N]awake, I see! You must have[N]been in a pretty deep sleep.[FIN]\
While you were sleeping[N]away the day, we finished[N]unpacking and settling in.[FIN]\
Now come on, get up and[N]say hello and thank you to[N][PAL:2]Nagisa[PAL:0].[FIN]\
She helped me unpack and[N]even took care of your[N]share.[END]`
```

The assembler joins these four lines into a single logical line before parsing the string. Without `\`, each physical line would be treated as a separate statement.

This is especially common in Robotrek chapter patches where dialogue strings contain multiple pages (delimited by `[FIN]`) that would be unwieldy as a single physical line:

```asm
consolestring_debug_main ~[BOR:0][PAL:4][BOX:A,1,C4][BOX:E,1,DC]\
[POS:106]DEBUG MENU[POS:11E]MAP[PAL:8][NUM:3,05A8][PAL:4] X[PAL:8][NUM:2,0BB2][PAL:4]\
[BOX:1A,10,184]\
[TBL:@highlight_palette_table+6,BD2] Fast Travel  [N]\
[TBL:@highlight_palette_table+4,BD2] Cheats       [N]\
[TBL:@highlight_palette_table+2,BD2] Inventory    [N]\
[TBL:@highlight_palette_table,BD2] Flags        [N]\
[N][N][N][PAL:4] A Select   B Cancel[BOR:8]~
```

**Note:** Line continuations are processed before comment stripping. A `\` at the end of a line always triggers concatenation, even if it appears inside what might otherwise look like a comment context.

---

## Comments

Three comment styles are supported. All are stripped during assembly:

```asm
-- Double-dash comment
;  Semicolon comment
// Double-slash comment
```

---

## Conditional Assembly in Patches

Conditional blocks allow a single patch file to produce different output depending on which modules are enabled:

```asm
?IF 'widescreen'
    ; Widescreen-specific camera bounds
    CMP #$0180
?ELSE
    ; Standard 256px camera bounds
    CMP #$0100
?ENDIF
```

The condition name is matched against the list of active modules and all chunk file names in the current build. This allows patches to adapt to the presence or absence of other patches.

---

## Complete Example: Widescreen Patch

The IOG Widescreen patch (`gaia-iog-baserom/baserom/patches/Widescreen.patch.asm`) demonstrates all major patch concepts. Here is an annotated breakdown:

### Preamble

```asm
; Header comments describing the patch purpose
; ...

?INCLUDE 'camera_scroll_controller'
?INCLUDE 'camera_tilemap'
?INCLUDE 'sprite_composition'
```

No `?BANK` directive — the patch's standalone content is placed by the layout engine in any available upper-bank page.

Three `?INCLUDE` declarations document which extracted blocks this patch references. These are informational only.

### Tag Constants

```asm
!WS_EXTRA                       0040
!WS_RIGHT_EDGE                  0140
!WS_MULTI_WIDTH                 0180
!WS_CULL_WIDTH                  0180
!WS_OAM_BIAS                    0040
!WS_OAM_CULL                    01D0
!WS_OAM_UNBIAS                  0050
!WS_PREFETCH_RIGHT              0140
!WS_PREFETCH_LEFT               FFC0
!WS_RIGHT_MARGIN_THRESH         00C1
```

All values are 2-byte hex (4 digits), no `$` prefix. Used throughout the patch as `#$WS_EXTRA`, `#$WS_CULL_WIDTH`, etc.

### Force-Rewrite Parts (`!` suffix)

The patch replaces several existing parts with widescreen-aware versions:

```asm
code_00EAF0! {
    ; Camera bounds override — replaces the original camera targeting code
    LDA #$1000
    TSB $12
    COP [SetEntryContinue]
    ; ... widescreen camera logic using !WS_EXTRA, !WS_MULTI_WIDTH ...
    RTL
}

CameraFullRefresh! {
    ; Tilemap refresh — replaces the original full-screen refresh
    ; Starts 64px earlier to fill widescreen left margin
    ; ...
    RTL
}

UpdateScrollColumn! {
    ; Column pre-fetch — replaces original with widescreen edge offsets
    LDA #$WS_PREFETCH_LEFT
    ; ...
    RTS
}
```

Each `!` suffix means "this label **must** exist in the extracted ROM — error if not found."

### Chained Insert (no suffix, after an override)

```asm
BlankScrollColumn {
    ; Brand new subroutine — does not match any existing label
    ; Fills nametable columns with blank tiles for widescreen margins
    PHX
    ; ...
    PLX
    RTS
}
```

`BlankScrollColumn` has no override suffix and appears after `code_00EAF0!` (which matched and established a target file and cursor position). Since it follows an override label, it is treated as a **chained insert** — spliced into the target file immediately after the previously matched/inserted position. This places it alongside the camera code it supports.

### Inline Sub-Labels

Within a rewrite block, sub-labels with `:` suffixes create internal branch targets:

```asm
code_00EAF0! {
    ; ...
    BEQ ws_cam_active

  ws_cam_active:
    PHD
    ; ...
    BCS ws_cam_x_multi

  ws_cam_x_multi:
    ; ...
}
```

**Any label can be overridden with `!`.** This includes top-level `{ }` block labels, internal colon labels, and labels at any depth. There is no parent/child distinction for override matching — the `!` suffix performs a flat lookup against all labels in the codebase.

### Flat Label Namespace — Braces Are Cosmetic

**Critical concept:** The assembler uses a **flat label namespace**. Every label — whether declared with `{`, `:`, `[`, or `|` — creates a **separate `AsmBlock`** pushed onto a flat array. Braces `{ }` are purely cosmetic grouping; they do NOT create scoping or nesting.

```asm
; This extracted code creates THREE separate AsmBlocks:
UseItemTab {                      ; ← AsmBlock 1: "UseItemTab"
    LDA #$0004
    STA $bg1ConfigMode
    ; ...setup code...
    BPL UseItemRefreshCursor
    STZ $1A

  UseItemRefreshCursor:                    ; ← AsmBlock 2: "UseItemRefreshCursor"
    JSR $&PositionEquipCursor
    COP [SetEntryHereAndYield]
    COP [BranchIfPressed] ( #$0080, &UseItemConfirm )
    RTL
}                                 ; ← cosmetic close, no effect on blocks
```

### Override Replaces Exactly One Block

`Label!` replaces **exactly one `AsmBlock`** — the one matching that label name. Internal colon labels (sub-labels) are separate blocks that **persist unchanged** after the override:

```
Original parts list:  [UseItemTab] [UseItemRefreshCursor] [UseItemCursorUp] ...

Override: UseItemTab! { ...new code... }

Result parts list:    [UseItemTab*] [UseItemRefreshCursor] [UseItemCursorUp] ...
                       ↑ replaced    ↑ UNCHANGED   ↑ UNCHANGED
```

**Sub-label orphaning hazard:** If you override a parent block but forget to override its sub-labels, the sub-labels remain with their original code. This can cause:
- Duplicate code (original sub-label code persists alongside override)
- Stale mask values (sub-label still has pre-transform constants)
- Unreachable code waste (nobody branches to the orphaned sub-label)

**Example — correct override with sub-labels:**
```asm
; Override the parent block
PsychoSliderChargeTick! {
    LDA $joypadCurrent
    BIT #$0008
    BEQ loc_02C212        ; ← branch to overridden sub-label
    LDA $26
    SEC
    SBC #$0001
    STA $26
}

; MUST also override sub-labels or they persist with original code
loc_02C202! {
    NOP                   ; filler — falls through to loc_02C212
}

loc_02C212! {
    LDA $joypadCurrent
    AND #$0008
    TSB $joypadHeld
    RTS
}
```

### When to Use Transforms Instead of Overrides

When the only change to a block is a **constant value** (e.g., a button mask in a COP call), prefer **`transforms.json`** over label overrides. Transforms apply regex replacements to the extracted `.asm` text during extraction, avoiding all sub-label issues. See [Transforms vs Overrides](#transforms-vs-overrides) below.

### Override Example — Internal Label

To override just an internal colon label within a larger block:

```asm
; Original extracted code:
DiaryStartJourney {
    JSR $&DiaryMenuClearVram
    ; ...setup code...

  DiaryStartSlotLoop:
    COP [SetEntryHereAndYield]
    COP [BranchIfPressed] ( #$8000, &DiaryStartCancel )
    RTL
}

; Patch — overrides only the DiaryStartSlotLoop block:
DiaryStartSlotLoop! {
    COP [SetEntryHereAndYield]
    COP [BranchIfPressed] ( #$0020, &DiaryStartCancel )
    RTL
}
```

Since `DiaryStartSlotLoop` has no sub-labels of its own, this is a clean replacement.

### Cross-Bank References

```asm
JSL $@system_init.UploadCgramPalette  ; 3-byte far call (cross-bank)
JSR $&RenderColumnStrip                  ; 2-byte short call (same bank)
JSR $&BlankScrollColumn                ; 2-byte short call (same bank)
JSR $&DmaColumnStrip               ; 2-byte short call (same bank)
```

`$@` for cross-bank calls, `$&` for same-bank calls. The `system_init.` prefix is documentation only — the engine looks up `UPLOADCGRAMPALETTE` in the global label table.

---

## Example: Small Feature Patch (RunButton)

A minimal patch that adds a run button feature:

```asm
?BANK 03

?INCLUDE 'sFA_diary_menu'

---------------------------------

run_button_main:
  LDA $09AA
  BEQ run_button_end
  ; ... button detection logic ...
  RTL

run_button_end:
  RTL

--------------------------------------

; Rewrite an existing label to hook in the new button mapping
loc_0BE695! {
    LDA #$0040
    STA $0DB0
    ; ... modified button configuration ...
}
```

- `?BANK 03` constrains the topmost code (`run_button_main`) to bank 3
- The `:` suffix on `run_button_main:` creates the label inline
- `loc_0BE695!` rewrites an existing function in the extracted code
- Dashed lines (`------`) are visual separators — treated as comments

---

## Example: Utility Patch (Utils)

A large utility patch demonstrating multiple features:

```asm
?BANK 03

?INCLUDE 'chunk_028000'
?INCLUDE 'chunk_038000'
?INCLUDE 'system_strings'

!token                          00E6
!joypad_mask_std                065A
!camera_offset_x                06D6
!VMADDL                         2116
!A1T0L                          4302

---------------------------------------------------------

; Topmost content: new routine
my_helper {
    JSL @SomeRoutine
    RTS
}

---------------------------------------------------------

; Rewrites of existing labels follow...
```

- Multiple `?INCLUDE` declarations for documentation
- Hardware register tags (`!VMADDL`, `!A1T0L`) declared locally
- `my_helper` is topmost content that becomes a new ROM chunk in bank 03
- Rewrite labels below reference the new topmost code via `$@`
- For per-frame hooks that several patches share, prefer a self-registering chain (a head/tail pair in a plain `.asm` file that each patch extends with `Head+ { JSL $@stub }`) over a hard-wired call list — see `gaia-iog-baserom/baserom/player-input/player_input_core.asm`

---

## Patch Development Workflow

### 1. Identify Target Code

Use the extracted `.asm` files to find the code you want to modify. The disassembler output includes `?INCLUDE` and `!tag` declarations you can copy.

### 2. Create the Patch File

Create a new `.patch.asm` file in the `baserom/patches/` directory:

```asm
; MyCoolPatch.patch.asm

?BANK 03                          ; optional: bank constraint for topmost code

?INCLUDE 'target_block'           ; optional: document referenced blocks

!my_constant                 0040  ; optional: named constants

; === TOPMOST CONTENT (before any override labels) ===
; New standalone code placed as its own ROM chunk
my_new_function {
    ; ...
    RTL
}

; === REWRITE CONTENT (override labels and chained inserts) ===
; The first ! suffix marks the boundary
existing_function! {
    ; Replaces the original
    JSL $@my_new_function
    ; ...
    RTS
}

; Chained insert — placed after existing_function in the target file
my_helper {
    ; New code inserted into the same block
    RTS
}
```

### 3. Rebuild and Test

```bash
npm run rebuild
# Test in Mesen2 emulator
```

The rebuild will:
1. Parse all patches alongside extracted code
2. Build the global label table
3. Apply patch rewrites and inserts
4. Calculate sizes and assign ROM locations
5. Write the final ROM binary

### 4. Debugging Patch Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| `Duplicate label in file: X` | A non-override label conflicts with an existing label | Rename the label, or add a `!` suffix if you intend to replace it |
| `Patch X contains a rewrite that does not exist: Y` | Override suffix (`!`, `+`, `-`, `+=`, `-=`, `#`, or a `.verb` form) but label not found | Check spelling, verify the target part exists in extracted code |
| Bank overflow / wrong address | `$&` reference to a different bank | Change to `$@` for cross-bank, or use `?BANK` to colocate |
| Patch not appearing in output | All parts were rewrite/insert, no topmost content | Expected behavior — patch content lives inside target blocks |
| Code assembled at wrong location | Missing `?BANK` for bank-sensitive code | Add `?BANK XX` directive |
| New code ended up as rewrite | Label unintentionally matches existing part | Move new code above the first override label (topmost section) |

---

## Reference Summary

### File Structure

```
┌─────────────────────────────────────────────┐
│ ; Comments                                   │
│ ?BANK XX               (optional)            │
│ ?INCLUDE 'block_name'  (optional)            │
│ !tag_name  HHHH        (optional)            │
│ ?IF 'module_name'      (optional)            │
├──── TOPMOST CONTENT ────────────────────────┤
│ new_label {            ← new standalone code │
│   ...                  (stays in patch file) │
│ }                                            │
├──── REWRITE BOUNDARY (first override) ──────┤
│ existing_label! {      ← replace in-place    │
│   ...                                        │
│ }                                            │
│ existing_label- {      ← splice part before  │
│   ...                                        │
│ }                                            │
│ existing_label+ {      ← splice part after   │
│   ...                                        │
│ }                                            │
│ existing_label+= [     ← merge onto tail     │
│   ...                                        │
│ ]                                            │
│ new_label {            ← chained insert      │
│   ...                  (after prior match)   │
│ }                                            │
└─────────────────────────────────────────────┘
```

### Directive Reference

| Directive | Syntax | Required | Purpose |
|-----------|--------|----------|---------|
| `?BANK` | `?BANK XX` (hex) | No | Constrain topmost content to a specific ROM bank |
| `?INCLUDE` | `?INCLUDE 'name'` | No | Document referenced blocks (informational) |
| `?IF` | `?IF 'name'` | No | Conditional assembly — include if module/file active |
| `?ELSEIF` | `?ELSEIF 'name'` | No | Alternative condition branch |
| `?ELSE` | `?ELSE` | No | Default branch when no conditions match |
| `?ENDIF` | `?ENDIF` | No | End conditional block |

### Label Suffix Reference

| Symbol | Verb | Match Required | On Match | On No Match |
|--------|------|---------------|----------|-------------|
| `!` | `.replace` | **Yes** | Replace target part | **Error** thrown |
| `-` | `.before` | **Yes** | Splice new part **before** target | **Error** thrown |
| `+` | `.after` | **Yes** | Splice new part **after** target | **Error** thrown |
| `-=` | `.prepend` | **Yes** | Merge content into the **head** of target (delimiter-aware) | **Error** thrown |
| `+=` | `.append` | **Yes** | Merge content onto the **tail** of target (delimiter-aware) | **Error** thrown |
| `#[hex]` | `.at([hex])` | **Yes** | Replace bytes in target at hex offset | **Error** thrown |
| *(none, in topmost)* | — | N/A (topmost content) | Stays in patch file as new chunk |
| *(none, after override)* | — | N/A (chained insert) | Inserted at cursor position in target file |

**Note:** `+` and `-` are pure splices and never touch a delimiter. To extend a delimited list (`]`-terminated struct list) use `+=` / `-=` (`.append` / `.prepend`).

### Tag Reference

| Feature | Syntax | Notes |
|---------|--------|-------|
| Declaration | `!name HHHH` | Hex value, 1-3 bytes, no `$` prefix |
| Usage | `$name` / `#$name` | Assembler substitutes hex value |
| Scope | File-local | Does not cross file boundaries |
| Priority | Tags > mnemonics | File tags override global mnemonics |
| Mnemonics | `mnemonics.json` | Auto-available, no declaration needed |

### Address Prefix Reference

| Prefix | Bytes | Use |
|--------|-------|-----|
| `$&` | 2 | Same-bank offset |
| `$@` | 3 | Cross-bank far address |
| `#$&` | 2 | Immediate short pointer |
| `#$@` | 3 | Immediate long pointer |

---

## Transforms vs Overrides

### When to Use Each

| Approach | Use When | Example |
|----------|----------|---------|
| **`transforms.json`** | Changing a constant value (mask, offset, string) without restructuring code | Button mask `#$8001` → `#$8000` in a COP call |
| **Label override (`!`)** | Restructuring code logic, adding/removing instructions, changing control flow | Simplifying L/R alternation to a single check |
| **Both** | Base constants via transforms + structural changes via overrides | Transforms handle all mask swaps; overrides handle simplified charge tick |

### transforms.json Format

Transforms are per-block regex replacements applied to extracted `.asm` text during extraction. They live in `db-us/transforms.json` (or `db-jp/transforms.json` for JP builds).

```json
{
  "block_name": [
    { "key": "regex_pattern", "value": "replacement_string" },
    { "key": "another_pattern", "value": "another_replacement" }
  ]
}
```

The block name must match a block in `blocks.json`. Each entry's `key` is a JavaScript regex (applied with the `g` flag), and `value` is the replacement string.

**Regex escaping rules:**
- JSON escaping applies: `\\` in JSON = `\` in the regex
- `\\$` matches literal `$` (common in asm: `#$8000`, `$&label`)
- `\\s+` matches whitespace including newlines (for multiline patterns)
- `[^\\r\\n]*` matches any characters on the same line (skips inline comments)

**Replacement string rules** (JavaScript `String.replace` semantics):
- `$$` produces a literal `$` in the output
- `$1`, `$2` insert captured groups
- `$&` inserts the full matched text

**Example — COP button mask change:**
```json
{
  "player_character": [
    { "key": "#\\$0030, &(RunSouth|RunNorth|RunWest|RunEast)", "value": "#$$0010, &$1" }
  ]
}
```

This changes `#$0030, &RunSouth` → `#$0010, &RunSouth` (and similarly for North/West/East). The `$1` capture group preserves the specific target label.

**Example — removing code lines:**
```json
{
  "sFA_diary_menu": [
    { "key": "\\s+LDA #\\$8000\\s+STA \\$remapB\\s+LDA #\\$4000\\s+STA \\$remapY", "value": "" }
  ]
}
```

This removes the 4-line remap variable write block from the extracted text.

### Why Transforms Avoid Sub-Label Issues

With label overrides, changing a constant in one block means overriding that entire block — and then also overriding every sub-label to prevent orphaning. For a block with 3 sub-labels, that's 4 override labels just to change one `#$8000` to `#$0080`.

With transforms, the regex operates on the extracted text **before** assembly. Sub-labels are just text — the regex replaces the constant in-place and the block structure is untouched.

**Rule of thumb:** If you're writing more than 3 label overrides that each only change a mask constant, convert them to transforms instead.

### Transform Application Order

1. Engine extracts ROM to `.asm` text
2. Transforms from `transforms.json` are applied to the text (regex replace)
3. Modified text is written to disk as the extracted `.asm` file
4. During rebuild, the assembler reads the (already-transformed) `.asm` files
5. Patch overrides replace specific labels in the assembled output

Transforms and overrides are complementary: transforms handle the base extracted code, overrides handle targeted structural changes. If a label is both transformed AND overridden, the override wins (it replaces the block entirely — the transformed text is never used for that label).

### Unapplied Transform Warnings

A transform that silently does nothing is easy to miss (a renamed block, a new inline comment, a changed label). At the end of every extraction (`extractAllContent`) and `RomGenerator.generateProject`, the engine prints a single grouped warning listing every transform that was not applied:

```
transforms.json: 11 transform(s) were not applied

  Block not found in blocks.json (8 block(s)): rename the key in transforms.json to match
    - fr33_kara (1 transform(s) skipped)

  Regex matched nothing (3):
    - cop_handlers_audio #1: (?<!STA \$02\s+)LDA \$0A\s+...
```

| Warning | Cause | Fix |
|---------|-------|-----|
| **Block not found** | The key in `transforms.json` has no matching block name in `blocks.json` (renamed, split or removed block). Every transform under that key is skipped. | Rename the key to the current block name, or delete the entry. |
| **Regex matched nothing** | The regex is valid but found no text in the block's generated `.asm`. `#N` is the 1-based position in the block's list. | Compare the regex against the extracted file. Common causes: renamed labels, notes/inline comments, and line-tracking tags (`; {n}`) in the text. Use `[^\\r\\n]*` to skip trailing comments. |
| **Invalid regex** | The `key` is not a valid JavaScript regex (the message includes the syntax error). | Fix the pattern; remember JSON needs `\\` for each regex `\`. |

No output means every transform was applied. Programmatic access: `BlockWriter.getTransformWarnings()` returns the list as `TransformWarning[]` (`src/types/transforms.ts`); `formatTransformWarnings()` / `reportTransformWarnings()` (`src/rom/extraction/transform-warnings.ts`) build and print the report. A "matched nothing" warning is per extraction run, so if a transform is only valid in `extract` and not `extract:lt` (or vice versa), you will see it in one mode only.

---

## Engine Source Reference

Key source files in `@gaialabs/core` that implement patch processing:

| File | Role |
|------|------|
| `src/rom/rebuild/assembler.ts` | Parses `.patch.asm` text: directives, tags, line processing |
| `src/rom/rebuild/assembler-state.ts` | Instruction parsing, label creation, operand/tag resolution |
| `src/rom/rebuild/processor.ts` | `applyPatches()` — label matching, rewrite/insert/splice logic |
| `src/rom/rebuild/layout.ts` | ROM bank/page bin-packing with `?BANK` constraints |
| `src/rom/rebuild/writer.ts` | Binary output, `$&`/`$@` reference resolution to addresses |
| `src/types/files.ts` | `ChunkFile`, `calculateSize`, `rebase` — file/part sizing |
| `src/rom/generator.ts` | `applyPatchFile` — loads patches into the build file list |
| `src/database/root.ts` | `DbRootUtils.applyFolder` — discovers `.patch.asm` on disk |
| `src/rom/extraction/writer.ts` | `BlockWriter.generateAsm` — emits `?BANK`, `?INCLUDE`, `!tags` during extraction |

---

## Common Pitfalls and Lessons Learned

Mistakes that have caused real debugging sessions during patch development. Read these before writing patches.

### BRA Range Exceeded After Chained Inserts

**Problem:** After an `!` override, subsequent non-override labels are **chained inserts** — spliced immediately after the overridden block. This pushes the blocks that were originally adjacent further away, potentially breaking `BRA` instructions that relied on the original proximity.

**Root cause:** `BRA` (branch always) has a ±128 byte range. Chained inserts increase the distance between the override point and the blocks below it. A `BRA` targeting a label 50 bytes away becomes 300 bytes away after inserting 250 bytes of new code between them.

**Example:**
```asm
; Original layout: UseItemRefreshCursor is ~40 bytes from UseItemCursorUp
; UseItemCursorUp's BRA UseItemRefreshCursor works fine

; Patch inserts 3 new blocks after UseItemRefreshCursor! override:
UseItemRefreshCursor! { ... }
UseItemReorderStart { ...80 bytes... }
UseItemReorderConfirm { ...80 bytes... }
UseItemReorderCancel { ...80 bytes... }

; UseItemCursorUp is now ~280 bytes from UseItemRefreshCursor → BRA out of range!
```

**Fix:** Override the affected labels to use `JMP $&target` instead of `BRA target`:

```asm
UseItemCursorUp! { JMP $&UseItemRefreshCursor }
UseItemCursorDown! { JMP $&UseItemRefreshCursor }
```

**Prevention:** After adding chained inserts, check the next 5-10 labels below the insertion point for `BRA` instructions that branch upward.

### Sub-Label Orphaning with `!` Overrides

**Problem:** Overriding a block label with `!` replaces only that ONE `AsmBlock`. Internal colon labels (sub-labels) are separate blocks that persist with their original code, leading to orphaned code, duplicate labels, or stale constants.

**Root cause:** The assembler creates a new `AsmBlock` for every label it encounters — `{`, `:`, `[`, `|` — in a flat array. Braces `{ }` are cosmetic grouping with no effect on block boundaries. When `Label!` fires, it does `file.parts[dstIx] = newPart` — replacing exactly one entry.

**Example — orphaned sub-label:**
```asm
; Original extracted code (creates 3 AsmBlocks):
PsychoSliderChargeTick {       ; Block 1
    LDA $26
    LSR
    BCC loc_02C202
    ; ...odd frame check...

  loc_02C202:                  ; Block 2 — separate AsmBlock!
    ; ...even frame check...

  loc_02C212:                  ; Block 3 — separate AsmBlock!
    AND #$0030
    TSB $joypadHeld
    RTS
}

; WRONG — only overrides Block 1, Blocks 2 and 3 persist with original code!
PsychoSliderChargeTick! {
    LDA $joypadCurrent
    BIT #$0008
    BEQ psct_done
    ; ...new code...
  psct_done:
    RTS
}
; loc_02C202 and loc_02C212 still exist with their old code → waste/confusion

; CORRECT — override ALL sub-labels too
PsychoSliderChargeTick! { ...new code... }
loc_02C202! { NOP }            ; override sub-label (filler or reuse)
loc_02C212! { ...consumption code... RTS }
```

**Diagnosis:** After `npm run rebuild`, if the ROM contains unexpected duplicate code or old constant values survive after an override, check for orphaned sub-labels. Use line-tracked extraction (`npm run extract:lt`) to verify which addresses map to which labels.

**Prevention:**
1. Before overriding a label, check the extracted `.asm` for internal colon labels within its braces
2. Override every sub-label with `!` (even if just `NOP` or `RTS`)
3. **Better:** Use `transforms.json` for simple constant changes instead of overrides — transforms operate on text and don't have sub-label issues

### Tag Constants Must Match Operand Width

**Problem:** Defining a tag constant with fewer hex digits than the instruction's operand width causes the assembler to emit a smaller immediate operand than the CPU expects, silently misaligning the instruction stream.

**Example:**
```asm
; WRONG — 1-byte constant used with 16-bit accumulator (M=0)
!list_len    FD

REP #$20              ; M=0 → 16-bit A
LDA #$list_len        ; Assembles as: A9 FD (2 bytes, 1-byte immediate)
                      ; CPU reads:     A9 FD xx (3 bytes, 2-byte immediate)
                      ; → next instruction is misread, stack corrupts, crash
```

```asm
; CORRECT — 2-byte constant matches 16-bit accumulator width
!list_len    00FD

REP #$20
LDA #$list_len        ; Assembles as: A9 FD 00 (3 bytes, correct)
```

**Rule:** Always declare tag constants with the **same byte width** as the operand context where they will be used:
- 2 hex digits (1 byte) for `SEP`/`REP` arguments and 8-bit mode operations
- 4 hex digits (2 bytes) for 16-bit immediate operands (`LDA #$`, `CMP #$`, `ADC #$`, etc.)
- 6 hex digits (3 bytes) for 24-bit long addresses

### Persistent Engine DP State Must Be Preserved

**Problem:** The engine stores critical persistent state in the low direct page (`$00`–`$94`) that must survive across the entire main loop. Overlay code (minimap, menu, custom HUD) that uses DP addresses as scratch can silently corrupt engine state, causing post-close freezes, broken collision, or actor malfunction.

**Known persistent DP addresses:**

| Address | Size | Engine Role | Consequence of Corruption |
|---------|------|-------------|--------------------------|
| `$30` | 1 | SPC transfer handshake counter | Audio transfer errors |
| `$34` | 2 | SPC transfer block size | Audio transfer errors |
| `$36` | 2 | Frame parity counter (NMI `INC $36`) | SPC I/O timing, HDMA buffer select |
| `$56` | 2 | Actor list head pointer | Actor execution skipped/corrupted |
| `$66` | 1 | HDMA channel enable mask | HDMA effects disappear |
| `$80`–`$82` | 3 | **Collision tile map long pointer** | **All collision reads from wrong address — actors freeze, walk through walls** |
| `$84`–`$8F` | 12 | VRAM cache ring metadata | Scene transition tile corruption |
| `$94` | 2 | VRAM cache ring index | Cache slot misalignment |

**Symptom:** Game appears to run after overlay closes, but actors are frozen, palette animations stop, and buttons are unresponsive. The main loop executes but collision checks read garbage data because `[$80]` no longer points to `$7FC000`.

**Fix pattern — MVN save/restore bracket:**
```asm
    ; Save engine low DP before overlay rendering
    PHB
    REP #$20
    LDX #$0000
    LDY #$save_area     ; WRAM save destination (e.g., $7F3C5C)
    LDA #$0094           ; count-1: save $00-$94 (149 bytes)
    MVN #$7F, #$00       ; dest bank $7F, source bank $00
    PLB

    JSR $&overlay_rendering_code

    ; Restore engine low DP after rendering
    PHB
    REP #$20
    LDX #$save_area
    LDY #$0000
    LDA #$0094
    MVN #$00, #$7F       ; dest bank $00, source bank $7F
    PLB
```

**Rule:** Any code that writes to DP addresses in the `$00`–`$94` range as scratch registers must wrap those writes in a save/restore bracket. The original radar (`RadarScreenSetup`) avoids this issue by using only DPs `$02`, `$18`–`$1E`, which don't overlap critical persistent state. Zeroing the affected DPs is **not** sufficient — the engine requires the *original* values (especially the collision pointer at `$80`–`$82`).

### DmaWordToVram Requires 8-bit Accumulator

**Problem:** `DmaWordToVram` (at address 164770) has an M=1 override — it operates in 8-bit accumulator mode. The function stores A (bank byte) and several configuration values to single-byte DMA hardware registers. Calling it with M=0 (16-bit A) causes 2-byte writes that overflow into adjacent registers, corrupting the DMA source address.

**Calling convention:**
```asm
SEP #$20              ; REQUIRED: 8-bit A for DmaWordToVram
LDX #$vram_addr       ; VRAM word address → VMADDL (pre-set by caller)
STX $VMADDL
LDX #$&source_label   ; Source: 16-bit address within bank
LDA #$^source_label   ; Source: bank byte (8-bit)
LDY #$byte_count      ; Transfer size in bytes (16-bit Y)
JSL $@DmaWordToVram
REP #$20              ; Restore 16-bit A if needed
```

**Rule:** Always `SEP #$20` before calling `DmaWordToVram`. Always set `VMADDL` to the target VRAM word address before the call.

### Console Font Tiles and Box Rendering

The ConsoleStringRenderer system (`ConsoleStringRenderer.asm`) maps bytes ≥ $12 directly to VRAM tile indices. The standard `gfx_fonts` has character tiles drawn for transparent backgrounds. When rendering text inside `[RCT]` (DrawBox) rectangles, the character tile backgrounds may not match the box interior fill.

**Solution:** Upload box-optimized font tiles to VRAM before rendering. Use `DmaWordToVram` during forced blank (`LDA #$80 / STA $INIDISP`) to overwrite the relevant tile range:
```asm
SEP #$20
LDA #$80                       ; Force blank
STA $INIDISP
LDX #$0090                     ; Tile $12 × 8 words/tile = VRAM $0090
STX $VMADDL
LDX #$&custom_font+120         ; Byte offset $120 = tile $12 × 16 bytes
LDA #$^custom_font
LDY #$06E0                     ; Tiles $12–$7F = 110 tiles × 16 bytes
JSL $@DmaWordToVram
LDA #$0F                       ; Restore full brightness (or desired level)
STA $INIDISP
REP #$20
```

### Calling ConsoleStringRenderer Directly (Bypassing COP)

The `RunBg3Script` COP handler sets up the rendering context before calling `ConsoleStringRenderer`:
- **DBR** = string data bank
- **DP** = $0000 (ConsoleStringRenderer uses zero-page scratch)
- **X** = $0000 (VRAM buffer start offset)

When calling `ConsoleStringRenderer` directly via `JSL`, you must replicate this context:
```asm
dm_call_csr:
    PHD                              ; Save caller's DP
    PHB                              ; Save caller's DBR
    SEP #$20
    LDA #$^string_data_label         ; Bank byte of string data
    PHA
    PLB                              ; DBR = string bank
    REP #$20
    LDA #$0000
    TCD                              ; DP = $0000
    LDX #$0000                       ; VRAM buffer start offset
    JSL $@ConsoleStringRenderer
    PLB                              ; Restore DBR
    PLD                              ; Restore DP
    RTS
```

**Rule:** Save/restore DP and DBR. Set DP to $0000 and DBR to the bank containing your string data before the JSL.

### Button Mapping in IOG — Action Flag System

IOG uses an **action flag remap system** that converts physical SNES button presses into logical action flags. The remap variables (`$0DA6`–`$0DB4`) are initialized by `SystemInitConstants` at power-on and optionally customized by the options menu module.

**Action flag layout in `joypadCurrent` ($0656):**

| Bit | Mask | Action | Default Physical Button |
|-----|------|--------|------------------------|
| 15 | `$8000` | ACTION_CONFIRM | A |
| 14 | `$4000` | ACTION_CANCEL | B |
| 13 | `$2000` | Select (fixed) | Select |
| 12 | `$1000` | Start (fixed) | Start |
| 11–8 | `$0F00` | D-pad (fixed) | D-pad |
| 7 | `$0080` | ACTION_ATTACK | A |
| 6 | `$0040` | ACTION_RUN | Y |
| 5 | `$0020` | ACTION_BLOCK1 | L |
| 4 | `$0010` | ACTION_BLOCK2 | R |
| 3 | `$0008` | ACTION_USE_ITEM | B |
| 2 | `$0004` | ACTION_CYCLE_ITEM | X |
| 1–0 | `$0002/$0001` | Reserved | — |

**Rule:** Always test action flags against `joypadCurrent`/`joypadHeld`, never raw hardware buttons. Game code checks for action flags like `#$0080` (confirm), `#$0020` (cancel), `#$8000` (attack), etc.

The remap pipeline is defined in `baserom/patches/InputRemap.patch.asm`. The button mask constants in extracted code are set by `transforms.json` during extraction (see [Transforms vs Overrides](#transforms-vs-overrides) below).

**Remap variable → physical button mapping** (variable names are historical — do not match physical buttons):

| Variable | Address | Physical Button |
|----------|---------|----------------|
| `remapR` | `$0DA6` | R |
| `remapL` | `$0DA8` | L |
| `remapB` | `$0DAA` | B |
| `remapA` | `$0DAC` | A |
| `remapY` | `$0DAE` | Y |
| `remapX` | `$0DB0` | X |
| `remapStart` | `$0DB2` | Start (passthrough) |
| `remapSelect` | `$0DB4` | Select (passthrough) |

### Input Consumption Pattern

After handling a button press, consume it to prevent auto-repeat on the next frame:
```asm
LDA #$button_flag     ; e.g. #$0800 for Up
TSB $joypadHeld       ; Mark as consumed — won't trigger again until released and re-pressed
```

When closing a menu, consume ALL currently-held buttons to prevent bleed-through:
```asm
LDA $joypadCurrent
TSB $joypadHeld       ; Consume everything held right now
```

### Adhoc DMA Size-Before-Trigger Race Condition

**Problem:** IOG's adhoc DMA system uses `$7F0C07` as both the VRAM destination address and a trigger flag. The NMI handler checks this address every frame — if non-zero, it fires a DMA transfer using the values in `$7F0C03-05` (source) and `$7F0C09` (size), then clears `$7F0C07` to zero.

Writing the trigger (`$7F0C07`) before the size (`$7F0C09`) creates a race condition: if NMI fires between the two writes, it uses the **stale size** from the previous DMA transfer.

**Example:**
```asm
; WRONG — NMI can fire after trigger write, before size write
; Previous DMA was 1280 bytes ($0500). This DMA should be 64 bytes.
LDA #$4EE0
STA $7F0C07           ; ← NMI fires HERE → fires DMA with stale size $0500!
LDA #$0040
STA $7F0C09           ; Too late — DMA already ran with wrong size

; CORRECT — always write size BEFORE trigger
LDA #$0040
STA $7F0C09           ; Size set first
LDA #$4EE0
STA $7F0C07           ; Trigger armed — NMI will use correct size
```

**Rule:** Always write `$7F0C09` (byte count) before `$7F0C07` (VRAM dest / trigger). Source address writes (`$7F0C03-05`) can be in any order relative to each other, but must be set before the trigger.

**Adhoc DMA register map:**

| Register | Address | Role |
|----------|---------|------|
| Source low word | `$7F0C03-04` | DMA source address (low 16 bits) |
| Source bank | `$7F0C05` | DMA source bank byte |
| Trigger/dest | `$7F0C07` | VRAM destination AND trigger (0 = idle, non-zero = armed) |
| Byte count | `$7F0C09` | Transfer size in bytes |

### Label Offset Arithmetic Is Hexadecimal

**Problem:** When using `+offset` in label references like `#$&label+64`, the offset is parsed as **hexadecimal**. Writing `+64` means hex $64 = 100 decimal, not 64 decimal.

**Example:**
```asm
; WRONG — binary data is 128 bytes; +64 = $64 = 100, reads 28 bytes of garbage
LDA #$&my_tiles+64    ; Actually label + 100 decimal!

; CORRECT — hex $40 = 64 decimal
LDA #$&my_tiles+40    ; label + 64 decimal ✓
```

**Evidence:** Existing codebase uses offsets like `+15C` (contains hex digit C), proving hex interpretation.

**Rule:** Always convert decimal offsets to hex. Common conversions: 32 = `+20`, 48 = `+30`, 64 = `+40`, 96 = `+60`, 128 = `+80`, 256 = `+100`.

### 65C816 Long Addressing Mode Limitations

**Problem:** The 65C816 only supports `X`-indexed long addressing. There is no `LDA $long, Y` or `STA $long, Y` instruction.

| Opcode | Instruction | Exists? |
|--------|------------|---------|
| `$BF` | `LDA $long, X` | ✅ Yes |
| — | `LDA $long, Y` | ❌ No |
| `$9F` | `STA $long, X` | ✅ Yes |
| — | `STA $long, Y` | ❌ No |

When you need Y-indexed access to a long address, restructure to use X for the table/array access and store the other index in a DP scratch register.

### Accumulator-Implied Opcodes: No `A` Operand

**Problem:** Writing `LSR A`, `ASL A`, `INC A`, `DEC A`, `ROL A`, or `ROR A` produces assembly errors. The GaiaLabs assembler uses the bare mnemonic for accumulator-implied addressing.

```asm
; WRONG — assembler does not accept 'A' as an operand
LSR A
INC A

; CORRECT — bare mnemonic targets the accumulator
LSR
INC
```

**Rule:** For shift, rotate, and increment/decrement on the accumulator, always use the bare mnemonic without any operand. Memory-addressed forms (`LSR $addr`, `INC $addr`) do take an operand as normal.

### VRAM Update Synchronization — Adhoc DMA vs DmaWordToVram

**Problem:** When tearing down an overlay that modified both VRAM tile CHR data and BG3 tilemap data, using `DmaWordToVram` (direct DMA during force blank) to restore tile CHR causes 1-frame ghosting. The CHR is restored immediately, but the BG3 tilemap (staging buffer) isn't flushed to VRAM until the next NMI. For one frame, the display shows the old overlay tilemap pointing at the newly-restored tile graphics — garbled appearance.

**Example — minimap teardown ghosting:**
```asm
; WRONG — direct DMA desyncs CHR from tilemap
SEP #$20
LDA #$80
STA $INIDISP              ; force blank
LDX #$6800                ; VRAM dest for font tiles
STX $VMADDL
LDX #$&gfx_fonts+1002     ; source
LDA #$^gfx_fonts           ; bank
LDY #$0500                ; size
JSL $@DmaWordToVram        ; CHR updated NOW — tilemap still has overlay layout
; → next frame: old tilemap + new CHR = garbage ghost
```

```asm
; CORRECT — queue adhoc DMA, both updates fire in same NMI VBlank
REP #$20
LDA #$&gfx_fonts+1002
STA $adhocVramDma          ; source low word ($7F0C03)
LDA #$*gfx_fonts
STA $7F0C05                ; source bank
LDA #$0500
STA $7F0C09                ; size FIRST (before trigger!)
LDA #$6800
STA $7F0C07                ; trigger — NMI fires DMA + tilemap flush atomically
```

**Why it works:** The NMI handler executes `DmaAdhocVramBlock` (tile CHR) then `FlushVramWriteQueue` (staging buffer tilemap) in the same VBlank. Both VRAM regions update before the next visible frame — no desync.

**Rule:** When an overlay teardown must restore VRAM tile CHR data while the staging buffer is also being flushed, use the adhoc DMA pipeline (`$7F0C03-$7F0C09`) instead of `DmaWordToVram`. This synchronizes both updates in the same NMI handler.

### gfx_fonts ROM Format

The dialog font (`gfx_fonts`) uses a 2-byte null-compression header followed by raw 2bpp tile data:

| Offset | Size | Content |
|--------|------|---------|
| +0 | 2 | Compression header (skip for raw access) |
| +2 | 8192 ($2000) | Raw 2bpp tile data (512 tiles × 16 bytes) |

The font fills VRAM $6000–$6FFF (BG3 character base from BG34NBA = $06). Any overlay that uploads tile CHR into this range (e.g., $6800 for tile index $100+) must restore the font during teardown. Source offset calculation: `gfx_fonts + 2 + (VRAM_dest − $6000) × 2`.

### No Combined Label+Constant Addressing

**Problem:** The GaiaLabs assembler cannot parse `$label+constant, X` as a combined operand. The `+constant` suffix triggers decimal arithmetic on the label, but the trailing `, X` addressing mode suffix causes the parser to produce NaN.

```asm
; WRONG — produces build error "Invalid operand '000NAN, X'"
STA $stagingBuffer+2, X

; CORRECT — fold the constant into X before the access
TXA
CLC
ADC #$0002
TAX
STA $stagingBuffer, X
```

### COP Commands Require X = Actor Slot ID

**Problem:** The COP dispatch system expects the X register to contain the current actor's slot ID when any COP instruction executes. If X has been clobbered by earlier code (loop counters, scratch calculations, etc.), the COP handler operates on the wrong actor context — spawning actors with wrong parent links, writing fields to wrong actor slots, or corrupting the actor linked list.

**Root cause:** The COP interrupt handler uses X (along with D and Y) to identify the calling actor and set up the handler context. The specific handlers then read operands, modify actor fields, and update linked list pointers based on this context. A clobbered X causes cascading corruption.

**Example — OAM buffer clear loop clobbers X:**
```asm
; WRONG — X is $FFFE after the loop, not the actor ID
LDA #$0000
LDX #$007E
-ClearLoop:
    STA $7F0600, X
    DEX
    DEX
    BPL -ClearLoop
; X = $FFFE here!
COP [SpawnAfterFlags] ( @some_actor, #$2000 )  ; ← COP sees garbage X → crash

; CORRECT — save/restore X around any code that clobbers it
PHX                      ; save actor slot ID
LDA #$0000
LDX #$007E
-ClearLoop:
    STA $7F0600, X
    DEX
    DEX
    BPL -ClearLoop
PLX                      ; restore actor slot ID
COP [SpawnAfterFlags] ( @some_actor, #$2000 )  ; ← COP sees correct X ✓
```

**Rule:** Before any COP instruction in actor code, ensure X = the current actor's slot ID. If you use X as a loop counter, table index, or scratch register, wrap that code in `PHX`/`PLX`. The same applies to any inline code that modifies X between COP calls — always restore it before the next COP instruction.

**Typical symptoms:** Freeze or crash immediately on the COP call; newly spawned actors appear with corrupt state; linked list corruption causing infinite actor loop execution.

### Actor Entry Point ($00/$01) Must Not Be Corrupted Before Yield

**Problem:** `COP [SetEntryHere]` saves the re-entry address into the actor's `$00`/`$01` fields (the low word of the code pointer). If subsequent code overwrites `$00` via `STA $0000` (DP write with D = actor slot), the entry point is corrupted. When the actor yields (RTL) and the engine re-enters it next frame, it jumps to a garbage address.

**Root cause:** Several engine APIs use `$0000` as a parameter-passing convention — for example, `LookupMapName` reads the search key from `CMP $0000` (DP offset $00). Writing the parameter via `STA $0000` also overwrites the SetEntryHere entry point, since both resolve to the actor's $00 field.

The original game code gets away with this because those `STA $0000` calls occur in **one-shot sequences** (gravity animations, route handlers) that immediately continue to another `SetEntryHere` or `COP [Die]` without ever yielding. In a **looping actor** that yields via RTL every frame, the corrupted entry point persists until re-entry.

**Example:**
```asm
; WRONG — STA $0000 overwrites the SetEntryHere entry point
wmcLoop:
    COP [SetEntryHere]       ; saves re-entry address to $00/$01
    JSL $@SomeUpdate
    LDA $sceneId
    STA $0000                ; ← overwrites $00/$01 with scene ID!
    JSR $&LookupMapName      ; reads $0000 as search key — works
    ; ...
    RTL                      ; ← engine re-enters at $07:$00xx → CRASH

; CORRECT — save/restore $00 around the parameter write
wmcLoop:
    COP [SetEntryHere]
    JSL $@SomeUpdate
    LDA $00
    PHA                      ; save entry point low word
    LDA $sceneId
    STA $0000                ; scene ID for LookupMapName
    JSR $&LookupMapName
    PLA
    STA $00                  ; restore entry point
    ; ...
    RTL                      ; ← engine re-enters at correct address ✓
```

**Rule:** In any actor that loops via `SetEntryHere` + `RTL`, never write to DP `$00`/`$01` (the entry point) without saving and restoring the original value. If you need to pass a parameter through `$0000` to engine APIs, bracket the write with `PHA`/`PLA` of the current `$00` value. One-shot sequences that end in `COP [Die]` are safe since the entry point is never re-used.
