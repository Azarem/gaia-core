# Notes and Comments System

The GaiaLabs engine provides a three-tier annotation system for documenting disassembled ROM code. Annotations are stored as JSON files in a `notes/` directory at the **baserom project root** and are **inserted into the extracted `.asm` files during extraction**. They are not embedded in the ROM itself — they live alongside the database triad (`blocks.json`, `overrides.json`, `names.json`) as a documentation layer.

**Notes are local-only.** The `notes/` directory is excluded from the npm package (`package.json` `files` field does not include it). When the baserom is installed as a dependency via npm, no notes are present and the module operates without them. When the repo is cloned locally, the `notes/` directory is available and the module loads all annotations at startup via filesystem discovery. This keeps the published package lightweight while giving local contributors full documentation in their extracted `.asm` files.

During **rebuild**, the assembler strips all comments (`;`, `--`, `//` prefixes) from `.asm` source before processing. This means annotations are write-once into JSON, injected on extraction, and harmlessly ignored on rebuild — the extracted `.asm` files are always the authoritative view of both code and documentation.

## The Three Tiers

### 1. Block Notes (`notes/blockNotes/`)

**Scope:** One note per code/data block (the top-level organizational unit).

**Location:** `notes/blockNotes/bankNN.json` — one file per ROM bank, where `NN` is the two-digit hex bank number (e.g., `bank00.json`, `bank02.json`, `bank03.json`).

**File format:** Each bank file is a flat JSON object mapping block names (matching keys in `blocks.json`) to multi-line documentation strings:

```json
{
    "system_core": "Core system loop and CPU interrupt vectors.\n\n...",
    "combat_collision": "Combat and interaction collision system (244613–247295, Bank 03).\n\n..."
}
```

**How they appear in extracted ASM:** Block notes are emitted at the very top of the `.asm` file, before the `?BANK` directive and `?INCLUDE` list. Each line of the note is prefixed with `; ` and followed by a separator line:

```asm
; Combat and interaction collision system (244613–247295, Bank 03).
;
; Implements all actor-vs-actor collision detection and damage processing...
---------------------------------------------

?BANK 03

?INCLUDE 'dialogue_display'
...
```

**Engine source:** `BlockWriter.generateAsm()` in `src/rom/extraction/writer.ts` reads `this._root.blockNotes[block.name]` and splits on newlines:

```typescript
const notes = this._root.blockNotes[block.name];
if (notes?.length > 0) {
    lines.push(...notes.split(/\r?\n/).map(line => `; ${line}`));
    lines.push('---------------------------------------------');
    lines.push('');
}
```

**Writing guidelines:**
- Include the address range and bank number in the first line for quick reference
- Use `=== SECTION ===` headers within the string to organize long notes
- Document key data structures, flag bitmasks, and algorithmic patterns
- Reference related blocks and routines by name and address

### 2. Part Notes (`notes/partNotes/`)

**Scope:** One note per named routine or data table within a block.

**Location:** `notes/partNotes/bankNN.json` — one file per ROM bank, matching the block notes bank structure.

**File format:** Each bank file is a flat JSON object mapping part/routine names (matching entries in `names.json` or auto-generated `code_XXXXXX` labels) to documentation strings:

```json
{
    "RunCombatCollision": "Entry point for the per-frame combat collision system.\n\n...",
    "PlayerAttackHitTest": "Test the player's attack hitbox against all enemies and apply damage on hit.\n\n...",
    "FormatDamageDigits": "Convert a 16-bit damage number to packed BCD digit format for sprite display.\n\n..."
}
```

**How they appear in extracted ASM:** Part notes are emitted immediately before the routine label they document. They appear as comment blocks with a separator line (for non-first parts), followed by the label:

```asm
---------------------------------------------
; Entry point for the per-frame combat collision system.
;
; Saves processor state and data bank. Zeroes enemyHpPending ($09EA)...

RunCombatCollision {
    PHP
    ...
```

For labels inside a `{ }` code block (internal labels within a routine), notes appear before the label indentation:

```asm
; Check if the player has died and trigger game over sequence.
;
; Guards: returns immediately if playerFlags bit 5 ($0020) is set...

  CheckPlayerDeath:
    PHP
    ...
```

**Engine source:** Part notes are checked in two places in `BlockWriter`:

1. **`writeTableEntryArray()`** — for top-level named entries (routine headers):
```typescript
const notes = this._root.partNotes[name];
if (notes?.length > 0) {
    lines.push('');
    if (!first) lines.push('---------------------------------------------');
    lines.push(...notes.split(/\r?\n/).map(line => `; ${line}`));
}
```

2. **`writeOpArray()`** — for internal labels within instruction blocks:
```typescript
const notes = this._root.partNotes[label];
if (notes?.length > 0) {
    lines.push('');
    lines.push(...notes.split(/\r?\n/).map(line => `; ${line}`));
}
```

