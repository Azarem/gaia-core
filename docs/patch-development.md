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
; Parts: labeled blocks merged into the ROM
; =============================================

; --- Topmost content (new standalone block) ---
my_new_routine {
    LDA #$0001
    RTL
}

; --- Rewrite (replaces existing part) ---
ExistingLabel! {
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

### Label Suffixes

Labels in patch files can have suffixes that control how the content is merged:

| Suffix | Syntax | Behavior |
|--------|--------|----------|
| `!` (force rewrite) | `Label! { ... }` | **Replace** the matched part. **Error** if no match found. |
| *(none)* | `Label { ... }` | **Replace** the matched part. **Silent** if no match found — content is inserted after the previous label's position instead. |
| `-` (insert before) | `Label- { ... }` | **Insert before** the matched part. Error if no match found. |
| `+` (insert after) | `Label+ { ... }` | **Insert after** the matched part. Error if no match found. |

### Matching Algorithm

The patch application algorithm (`RomProcessor.applyPatches`) processes each patch file's parts sequentially:

```
For each patch file:
  file = null, dstIx = -1  (no target file/position yet)

  For each part in the patch:
    1. Strip suffix (!, -, +) from label to get the lookup key
    2. Search masterLookup for the label (case-insensitive)

    If MATCH found (and match is in a different file than the patch):
      → Set file = matched part's file, dstIx = matched part's index

      If suffix is - or +:
        → INSERT the patch part before (-) or after (+) the match position
      Else (no suffix or !):
        → REPLACE the matched part with the patch part
        → Update masterLookup to point to the new part

    Else if FORCE (! suffix) or ADJUST (- or + suffix):
      → THROW ERROR — required match not found

    Else if dstIx >= 0 (a previous label already matched):
      → INSERT at the current dstIx position (chained insert)
      → This implements "place after the last matched label"

    Else (no match, no prior context):
      → SKIP — leave this part in the patch file as standalone content

    Remove matched/inserted parts from the patch file
```

### Topmost Content (Standalone Blocks)

Code that appears **before any matching label** in the patch file — or any labeled block that doesn't match an existing part — remains in the patch file as **topmost content**. This content becomes a new standalone ROM chunk.

**Key rule:** New code that should exist as a single standalone unit (not patched into other blocks) should be declared **at the top of the file**, before any rewrite/matching labels.

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

After a label match establishes a target file and position (`dstIx`), subsequent parts that don't match any label are inserted sequentially at the advancing cursor position. This allows inserting multiple new parts into an existing block:

```asm
; Match an existing label — sets the target file and position
ExistingLabel! {
    ; Replace existing code
    JSR $&new_helper_a
    JSR $&new_helper_b
    RTS
}

; These don't match any existing label, so they INSERT after ExistingLabel
new_helper_a {
    LDA #$0001
    RTS
}

new_helper_b {
    LDA #$0002
    RTS
}
```

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

### New Standalone Part (no suffix, no match)

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

`BlankScrollColumn` has no `!` suffix and doesn't match any existing part name. Since it appears after `code_00EAF0!` (which already matched), it gets **inserted** into the target file after the previously matched position. This places it alongside the camera code it supports.

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

These `:` labels are local to the block and don't participate in global label matching.

### Cross-Bank References

```asm
JSL $@system_init.UploadCgramPalette  ; 3-byte far call (cross-bank)
JSR $&RenderScrollRow                  ; 2-byte short call (same bank)
JSR $&BlankScrollColumn                ; 2-byte short call (same bank)
JSR $&DmaHorizontalStrip               ; 2-byte short call (same bank)
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

; Topmost content: new global hook
global_scripts {
    JSL @RunButton
    JSL @ItemSwapping
    RTS
}

---------------------------------------------------------

; Rewrites of existing labels follow...
```

- Multiple `?INCLUDE` declarations for documentation
- Hardware register tags (`!VMADDL`, `!A1T0L`) declared locally
- `global_scripts` is topmost content that becomes a new ROM chunk in bank 03
- Rewrite labels below reference the new topmost code via `$@`

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

; New standalone code (topmost)
my_new_function {
    ; ...
    RTL
}

; Rewrites of existing code
existing_function! {
    ; Modified version
    JSL $@my_new_function
    ; ...
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
| `Duplicate label: X` | Two parts have the same label | Rename one, or use rewrite suffix |
| `Patch X contains a rewrite that does not exist: Y` | `!` or `+`/`-` suffix but label not found | Check spelling, verify the target part exists in extracted code |
| Bank overflow / wrong address | `$&` reference to a different bank | Change to `$@` for cross-bank, or use `?BANK` to colocate |
| Patch not appearing in output | All parts matched/spliced, no topmost content | Expected behavior — patch content lives inside target blocks |
| Code assembled at wrong location | Missing `?BANK` for bank-sensitive code | Add `?BANK XX` directive |

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
├─────────────────────────────────────────────┤
│ topmost_label {        ← new standalone code │
│   ...                                        │
│ }                                            │
├─────────────────────────────────────────────┤
│ existing_label! {      ← force rewrite       │
│   ...                                        │
│ }                                            │
│ existing_label- {      ← insert before       │
│   ...                                        │
│ }                                            │
│ existing_label+ {      ← insert after        │
│   ...                                        │
│ }                                            │
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

| Suffix | Match Required | On Match | On No Match |
|--------|---------------|----------|-------------|
| `!` | **Yes** | Replace target part | **Error** thrown |
| *(none)* | No | Replace target part | Insert after previous or keep as topmost |
| `-` | **Yes** | Insert **before** target | **Error** thrown |
| `+` | **Yes** | Insert **after** target | **Error** thrown |

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