**Writing guidelines:**
- First line should be a concise one-sentence summary of the routine's purpose
- Subsequent paragraphs should describe parameters, algorithm, side effects, and return values
- Document flag bitmasks and their meanings when the routine tests or sets them
- Reference related routines by name

### 3. Line Comments (`notes/comments/`)

**Scope:** One comment per individual opcode/instruction, keyed by decimal ROM address.

**Location:** `notes/comments/bankNN.json` — one file per ROM bank.

**File format:** Each bank file is a flat JSON object mapping decimal ROM addresses (as string keys) to comment strings:

```json
{
    "244613": "Save processor status — restored at PLP before RTL exit",
    "244614": "16-bit accumulator for joypad and actor data access",
    "244616": "Load current joypad button state from $0656",
    "244619": "Bit 15 ($8000) = B button (attack/dodge input)"
}
```

**How they appear in extracted ASM:** Comments are appended to the end of each instruction line, padded to column 25 for alignment:

```asm
    PHP                      ; Save processor status — restored at PLP before RTL exit
    REP #$20                 ; 16-bit accumulator for joypad and actor data access
    LDA $joypadCurrent       ; Load current joypad button state from $0656
    BIT #$8000               ; Bit 15 ($8000) = B button (attack/dodge input)
```

**Engine source:** In `BlockWriter.writeOpArray()`, each instruction checks for a comment at its ROM location:

```typescript
const comment = this._root.comments[op.location];
if (comment) opLine = opLine.padEnd(25, ' ') + ` ; ${comment}`;
```

The `op.location` is the decimal SNES flat address of the instruction. For Bank 03, addresses are `0x030000 + offset = 196608 + offset`.

### Location-Tagged Extraction (`extract:lt`)

The engine supports a **location-tagged extraction mode** that emits the decimal ROM address of every instruction directly in the `.asm` output. This eliminates the need for manual address computation when writing inline comments.

**How to run it:**

```bash
cd <baserom-repo>
npm run extract:lt
```

**What it produces:** Every instruction line that does **not** already have a comment gets a `; {decimal_address}` suffix:

```asm
ItemUseDispatch {
    PEA $&ItemUseEpilogue-1 ; Push epilogue return — handler returns via RTS
    LDY $inventoryEquippedIndex ; Equipped slot; $FFFF = nothing equipped
    BPL loc_03841B ; {230422}
    JMP $&UseItem_None ; {230424}

  loc_03841B:
    LDA $inventorySlots, Y ; Read item byte, mask to 6-bit ID, double for table
    AND #$00FF ; {230430}
    AND #$003F ; {230433}
    ASL  ; {230436}
```

**Key behavior:**
- Lines **with** an existing comment from `comments.json` show the comment (no location tag)
- Lines **without** a comment show `; {address}` where `address` is the decimal ROM flat address
- Labels, directives, data lines, and string literals do not receive location tags
- The addresses are computed by the engine from its ROM analysis — they are **guaranteed correct**

**Engine source:** In `BlockWriter.writeOpArray()` (`src/rom/extraction/writer.ts`):

```typescript
const comment = this._root.comments[op.location];
if (comment) opLine = opLine.padEnd(25, ' ') + ` ; ${comment}`;
else if (this._root.config.emitLineTracking) opLine += ` ; {${op.location}}`;
```

The `emitLineTracking` flag is set on `DbConfig` (`src/database/config.ts`) when the `--linetracking` CLI flag is passed.

**Why this matters:** Writing inline comments previously required manually computing instruction addresses by counting byte sizes through the 65C816 instruction set — accounting for register mode flags (M/X), addressing modes, and variable-length COP operands. This was the most error-prone step. Location-tagged extraction makes the address visible on every uncommented line, so the agent can simply read the address and use it as the JSON key.

### Comment Address Calculation (Manual Fallback)

> **Note:** This section describes the manual address computation process. With `extract:lt` (see above), this process is no longer necessary for writing new comments — the addresses are visible directly in the extracted output. This reference is retained for understanding the addressing model and for situations where manual verification is needed.

Comments are keyed by **decimal ROM address**. To compute the address for a given instruction:

1. Start from a known anchor (a named label in `names.json` or a `loc_XXXXXX` label in the ASM, where `XXXXXX` is the hex address)
2. Add the byte size of each instruction between the anchor and your target
3. Convert the hex address to decimal for the JSON key

Instruction sizes depend on the 65C816 register mode:
- **1-byte:** `PHP`, `PLP`, `PHA`, `PLA`, `PHB`, `PLB`, `PHD`, `PLD`, `PHK`, `PHX`, `PHY`, `PLX`, `PLY`, `TCD`, `TDC`, `TXA`, `TAX`, `TYA`, `TAY`, `TXY`, `TYX`, `TXS`, `TSX`, `XBA`, `INC`, `DEC`, `INX`, `DEX`, `INY`, `DEY`, `ASL`, `LSR`, `ROL`, `ROR`, `NOP`, `SEC`, `CLC`, `SED`, `CLD`, `SEI`, `CLI`, `RTS`, `RTL`, `RTI`, `BRK`, `STP`, `WAI`, `WDM`, `XCE`
- **2-byte:** `REP`, `SEP`, `BEQ`, `BNE`, `BCC`, `BCS`, `BPL`, `BMI`, `BRA`, `BVS`, `BVC`, all direct-page addressing (`LDA $xx`, `STA $xx`, `STZ $xx`, etc.), `PEI`, immediate with 8-bit register
- **3-byte:** Absolute addressing (`LDA $xxxx`, `STA $xxxx`, `STZ $xxxx`, `JSR $xxxx`, `JMP $xxxx`, etc.), `BRL`, `PEA`, `MVN`, `MVP`, 16-bit immediate (`LDA #$xxxx`, `CMP #$xxxx`, etc. when M=0 or X=0)
- **4-byte:** Long addressing (`LDA $xxxxxx`, `STA $xxxxxx`, `JSL $xxxxxx`, `JML $xxxxxx`, etc.), long indexed (`LDA $xxxxxx,X`)
- **Variable:** COP instructions depend on the copdef operand count

The M flag (set by `SEP #$20`, cleared by `REP #$20`) determines whether immediate accumulator operations are 2 or 3 bytes. The X flag (set by `SEP #$10`, cleared by `REP #$10`) does the same for index register operations.

## Notes Directory Structure

All three annotation tiers are stored in a `notes/` directory at the baserom project root, split by ROM bank:

```
<baserom-root>/
  notes/
    blockNotes/
      bank00.json        ← block notes for Bank 00 blocks
      bank02.json        ← block notes for Bank 02 blocks
      bank03.json        ← block notes for Bank 03 blocks
    partNotes/
      bank00.json        ← part notes for Bank 00 routines
      bank02.json        ← part notes for Bank 02 routines
      bank03.json        ← part notes for Bank 03 routines
    comments/
      bank00.json        ← inline comments for Bank 00 addresses (32768–65535)
      bank02.json        ← inline comments for Bank 02 addresses (163840–196607)
      bank03.json        ← inline comments for Bank 03 addresses (229376–262143)
```

### Bank assignment

Each annotation goes into the bank file corresponding to the code it documents:

- **Block notes:** The bank is determined by the block's start address in `blocks.json`. For blocks without a direct `start` field (only nested `parts`), use the bank of the first part.
- **Part notes:** The bank is determined by the routine's address in `names.json`. For routines within a block, they share the block's bank.
- **Comments:** The bank is determined directly from the decimal ROM address key. Bank = floor(address / 65536).

| Bank | Address range (decimal) | Address range (hex) |
|------|------------------------|---------------------|
| 00 | 32768–65535 | $008000–$00FFFF |
| 01 | 98304–131071 | $018000–$01FFFF |
| 02 | 163840–196607 | $028000–$02FFFF |
| 03 | 229376–262143 | $038000–$03FFFF |

### How loading works

The baserom project's `src/index.ts` discovers and loads notes at runtime via filesystem check:

```typescript
function loadNotesDir(subdir: string): Record<string, string> {
    const dir = join(__pkgRoot, 'notes', subdir);
    if (!existsSync(dir)) return {};

    const merged: Record<string, string> = {};
    for (const file of readdirSync(dir)) {
        if (!file.endsWith('.json')) continue;
        const data = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
        Object.assign(merged, data);
    }
    return merged;
}

const localNotes = loadLocalNotes();

export const db: DbGameRomModule = {
    // ...
    comments: localNotes.comments,
    blockNotes: localNotes.blockNotes,
    partNotes: localNotes.partNotes,
};
```

The loader reads **all** `.json` files in each subdirectory and merges them into a single flat dictionary. The engine itself (`DbRootUtils.fromGameModule()` in `src/database/root.ts`) receives the already-merged dictionary and stores it as a flat `Record<string, string>`:

```typescript
comments: module.comments ?? {},
blockNotes: module.blockNotes ?? {},
partNotes: module.partNotes ?? {},
```

This means:
- **The engine does not know or care about the file split** — it only sees the merged dictionary
- **New bank files are auto-discovered** — just create `notes/blockNotes/bank04.json` and it will be loaded on the next extraction. No code changes required.
- **The split is purely organizational** — any entry can go in any file, though by convention each file covers one ROM bank
- **There is no duplication risk** as long as each key appears in only one bank file
- **When installed via npm** — the `notes/` directory is absent (excluded by `package.json` `files`), so all three fields default to `{}`. The module operates without annotations.

### Adding a new bank file

1. Create `notes/blockNotes/bankNN.json`, `notes/partNotes/bankNN.json`, and/or `notes/comments/bankNN.json` with an empty object `{}`
2. That's it — the filesystem loader auto-discovers all `.json` files in each subdirectory. No imports or code changes needed.

## Module Interface

All three annotation types are optional fields on the `DbGameRomModule` interface defined in `src/database/modules.ts`:

```typescript
export interface DbGameRomModule {
    // ... other fields ...
    names?: Record<number, string>;       // Address → label name
    comments?: Record<number, string>;    // Address → inline comment
    blockNotes?: Record<string, string>;  // Block name → block documentation
    partNotes?: Record<string, string>;   // Part/routine name → part documentation
}
```

These flow through `DbRootUtils.fromGameModule()` into the `DbRoot` object:

```typescript
export interface DbRoot {
    // ... other fields ...
    names: Record<number, string>;
    comments: Record<number, string>;
    blockNotes: Record<string, string>;
    partNotes: Record<string, string>;
}
```

## Rebuild Behavior

During rebuild, the assembler in `src/rom/rebuild/assembler.ts` strips all comment syntax before parsing:

```typescript
// Ignore comments
this.trimComments('--');
this.trimComments(';');
this.trimComments('//');
```

This means:
- Block notes (prefixed with `; `) are ignored
- Part notes (prefixed with `; `) are ignored
- Inline comments (after `; ` on instruction lines) are ignored
- Separator lines (`-----`) are treated as visual separators and ignored
- The rebuild produces identical binary output regardless of annotation content

## Relationship to names.json

The `names.json` file provides the label names that both part notes and comments reference:

- **Part notes** are keyed by the label name string (e.g., `"RunCombatCollision"`) — this must match exactly what appears in `names.json` values or what the engine auto-generates as `code_XXXXXX`
- **Comments** are keyed by the decimal address (e.g., `"244708"`) — this is the same address space as `names.json` keys
- **Block notes** are keyed by the block name from `blocks.json` (e.g., `"combat_collision"`)

When documenting a block, all three note types should be updated together in their respective `bankNN.json` files to maintain consistency.

## Summary

| Tier | Directory | Key Type | Value | Insertion Point |
|------|-----------|----------|-------|-----------------|
| Block | `notes/blockNotes/bankNN.json` | Block name (string) | Multi-line documentation | Top of `.asm` file, before `?BANK` |
| Part | `notes/partNotes/bankNN.json` | Routine label (string) | Multi-line documentation | Before routine label in `.asm` |
| Line | `notes/comments/bankNN.json` | Decimal ROM address (string) | Single-line comment | End of instruction line, padded to col 25 |

All three are injected during extraction, stripped during rebuild, and stored as plain JSON in the `notes/` directory at the baserom project root. The `notes/` directory is excluded from the npm package — annotations are only available in local/cloned repos.

---

## Comment Authoring Guide

This section provides detailed guidance for agents (and humans) creating inline comments, part notes, and block notes. The goal is to find the **sweet spot** — comments that convey the variables, context, and intent behind the code without narrating every instruction.

### The Cardinal Rule: Read First, Comment Second

**Never decide on a comment count before reading the code.** Always read the entire file (or the entire address range) from start to finish before writing a single comment. The code's complexity should dictate the comment density — not a predetermined target.

A simple routine like `DialogCmd_JumpToAddress` (read 2 bytes into Y, return) needs at most one comment. A complex routine like `DialogCmd_PrintNumber` (stack frame, nested loops, nibble extraction, leading zero suppression) needs 15+. Let the code determine what's necessary.

### Philosophy: What Comments Should Convey

Comments exist to help someone reading the disassembly understand **what's happening at each logical step** without being a line-by-line translation of the assembly. Think of comments as annotations for an interpreter following the instruction stream:

- **What operation is being performed** (not what instruction is executing)
- **What values mean** in context (magic numbers, bitmasks, tile IDs, SFX codes)
- **Why** a non-obvious sequence exists (the RTS dispatch trick, XBA+LSR for ×32, two's complement negation)
- **What state is changing** (which WRAM variables, what they control, what depends on them)

### The Three-Tier Division of Labor

Each tier has a specific role. Understanding this prevents duplication:

| Tier | Purpose | Coverage |
|------|---------|----------|
| **Block note** | System-level architecture — what the file/block does as a whole, how subsystems relate, data formats, WRAM variable maps | One per block; read once for orientation |
| **Part note** | Routine-level contract — purpose, parameters, algorithm summary, side effects, return values | One per routine; read when entering a routine |
| **Inline comment** | Instruction-level context — what this specific code is doing *right now* as you step through | Per logical operation; read while tracing |

**Key principle:** Part notes describe *what* a routine does and *how* at the algorithm level. Inline comments annotate *specific instructions* as you encounter them. Don't duplicate part note content in inline comments — if the part note says "reads a 2-byte operand: low = column, high = row," the inline comment at the LDA instruction should say the same concisely (`2-byte operand: low = column, high = row`) but there's no need to re-explain the full VRAM offset calculation that the part note already covers.

### What Makes a Good Inline Comment

**Good comments summarize logical operations at the first meaningful instruction.** They aggregate multiple instructions into one conceptual step:

```
; GOOD: Summarizes a 3-instruction sequence at the first instruction
ORA $0986             ; Compose tile word: index | palette ($0986) | priority ($2100)
ORA #$2100
LDX $0998

; GOOD: Explains a non-obvious value
CMP #$00AC            ; Ellipsis tile ($AC) suppresses per-character click sound

; GOOD: Documents the intent of a bitmask
LDA #$C080            ; Suppress A/B/Start auto-repeat ($C080 in joypadHeld)

; GOOD: Explains a calculation trick
XBA                   ; VRAM offset = row × 32 + column × 2 via XBA + LSR×2 + ADC column twice

; GOOD: Marks a key decision point with context
CMP $0984             ; At box bottom (line = height): scroll up twice with frame pauses

; GOOD: Documents operand format at the read point
LDA $0000, Y          ; 4-byte operand: bytes 0-1 = base offset, bytes 2-3 = table address

; GOOD: Explains what a group of instructions accomplishes together
STA $joypadHeld       ; On button: acknowledge input, erase cursor, clear box for next page
```

### What to Avoid

**Bad comments restate what the instruction already says:**

```
; BAD: Just restating the instruction
PHY                   ; Save string pointer Y
PLY                   ; Restore Y
RTS                   ; Return
INX                   ; Advance position by 2
INX
AND #$00FF            ; Mask to byte
CLC                   ; CLC for addition
```

**Bad comments explain obvious operations:**

```
; BAD: The instruction is self-explanatory
SEP #$20              ; Switch to 8-bit A
REP #$20              ; Back to 16-bit A
STA $0982             ; Store width to $0982
LDA $0984             ; Load box height from $0984
BNE loc_03E509        ; More rows → loop back
```

**Bad comments are redundant with part notes:**

```
; BAD: Part note already says "reads a 1-byte operand (template index)"
LDA $0000, Y          ; Read 1-byte template index from operand
AND #$00FF            ; Mask to byte
ASL                   ; Double for word-sized pointer table entry
TAY                   ; Transfer index to Y for table read
```

Compare with the focused version:

```
; FOCUSED: One comment covers the whole sequence
LDA $0000, Y          ; 1-byte template index, doubled for word pointer table
AND #$00FF
ASL
TAY
```

### Comment Density Guidelines

These are guidelines, not rules — always let the code's complexity drive density:

**High density (comment every 3–5 instructions):**
- Stack frame manipulation with non-obvious SP-relative addressing
- Multi-step arithmetic (VRAM offset calculations, division by repeated subtraction)
- Dispatch mechanisms (RTS trick, indirect JSR, command table lookup)
- Bitmask logic where individual bits have specific meanings

**Medium density (comment every 8–15 instructions):**
- Straightforward loops with clear structure (copy, fill, iterate)
- Operand reads with standard patterns (read, mask, store)
- Standard bank-switching sequences (SEP, push bank, PLB, REP)
- Box drawing and tile rendering (once the pattern is established)

**Low density (1–3 comments for the entire routine):**
- Trivial command handlers (read operand, store to variable, return)
- Simple state changes (set flag, clear flag, return)
- Routines that are nearly identical to a previously-documented one (note "Same structure as X but reads from Y")

**Zero comments (rely on part note alone):**
- Data tables (the part note should describe the format)
- Single-instruction routines
- Routines whose part note fully describes every instruction

### Handling Repetitive Patterns

Many 65C816 routines share structural patterns. Comment the pattern thoroughly the **first time** it appears, then use abbreviated comments for subsequent instances:

**First occurrence (full explanation):**
```
; Switch DBR to template bank for absolute reads
SEP #$20
LDA #$^templates_01CA95
PHA
PLB
REP #$20
```

**Subsequent occurrences (abbreviated):**
```
; Switch DBR to dictionary bank, read string pointer, JSL recursive render
SEP #$20
LDA #$^dictionary_01EBA8
PHA
PLB
REP #$20
```

**Third occurrence (reference first):**
```
; Same structure as DictionaryA but reads from dictionary_01F54D
LDA $0000, Y
```

### Magic Numbers and Bitmasks

Always comment magic numbers on first use. Include both the value and its meaning:

```
; GOOD: value + meaning
LDA #$0010            ; Default per-character SFX = $10 (typing click)
CMP #$00FA            ; Scene $FA (title screen)
LDA #$2040            ; Blank tile with BG priority
LDA #$C080            ; $C080 mask: A ($0080), B ($8000), or Start ($4000)
ADC #$0010            ; +$10: bottom tile is 16 entries below top in VRAM layout
```

For bitmasks that are tested or set, decompose them when non-obvious:
```
; GOOD: Decomposed mask
BIT #$CF80            ; $CF80 = any navigation or action button
LDA #$CFF0            ; Suppress all auto-repeat ($CFF0)
AND #$03FF            ; Strip palette and priority bits, keep tile index
```

### VRAM Buffer and Address Calculations

The SNES VRAM staging buffer at `$7F0200` with its 64-byte row stride appears throughout dialogue and UI code. Document the formula on first use in a routine:

```
; Compute box content origin: row×32 + column×2 → $099A
XBA
LSR
LSR
CLC
ADC $097A
CLC
ADC $097A
STA $099A
```

For subsequent identical calculations in the same block, a shorter reference suffices:
```
; Same row×32 + col×2 VRAM offset formula
XBA
LSR
LSR
```

### Stack Frame Documentation

For routines that use the stack as a data structure (like `DialogCmd_PrintNumber`), document what each SP-relative offset holds:

```
; Allocate 6-word stack frame for loop state
LDA #$0000
PHA                   ; SP+11: digits-printed flag
PHA                   ; SP+9: digit group index
PHA                   ; SP+7: iteration counter
PHA                   ; SP+5: digit position within group
```

Then reference SP offsets naturally in subsequent comments:
```
LDA $0B, S            ; Leading zero suppression: skip if no digits printed yet (SP+11 = 0)
LDA $09, S            ; More digit groups (SP+9 ≠ 0) or positions (SP+5 > 1) → continue
```

### Writing Block Notes

Block notes provide the architectural overview. They should include:

1. **First line:** System name, address range, and bank number
2. **Section headers:** Use `=== SECTION ===` markers for logical divisions
3. **WRAM variable map:** List key work RAM addresses and their roles
4. **Data format descriptions:** Bytecode formats, tile layouts, packed fields
5. **Algorithm summaries:** How the major subsystems work together
6. **Cross-references:** Related blocks and external dependencies

Example first line:
```
Wide-string dialogue renderer and dialogue box management (254549–256073, Bank 03).
```

### Writing Part Notes

Part notes describe individual routines. Structure them as:

1. **First line:** One-sentence purpose summary
2. **Parameters:** Entry conditions (register values, WRAM state, stack parameters)
3. **Algorithm:** Step-by-step description of what the routine does
4. **Side effects:** WRAM variables modified, flags set/cleared
5. **Return values:** What the caller gets back (registers, carry flag, etc.)

For simple routines, one or two lines suffice. For complex routines, use the full structure. The part note should give enough context that someone can understand the routine's role without reading every instruction.

### The Annotation Workflow

The recommended process for annotating a new block:

1. **Read the standard extraction** — run `npm run extract` and read the entire `.asm` file end-to-end without writing anything. Understand the code's structure, routines, and relationships.
2. **Run location-tagged extraction** — run `npm run extract:lt` to produce address-tagged output. Every uncommented instruction now shows its decimal ROM address as `; {address}`.
3. **Determine the bank** — identify which ROM bank the block lives in (bank = floor(start_address / 65536)).
4. **Write the block note** — architecture, data formats, WRAM variables. Add to `notes/blockNotes/bankNN.json`.
5. **Write part notes** for each routine — purpose, parameters, algorithm. Add to `notes/partNotes/bankNN.json`.
6. **Write inline comments** — read the `extract:lt` output and use the visible `; {address}` tags as JSON keys. Add to `notes/comments/bankNN.json`.
7. **Audit part names** — verify that `names.json` labels accurately describe each routine.
8. **Run standard extraction** — run `npm run extract` (without `lt`) to verify the final output reads naturally with comments replacing the location tags.
9. **Review the extracted ASM** — read it as a consumer would, checking that the comments provide sufficient context without clutter.

> **Why two extraction passes?** The first pass (standard) lets you read the code without visual noise from address tags. The second pass (`extract:lt`) reveals every instruction's address so you can write comment JSON keys accurately. The final verification pass (standard again) confirms the comments appear correctly and flow naturally.

### Verifying Comments After Writing

After modifying any comment JSON files, always run standard extraction to verify:

```bash
cd <baserom-repo>
npm run extract
```

Then open the extracted `.asm` file and read through it. The comments should:
- Appear at the correct instruction (address alignment is correct)
- Not overlap or crowd each other (sufficient spacing between annotated lines)
- Flow naturally when reading the instruction stream top-to-bottom
- Complement (not duplicate) the part notes that appear above each routine

To check coverage, you can also run `npm run extract:lt` — any remaining `; {address}` tags indicate uncommented instructions. This is useful for spotting gaps in complex routines that might benefit from additional annotations.

### Common Pitfalls

1. **Deciding on a comment count before reading the code.** This leads to either under-commenting complex sections or over-commenting simple ones. Let the code determine density.

2. **Commenting every instruction.** This produces visual noise that makes the actually-important comments harder to find. A reader scanning for context will miss the critical comment about the RTS dispatch trick if it's surrounded by "Save Y," "Restore Y," "Return."

3. **Duplicating part note content.** If the part note explains the algorithm, the inline comments should annotate the *execution* — not re-explain the algorithm. The part note says "divides by repeated subtraction"; the inline comment says "Divide by 4 via repeated subtraction to find digit group index."

4. **Forgetting to document magic numbers.** Bare `LDA #$C080` or `CMP #$00FA` with no comment forces the reader to look up what those values mean. Always annotate non-obvious constants.

5. **Not aggregating.** Three consecutive instructions that together compose a tile word (`ORA palette`, `ORA priority`, `STA buffer`) should have one comment at the start, not three separate ones.

6. **Commenting obvious register saves/restores.** `PHP`/`PLP`, `PHY`/`PLY`, `PHB`/`PLB` at routine boundaries are standard calling convention. They don't need comments unless they serve a non-obvious purpose (e.g., `PHX ; Pop PEA'd loop return address — unwinding renderer stack frame`).

7. **Over-commenting branch targets.** `BNE loc_03E509` with the comment "More rows → loop back" is redundant when the structure is already clear from the loop. Save branch comments for non-obvious conditions.

8. **Not reading the extracted output.** Always verify by running extraction and reading the result. Comments that looked good in JSON may not flow well when interleaved with actual assembly.

9. **Computing addresses manually when `extract:lt` is available.** Manual instruction-size counting is error-prone (especially with COP operands and M/X flag tracking). Always use `npm run extract:lt` to get addresses directly from the engine.

---

## Process Improvements and Lessons Learned

This section captures workflow improvements discovered through practical annotation experience.

### Problem: Manual Address Computation Was Error-Prone

The original workflow required counting instruction byte sizes from a known anchor label to compute each comment's decimal address key. This involved:
- Knowing the 65C816 instruction size for every addressing mode
- Tracking M/X flag state to determine 8-bit vs 16-bit immediate sizes
- Looking up COP operand counts from `copdef.json` for every COP instruction
- Converting between hex label addresses and decimal JSON keys

For a file with ~100 instruction lines, this process could easily take 30+ minutes and was the primary source of misaligned comments.

### Solution: Location-Tagged Extraction (`extract:lt`)

The `emitLineTracking` config option (exposed via `npm run extract:lt`) solves this entirely. The engine emits `; {decimal_address}` on every uncommented instruction line, making the JSON key visible in-place. See the [Location-Tagged Extraction](#location-tagged-extraction-extractlt) section for details.

**Impact:** Comment address errors drop to zero. The annotation time for inline comments is reduced to reading the code and deciding *what to say*, not *where to say it*.

### Observation: Comment Placement on the First Instruction of a Group

When a comment explains a multi-instruction logical operation (e.g., "BCD increment jewelsCollected"), place it on the **first instruction** of the group. The `extract:lt` output confirms this naturally — the first instruction's address becomes the JSON key, and subsequent instructions in the group show their own (unused) addresses.

Example from `extract:lt` output:
```asm
    SED                   ; BCD mode: jewelsCollected is packed decimal — SED/CLD bracket
    LDA $jewelsCollected ; {230621}
    CLC  ; {230624}
    ADC #$0001 ; {230625}
    STA $jewelsCollected ; {230628}
    CLD  ; {230631}
```

The comment at the `SED` instruction (address 230620) covers the entire 6-instruction BCD sequence. The remaining `; {address}` tags confirm the addresses are available if finer-grained comments are ever needed.

### Observation: Documenting Repetitive Patterns Efficiently

Many item handlers follow identical structural patterns (check scene → check tiles → activate). The comment authoring guide recommends documenting the first occurrence thoroughly and abbreviating subsequent ones. With `extract:lt`, this becomes even more efficient:

1. Fully annotate the first instance (e.g., UseItem_PrisonKey as the first scene-gated pattern)
2. For subsequent identical patterns, write only the part note — skip inline comments entirely
3. The `extract:lt` addresses remain visible on those uncommented instances, ready if someone later decides to add comments

### Observation: Block Notes and Part Notes Don't Need Addresses

Block notes and part notes are keyed by **name strings** (block names from `blocks.json`, routine labels from `names.json`), not by addresses. This means they can be written entirely from the standard `extract` output — `extract:lt` is only needed for inline comments.

Recommended split:
1. Write block notes and part notes from standard extraction (cleaner reading experience)
2. Switch to `extract:lt` only when writing inline comments

### Future Improvement: Coverage Gap Detection

Running `extract:lt` after writing comments provides a natural coverage audit. Any remaining `; {address}` tags in complex routines indicate uncommented instructions. A simple text search for `; {` in the `extract:lt` output reveals all gaps.

This could be automated with a script that:
1. Runs `extract:lt`
2. Parses the output for `; {address}` tags within routines that already have some comments
3. Reports "partially annotated" routines that may need additional coverage

### Future Improvement: Annotation Validation Tooling

The JSON-keyed annotation system enables straightforward automated validation. These tools don't exist yet but would significantly improve reliability:

**1. Comment address validation (`validate:comments`)**

Check every key in `notes/comments/bankNN.json` against the set of valid instruction addresses from the ROM analysis. Catches:
- Stale comments pointing at addresses where instructions no longer exist (e.g., after `blocks.json` changes)
- Comments pointing at data/string addresses instead of instructions
- Duplicate keys across bank files

```
# Pseudocode
for each address in comments.keys():
  if address not in rom.instructionAddresses:
    warn("Stale comment at {address} — no instruction at this address")
```

**2. Part note name validation (`validate:partNotes`)**

Check every key in `notes/partNotes/bankNN.json` against the union of `names.json` values and auto-generated `code_XXXXXX` labels. Catches:
- Typos in routine names (e.g., `"UseItem_Redjewel"` vs `"UseItem_RedJewel"`)
- Part notes for routines that were renamed or removed
- Missing part notes for named routines (coverage report)

**3. Block note name validation (`validate:blockNotes`)**

Check every key in `notes/blockNotes/bankNN.json` against `blocks.json` keys. Simpler than part notes since block names change less often.

**4. Comment density metrics**

Generate per-block statistics showing comment coverage relative to instruction count. Flag routines with high instruction counts but zero comments — these are candidates for annotation. Would pair naturally with `extract:lt` coverage gap detection.

**5. Diff-aware comment migration**

When `blocks.json` or `overrides.json` changes cause addresses to shift, a tool could detect affected comment keys and suggest updates. This is harder to implement but would prevent silent comment misalignment after structural changes.

### Future Improvement: Structured Comment Storage

The current flat `Record<string, string>` format is simple and works well, but has limitations:

- **No metadata**: Can't distinguish a magic-number comment from an algorithm comment
- **No grouping**: Can't express "these 5 comments are a logical group covering one algorithm"
- **No ordering guarantee**: JSON object key order isn't guaranteed (though in practice it's preserved)

A potential evolution would be a structured format:

```json
{
  "230620": { "text": "BCD mode: jewelsCollected is packed decimal", "group": "bcd_increment" },
  "230621": { "group": "bcd_increment" }
}
```

This would enable tools like "collapse all comments in group X" or "validate that grouped comments are contiguous." However, the added complexity may not be worth it — the current freeform strings with the "comment at first instruction" convention achieve similar grouping implicitly.

### Future Improvement: Agent-Optimized Comment Workflow

The current workflow requires the agent to:
1. Read `extract:lt` output (large files)
2. Mentally note which addresses need comments
3. Write JSON with those addresses as keys
4. Re-extract to verify

An optimized flow could provide the agent with a **diff-oriented view** — only showing uncommented instructions in complex routines, with surrounding context. This would reduce the amount of text the agent needs to process when annotating a file that's partially documented.

Another option: a tool that accepts comments in a more natural format (e.g., inline in the ASM after the `; {address}` tag) and converts them to JSON. The agent could edit the `extract:lt` output directly, replacing `; {230620}` with `; BCD mode: packed decimal`, and a converter would parse the file and produce the corresponding `notes/comments/bankNN.json` entries. This would eliminate the JSON key-value authoring step entirely.

### Checklist: Annotating a New Block

Quick reference for the complete annotation workflow:

- [ ] Run `npm run extract` and read the entire `.asm` file
- [ ] Identify all routines and their relationships
- [ ] Determine the bank number (floor(start_address / 65536)) — all notes go in `bankNN.json` files
- [ ] Write the block note in `notes/blockNotes/bankNN.json`
- [ ] Write part notes for all named routines in `notes/partNotes/bankNN.json`
- [ ] Run `npm run extract:lt` to get address-tagged output
- [ ] Write inline comments in `notes/comments/bankNN.json`, using `; {address}` values as keys
- [ ] Verify `names.json` labels match part note keys exactly
- [ ] Run `npm run extract` (standard) and review the final output
- [ ] Read the file top-to-bottom as a consumer — does it flow? Are the comments helpful without being noisy?

### Checklist: Auditing Existing Comments

Quick reference for verifying existing annotations:

- [ ] Run `npm run extract:lt` and open the target `.asm` file
- [ ] For each commented line, verify the adjacent `; {address}` tags form a consistent sequence (no gaps or overlaps)
- [ ] Check that comments on independent instructions describe only their own operation (no multi-instruction descriptions on single COP commands)
- [ ] Verify part note keys match `names.json` labels exactly (case-sensitive)
- [ ] Check that block note key matches the block name in `blocks.json` and is in the correct bank file
- [ ] Look for `; {address}` tags in complex routines — these are uncommented lines that may need annotation
- [ ] Re-read comments as a consumer — do they add value? Are any just restating the instruction?
