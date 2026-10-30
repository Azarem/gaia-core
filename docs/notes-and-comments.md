# Notes and Comments System

> **Process rule: only two scripts change notes and names, and agents never write their own.**
> - Notes and comments: `npm run merge -- <spec.json>` ([Notes Merge](#implemented-notes-merge-npm-run-merge)).
> - Names (`db-us/names/bankNN.json`): `npm run names -- <spec.json>` ([Names Merge](#implemented-names-merge-npm-run-names)).
>
> The `ingest` and `annotate` commands were **removed** (they read the extracted `.asm` back into `notes/`, so a stale or line-tracked extract silently overwrote or duplicated notes). Do not recreate them. If `merge` or `names` lacks a feature, extend it in `src/` and document it here; do not write a throwaway `.py`/`.mjs`/`.sh` script.

The GaiaLabs engine provides a three-tier annotation system for documenting disassembled ROM code. Annotations are stored as JSON files in a `notes/` directory at the **baserom project root** and are **inserted into the extracted `.asm` files during extraction**. They are not embedded in the ROM itself — they are a documentation layer that lives alongside the database files (`blocks.json`, `overrides.json`, `names/bankNN.json`).

**Names are the companion layer.** The labels that part notes attach to live in `db-us/names/bankNN.json`, split by ROM bank exactly like the notes. Unlike notes, names are *functional* — they change the labels the engine emits and resolves — so they are bundled into the published package. See [Names](#names-db-usnamesbanknnjson).

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

**How they appear in extracted ASM:** Block notes are emitted at the very top of the `.asm` file, before the `?BANK` directive (when the file has one; movable blocks do not) and `?INCLUDE` list. Each line of the note is prefixed with `; ` and followed by a separator line:

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

**File format:** Each bank file is a flat JSON object mapping part/routine names (matching entries in `db-us/names/bankNN.json` or auto-generated `code_XXXXXX` labels) to documentation strings:

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

**Compressed struct files (sprite maps etc.):** These files are extracted in an isolated pass with locations 0-oriented to the file, so the same offset (`sprite_set_000004`) exists in many files. Every *generated* name in such a file is therefore prefixed with the file name: `{fileName}_{generatedName}`, e.g. `spm_credits_sprite_set_00002A`, `spm_credits_sprite_group_000150`, `spm_credits_loc_0001F0`. The root part (location 0) keeps the bare file name (`spm_credits`). Key part notes for these files by the prefixed name. Names you supply yourself (names files, part names in `blocks.json`) are never prefixed. Uncompressed struct files and block parts use absolute ROM locations, are not affected, and keep `sprite_set_0F8076`-style names.

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

1. Start from a known anchor (a named label in `db-us/names/bankNN.json` or a `loc_XXXXXX` label in the ASM, where `XXXXXX` is the hex address)
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

All three annotation tiers are stored in a `notes/` directory at the baserom project root, split by ROM bank. Names follow the same bank split under `db-us/names/` (see [Names](#names-db-usnamesbanknnjson)):

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
  db-us/
    names/
      bank00.json        ← names (address → label) for Bank 00 addresses
      bank01.json        ← names for Bank 01 addresses
      ...                ← one file per bank that contains names
```

### Bank assignment

Each annotation goes into the bank file corresponding to the code it documents:

- **Block notes:** The bank is determined by the block's start address in `blocks.json`. For blocks without a direct `start` field (only nested `parts`), use the bank of the first part.
- **Part notes:** The bank is determined by the routine's address (the key of its entry in `db-us/names/bankNN.json`). For routines within a block, they share the block's bank.
- **Names:** The bank is determined directly from the decimal address key (bank = floor(address / 65536)), exactly like comments.
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
    names?: Record<number, string>;       // Address → label name (baserom merges names/bankNN.json)
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

## Names (`db-us/names/bankNN.json`)

**Scope:** One label per ROM address — the primary human interface to the disassembly.

**Location:** `db-us/names/bankNN.json` — one file per ROM bank, where `NN` is the two-digit hex bank number (e.g., `bank00.json`, `bank0A.json`). Only banks that contain names have a file.

**File format:** Each bank file is a flat JSON object mapping decimal ROM addresses (as string keys) to label names. Keys are sorted ascending, indented with 4 spaces, and the file ends with a newline:

```json
{
    "32768": "ResetVector",
    "32775": "CopVector",
    "32779": "NmiVector",
    "33901": "CopDispatch"
}
```

**Bank assignment:** The bank is computed from the key itself — bank = floor(address / 65536) — so there is never a judgement call. Every key in `bankNN.json` must satisfy `address >> 16 === 0xNN`. The table above (Bank assignment) applies; Illusion of Gaia currently has names in banks 00–0C.

**How they appear in extracted ASM:** A name replaces the auto-generated `code_XXXXXX` label at that address. Part notes are then keyed by the name string (see [Relationship to Names](#relationship-to-names)).

**Names are not notes.** They share the bank-split layout, but behave differently:

| | Notes (`notes/`) | Names (`db-us/names/`) |
|--|-------------------|------------------------|
| Effect on rebuild | None (comments stripped) | Functional — labels are resolved by the assembler |
| In the npm package | No (`notes/` is not in `files`) | Yes (bundled into `dist`) |
| Loading | Filesystem discovery of every `.json` in each subdirectory | **Explicit static imports** in `src/names.ts` |
| Missing / new bank file | Auto-discovered; absent directory → `{}` | A new file is ignored until it is imported; a deleted file breaks the build |
| Edited by | `npm run merge` | `npm run names` (not touched by merge) |

### How loading works

Because names must ship in the package, the baserom cannot discover them at runtime with `readdirSync` — `db-us/` is not published, only the bundled output is. Instead, `src/names.ts` imports every bank file with a static JSON import and merges them into one flat dictionary:

```typescript
import bank00 from '../db-us/names/bank00.json' with { type: 'json' };
import bank01 from '../db-us/names/bank01.json' with { type: 'json' };
// ... one import per bank file

const bankNames: Record<string, string>[] = [bank00, bank01 /* , ... */];

export const names: Record<string, string> = Object.assign({}, ...bankNames);
```

`src/index.ts` imports `names` from `./names.ts` and passes it as `names` in the `DbGameRomModule`. The engine (`DbRootUtils.fromGameModule()`) only ever sees the merged dictionary, so **it does not know or care about the split** — the same engine works with a single `names.json` (Robotrek still uses one) or a per-bank directory.

The bank-detection helpers shared with `merge` also read `db-us/names/*.json` directly (every file in the directory) to build its name → bank fallback for bank detection, and `db-us/blocks.json` + `db-us/files.json` to build the primary block-name → bank lookup (`loadDbBankLookup`).

### Adding or renaming a name: `npm run names`

Names (and renames) are changed only with `npm run names -- <spec.json> [--dry-run] [--local-only]`. **Do not write an ad-hoc script and do not hand-edit the bank files**: the command keeps the files sorted and in the right bank, validates the change, and carries the rename into notes, patches and docs in one all-or-nothing pass. See [Names Merge](#implemented-names-merge-npm-run-names).

### Adding a new bank file

A missing `bankNN.json` is created by `npm run names` and imported in `src/names.ts` for you. Doing it by hand (only if you must) means:

1. Create `db-us/names/bankNN.json` containing the names for that bank
2. Add the matching `import` line and array entry in `src/names.ts` — unlike notes, **this step is required**; a bank file that is not imported is silently ignored by the build

### Validating the split

After bulk edits, check that every key is in the correct bank file, files are sorted and formatted, no address or label is duplicated across files, and every bank file is imported in `src/names.ts`:

```bash
npm run names -- --check
```

It prints `Names check: OK (<n> names)` or lists each problem and exits non-zero. Never write a script for this.

## Relationship to Names

The per-bank names files provide the label names that both part notes and comments reference:

- **Part notes** are keyed by the label name string (e.g., `"RunCombatCollision"`) — this must match exactly what appears in a `db-us/names/bankNN.json` value or what the engine auto-generates as `code_XXXXXX`
- **Comments** are keyed by the decimal address (e.g., `"244708"`) — this is the same address space as the names keys
- **Block notes** are keyed by the block name from `blocks.json` (e.g., `"combat_collision"`)

When documenting a block, all three note types should be updated together in their respective `bankNN.json` files, and any renamed routines in `db-us/names/bankNN.json`, to maintain consistency.

## Name Auditing

Names are not just labels — they are the primary human interface to the disassembly. A misleading name is worse than a generic auto-generated one, because it actively misdirects anyone reading the code. Name auditing should be part of every documentation pass.

There are **three distinct naming layers** that may need auditing. Each layer controls a different scope of labels in the extracted `.asm` output:

| Layer | File | Controls | Generic patterns |
|-------|------|----------|-----------------|
| **Block names** | `blocks.json` | Top-level block keys and `.asm` filenames | `actor_XXXXXX`, `sF7_actor_XXXXXX`, `func_XXXXXX`, `dm_func_XXXXXX` |
| **Part names** | `blocks.json` | Keys within a block's `"parts": {}` — routine headers for explicitly mapped pieces | `func_XXXXXX`, `sub_XXXXXX`, `binary_XXXXXX`, `e_actor_XXXXXX` |
| **Code names** | `db-us/names/bankNN.json` | Labels for auto-discovered code pieces (not in `blocks.json` parts) | `code_XXXXXX`, `loc_XXXXXX` |

Understanding which layer controls a given label is essential — renaming in the wrong file has no effect.

### How the engine resolves label names

1. **`blocks.json` parts** take first priority. If a piece is explicitly defined as a part in `blocks.json`, its **key name in the JSON** becomes the label in the extracted `.asm`. These appear as `func_XXXXXX`, `sub_XXXXXX`, `binary_XXXXXX`, `actor_XXXXXX`, and `e_actor_XXXXXX` prefixed labels.

2. **`db-us/names/bankNN.json`** provides labels for auto-discovered pieces — code the engine finds through reference tracing and branch analysis that is **not** explicitly mapped in `blocks.json` parts. These appear as `code_XXXXXX` prefixed labels when unnamed. A names entry at the piece's start address (in the bank file for that address) overrides the auto-generated `code_XXXXXX` label.

3. **`overrides.json`** does **not** support naming. The `"name"` key in overrides is deprecated and non-functional. Do not use it.

**Key implication:** If you see a `func_08D7EA` label in the `.asm` output and add an entry to `db-us/names/bankNN.json` at that address, it will have **no effect** — because that label comes from a `blocks.json` part key, which takes precedence. To rename it, you must change the key in `blocks.json`.

### When to audit names

After reading a routine's code and writing its part note, verify that the name accurately describes what the routine actually does. Common issues to look for:

- **Generic auto-generated names** (`code_00A1B0`, `sub_00B234`, `actor_08B577`) — replace with descriptive names once you understand the routine's purpose
- **Misleading names** — a routine named `SetPosition` that actually applies an orbital offset should be renamed to `ApplyOrbitalOffset` to reflect its true behavior
- **Inconsistent naming conventions** — mixing `camelCase` and `snake_case` within the same functional group, or inconsistent verb prefixes (`Do_` vs `Run_` vs `Execute_`)
- **Names that describe the mechanism, not the purpose** — `WriteThreeBytes` is less useful than `SetEntryFar`
- **Inaccurate counts or scope in block notes** — if a block note says "14 handlers" but the file contains 30, the names (and block note) need updating

### Auditing block names in blocks.json

Block names are the top-level keys within each group in `blocks.json`. They control both the label used in code and the extracted `.asm` filename. Generic block names follow patterns like:

- `actor_XXXXXX` — unnamed actor definition
- `sF7_actor_XXXXXX` — scene-prefixed actor (ending scene F7)
- `func_XXXXXX` — unnamed standalone function
- `dm_func_XXXXXX` — area-prefixed unnamed function (diamond mine)
- `binary_XXXXXX` — unnamed data block
- `misc_actors_XXXXXX` — generic multi-actor block
- `crF7_proc_XXXXXX` — scene-prefixed thinker process

**How to find generic block names:**

```python
import json, re
with open('db-us/blocks.json') as f:
    blocks = json.load(f)

# Match: optional scene prefix + generic type + hex address
generic_pat = re.compile(
    r'^([a-z]{1,4}\d*_)*(actor|func|sub|binary|code|loc|'
    r'e_actor|dm_func|misc_actors|proc)_[0-9A-Fa-f]{4,}'
)

for group_name, group_data in blocks.items():
    if isinstance(group_data, dict):
        for block_name, block_data in group_data.items():
            if isinstance(block_data, dict) and generic_pat.match(block_name):
                print(f'{group_name}/{block_name}')
```

**How to rename a block:**

1. Read the extracted `.asm` file for the block — understand what it does
2. Choose a descriptive name following the naming conventions below
3. **Preserve the scene/area prefix** if present (e.g., `sF7_`, `ec12_`, `gw85_`, `dm41_`) — these encode the scene ID and area, which is valuable organizational context
4. Use a targeted string replacement in `blocks.json` — replace `"old_name":` with `"new_name":` (include the colon to avoid partial matches)
5. **Do not use `json.dump()`** to rewrite the entire file — this destroys the compact formatting. Use string replacement or a formatting-preserving script
6. Update the names entry (`db-us/names/bankNN.json`, bank = floor(start / 65536)) if the block's start address needs a matching label
7. Run `npm run extract` to verify the rename propagated correctly

**Example renames:**

| Before | After | Rationale |
|--------|-------|-----------|
| `actor_08B577` | `camera_delta_oscillator` | Increments/decrements cameraDeltaY based on facing |
| `sF7_actor_09DFF8` | `sF7_credits_player` | Credits scene player character with timeline choreography |
| `ec12_actor_09BF6B` | `ec12_aqueduct_dark_space` | Spawns dark space portal after flag check |
| `func_09BB17` | `CollisionLayerRenderer` | Reads scroll state and renders collision tilemap |
| `dm_func_0ADB6B` | `dm_follower_behavior` | Diamond mine follower NPC using smooth_follow |
| `binary_0BACB4` | `mummy_queen_angle_table` | 8-byte angle lookup for mummy queen boss |

**⚠ Critical formatting rule:** `blocks.json` uses a specific compact format where simple blocks are one line and complex blocks (with parts) are multi-line. Never load and re-dump the entire file with `json.dump()` — this reformats everything. Instead, use targeted string replacement:

```python
with open('db-us/blocks.json', 'r') as f:
    content = f.read()
content = content.replace('"old_block_name":', '"new_block_name":', 1)
with open('db-us/blocks.json', 'w') as f:
    f.write(content)
```

### Auditing part names in blocks.json

Part names are the keys within a block's `"parts": {}` object. They control labels for explicitly mapped code/data pieces. When a block has parts, each part key becomes the label in the extracted `.asm`. Generic part names follow the same patterns as block names (`func_XXXXXX`, `sub_XXXXXX`, `binary_XXXXXX`, `e_actor_XXXXXX`).

**How to find generic part names:**

```python
def scan_parts(data, path=''):
    for key, value in data.items():
        if isinstance(value, dict):
            if 'parts' in value:
                for part_name in value['parts']:
                    if generic_pat.match(part_name):
                        print(f'{path}/{key}/parts/{part_name}')
            scan_parts(value, f'{path}/{key}' if path else key)

scan_parts(blocks)
```

**How to rename a part:**

1. Read the code at the part's address range to understand what it does
2. Rename the key in `blocks.json` using targeted string replacement (same formatting rules as block renames)
3. Add a corresponding entry in `db-us/names/bankNN.json` mapping the part's start address (decimal) to the new name — bank = floor(address / 65536)
4. Update any part notes in `notes/partNotes/bankNN.json` to use the new key
5. Run `npm run extract` to verify

**When to defer part renames:** During a block-level audit pass, focus on block names. Part names can be deferred to the full per-file annotation audit, where you're already reading each routine in detail and writing part notes.

### Auditing code names in db-us/names/

Code names are entries in `db-us/names/bankNN.json` that label auto-discovered pieces. These are the most common rename target because the engine generates large numbers of `code_XXXXXX` labels automatically.

**How to update a name:**

1. Open the bank file for the routine's address (`db-us/names/bankNN.json`, where bank = floor(address / 65536))
2. Find the address entry (decimal key) for the routine you want to rename
3. Change the value string to the new name
4. **Update the corresponding part note key** in `notes/partNotes/bankNN.json` to match the new name exactly
5. Run `npm run extract` to verify the new label appears correctly in the `.asm` output

**Critical:** Part notes are keyed by the name string. If you rename an address in `db-us/names/bankNN.json` from `"OldName"` to `"NewName"`, you **must** also rename the key in `partNotes/bankNN.json` from `"OldName"` to `"NewName"`. Mismatched keys result in orphaned part notes that never appear in the extracted output. Comments are unaffected by renames because they are keyed by decimal address.

### Names ↔ notes coordination table

| Change | blocks.json | names/bankNN.json | partNotes | comments |
|--------|------------|-----------|-----------|----------|
| Rename a block | Update block key | Add/update start address entry | No change (keyed by block name, not parts) | No change |
| Rename a part | Update part key | Add/update start address entry | Rename key to match | No change |
| Rename a code piece | No change | Update value | Rename key to match | No change (keyed by address) |
| Add a new name | No change | Add entry | Add part note with matching key | No change |
| Remove a name | No change | Remove entry | Remove or keep orphaned note | No change |
| Split a routine | May add new parts | Add new name entries | Add new part notes | May need address reassignment |

### Rename propagation checklist

When renaming a block, part, or code piece, **all references to the old name must be updated across multiple files**. Missing any step creates "orphaned" notes — annotations that exist in JSON but never appear in the extracted `.asm` because their key no longer matches any entity.

**Block rename (key in `blocks.json` top-level within a group):**

1. Rename the key in `blocks.json` via targeted string replacement
2. Add/update the `db-us/names/bankNN.json` entry at the block's start address
3. Rename the key in `notes/blockNotes/bankNN.json`
4. Find-and-replace the old name inside the **text content** of all `notes/` JSON files (block notes, part notes, and comments may reference the old name in their description text)
5. Run `npm run extract` to verify

**Part rename (key within a block's `"parts": {}` in `blocks.json`):**

1. Rename the part key in `blocks.json` via targeted string replacement
2. Add/update the `db-us/names/bankNN.json` entry at the part's start address
3. Rename the key in `notes/partNotes/bankNN.json` (find the entry under the parent block's key group)
4. Find-and-replace the old name inside the **text content** of all `notes/` JSON files
5. Run `npm run extract` to verify

**Code name rename (value in `db-us/names/bankNN.json`):**

1. Update the value in `db-us/names/bankNN.json`
2. Rename the key in `notes/partNotes/bankNN.json`
3. Find-and-replace the old name inside the **text content** of all `notes/` JSON files
4. Run `npm run extract` to verify

**Bulk rename verification script:**

After any batch of renames, run this check to detect orphaned note keys:

```python
import json, os, re

with open('db-us/blocks.json', encoding='utf-8') as f:
    blocks_data = json.load(f)
names = {}
for fname in sorted(os.listdir('db-us/names')):
    if fname.endswith('.json'):
        with open(f'db-us/names/{fname}', encoding='utf-8') as f:
            names.update(json.load(f))

# Collect all valid block names, part names, and named code labels
block_names = set()
part_names_by_block = {}  # block_name -> set of part names
name_values = set(names.values())

for category, cat_data in blocks_data.items():
    if isinstance(cat_data, dict):
        for bname, bdata in cat_data.items():
            if isinstance(bdata, dict):
                block_names.add(bname)
                if 'parts' in bdata and isinstance(bdata['parts'], dict):
                    part_names_by_block[bname] = set(bdata['parts'].keys())

# Check block notes
for fname in sorted(os.listdir('notes/blockNotes')):
    if not fname.endswith('.json'): continue
    with open(f'notes/blockNotes/{fname}', encoding='utf-8') as f:
        for key in json.load(f):
            if key not in block_names:
                print(f'ORPHANED blockNote: {fname}: "{key}"')

# Check part notes
for fname in sorted(os.listdir('notes/partNotes')):
    if not fname.endswith('.json'): continue
    with open(f'notes/partNotes/{fname}', encoding='utf-8') as f:
        for key in json.load(f):
            if key in block_names: continue  # Valid block-level part note
            if key in name_values: continue  # Valid named code piece
            if any(key in parts for parts in part_names_by_block.values()):
                continue  # Valid part name
            print(f'ORPHANED partNote: {fname}: "{key}"')
```

**Stale text reference detection:**

Old names can also appear inside note *text content* (e.g., a block note that says "calls func_08D7EA"). After renames, scan for stale references:

```python
# Build old-name -> new-name mapping from db-us/names/
old_to_new = {}
for addr, name in names.items():
    hex_addr = format(int(addr), '06X')
    for prefix in ['code_', 'func_', 'sub_', 'binary_', 'loc_',
                    'actor_', 'e_actor_', 'dialogstring_']:
        old_label = f'{prefix}{hex_addr}'
        if old_label != name:
            old_to_new[old_label] = name

# Scan all note files for stale references
for note_dir in ['notes/partNotes', 'notes/blockNotes', 'notes/comments']:
    for fname in sorted(os.listdir(note_dir)):
        if not fname.endswith('.json'): continue
        with open(f'{note_dir}/{fname}', encoding='utf-8') as f:
            content = f.read()
        for old_label, new_name in old_to_new.items():
            if old_label in content:
                print(f'STALE REF: {note_dir}/{fname}: {old_label} -> {new_name}')
```

⚠ **When replacing old names in text content**, beware of substring matches. If `actor_0BC9BD` is replaced with `sFC_title_start_poll`, but the text already contains `sFC_title_start_poll`, you'll get the double-prefix `sFC_sFC_actor_0BC9BD`. Use word-boundary-aware replacement or check for existing prefixes before replacing.

### Naming conventions

Follow the conventions established in the existing codebase:

| Category | Convention | Examples |
|----------|-----------|----------|
| COP handlers | `VerbNoun` camelCase | `SetEntryHere`, `JumpAfterDelay`, `BranchOnFlagByte` |
| Internal subroutines | Descriptive `VerbNoun` | `BuildSineHdmaTable`, `ApplyOrbitalOffsetFromRef` |
| JSL export helpers | `VerbNoun_Scope` | `SetEventFlag_0200`, `TestWramFlag_Offset100` |
| Data tables | `lowercase_snake_case` | `bitmasks_bit_position`, `cop_dispatch_table` |
| Actor/scene blocks | `{prefix}_{descriptive_name}` | `sc01_seagull`, `gw85_retractable_gate`, `sF7_credits_player` |
| Boss subroutines | `BossNameVerb` | `CastothAttackLoop`, `VampireMainAI` |
| Engine subsystems | `VerbNoun` or `NounVerb` | `RunCombatCollision`, `UpdateFrameRender` |
| Unused code | `unused_` prefix | `unused_debug_mode`, `unused_null_actor` |
| Standalone functions | `VerbNoun` camelCase | `ActorDisplayModeSwap`, `EnemyInitBasic`, `RandomPlayerOffset` |
| Binary data | `descriptive_snake_case` | `mummy_queen_angle_table`, `enemy_stats_def` |

**Scene/area prefixes:** Many blocks carry a scene prefix like `sc01_`, `gw85_`, `sF7_`, `dm41_`. These encode the scene ID (hex) and area abbreviation. **Always preserve these prefixes** when renaming — they provide essential organizational context. Only the generic `actor_XXXXXX` / `func_XXXXXX` suffix should be replaced with a descriptive name.

## Summary

| Tier | Directory | Key Type | Value | Insertion Point |
|------|-----------|----------|-------|-----------------|
| Block | `notes/blockNotes/bankNN.json` | Block name (string) | Multi-line documentation | Top of `.asm` file, before `?BANK` |
| Part | `notes/partNotes/bankNN.json` | Routine label (string) | Multi-line documentation | Before routine label in `.asm` |
| Line | `notes/comments/bankNN.json` | Decimal ROM address (string) | Single-line comment | End of instruction line, padded to col 25 |
| Name | `db-us/names/bankNN.json` | Decimal ROM address (string) | Label name | Label at that address (replaces `code_XXXXXX`) |

The three note tiers are injected during extraction, stripped during rebuild, and stored as plain JSON in the `notes/` directory at the baserom project root. The `notes/` directory is excluded from the npm package — annotations are only available in local/cloned repos. Names are stored in `db-us/names/`, are functional (they drive the labels in both extract and rebuild), and ship with the package.

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
2. **Count and catalog** — count every named routine in the file. Note `?INCLUDE` directives that pull in other blocks. Verify the block note's handler/routine count matches reality.
3. **Run location-tagged extraction** — run `npm run extract:lt` to produce address-tagged output. Every uncommented instruction now shows its decimal ROM address as `; {address}`.
4. **Determine the bank** — identify which ROM bank the block lives in (bank = floor(start_address / 65536)).
5. **Audit names** — check every label in `db-us/names/bankNN.json` for accuracy against the code you just read. Rename generic (`code_XXXXXX`) or misleading labels. See [Name Auditing](#name-auditing).
6. **Write an edit spec** — describe the block note, part notes (by label) and inline comments (by `{address}` tag) as JSON. See [Notes Merge](#implemented-notes-merge-npm-run-merge). Use `"expect"` on comments to guard against a wrong address.
7. **Run `npm run merge -- <spec.json> --dry-run`, then without `--dry-run`** — the tool validates every edit against the extracted `.asm`, writes the entries straight into `notes/` JSON, and re-reads the files to verify them. The `.asm` is not edited and no manual JSON editing is required. Do not use `annotate` or `ingest`.
8. **Re-run `npm run extract:lt`** (or plain `npm run extract`) — the extractor re-reads `notes/`, so this is the verification: read the output to confirm the notes and comments render as intended.
9. **Review the extracted ASM** — read it as a consumer would, checking that the comments provide sufficient context without clutter.

> **Why merge?** `merge` turns "what to say and where" directly into `notes/` JSON entries, so no one hand-formats notes, hand-edits JSON, or writes edit scripts, and there is no `.asm` round-trip to go wrong. It is the only supported way to change notes and comments. See [Notes Merge](#implemented-notes-merge-npm-run-merge).

### Verifying Comments After Writing

After running `npm run merge` (or modifying any comment JSON files manually), always run standard extraction to verify:

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

### ⚠ STOP — Read Before Bulk-Modifying Comment JSON Files

**If you are about to write a script that modifies more than 10 comment entries at once, STOP.** Read the [Critical Rules for Comment JSON Manipulation](#critical-rules-for-comment-json-manipulation) section first. Bulk comment manipulation has caused the loss of ~1,000 valid entries. The rules exist to prevent this from happening again.

> **Exception:** `npm run merge` is the sanctioned way to change many entries at once. `merge` touches only the entries named in its spec, validates every address and label before writing, never empties or rewrites whole JSON files, and verifies the outcome. The rules below still apply to any *other* script that touches `notes/` JSON.

**Minimum safety protocol:**
1. Ask the user to `git commit` the current state before ANY bulk changes (agents must never commit)
2. Never empty JSON files
3. Never bulk-shift addresses
4. Verify each change individually via `extract:lt` output

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

## Critical Rules for Comment JSON Manipulation

These rules exist because violations caused the loss of ~1,000 valid comment entries during a cleanup attempt. **Follow them without exception.**

### Rule 1: NEVER empty comment JSON files

The `extract:lt` mode emits **both** the `{address}` tag AND the existing comment on the same line:

```asm
    LDA $00B2             ; {39414} Check if VRAM DMA is pending
    BEQ loc_0099FE        ; {39417} No DMA pending: continue
    PLA                   ; {39419}
```

Lines WITH a comment show: `; {address} comment text`
Lines WITHOUT a comment show: `; {address}`

You can verify any comment by reading the extract:lt output directly. There is **no reason** to empty the JSON files to build a "clean" address map. Emptying and re-extracting destroys the ability to compare old vs. new state and risks data loss if the empty files are not properly restored.

### Rule 2: NEVER do bulk address shifting

If comments appear to be at wrong addresses, **do not** write a script to shift them all by ±1/±2. This was the primary cause of data loss. What happens:

1. Two comments exist at addresses N and N+1 for the same instruction (one correct, one off-by-one)
2. The "fix" script shifts N+1 → N+2, which is a DIFFERENT instruction
3. The good comment at N is now paired with a nonsensical comment at N+2
4. Or worse: the script deduplicates and keeps the WRONG one

**Instead:** Verify each suspect comment individually by reading the `extract:lt` output. The correct address is visible right there. Fix one at a time.

### Rule 3: Always snapshot before bulk modifications

Before running ANY script that modifies comment JSON files, **ask the user to commit**. Only the user is allowed to run `git commit`. The agent must never commit on its own.

Prompt the user:
> "Please commit the current state before I proceed: `git add notes/ && git commit -m 'snapshot: pre-audit'`"

Wait for confirmation before continuing. This allows instant rollback if a script damages the data. Without this, recovery requires manually reconstructing hundreds of entries.

### Rule 4: Comments without extract:lt tags are for auto-discovered files

Many comments are at addresses that will NOT appear as `{address}` tags in the `extract:lt` output. These are for **auto-discovered files** — assembly files without explicit `?BANK` directives that the engine finds through code analysis. Examples include actor scripts, thinker scripts, and shared function files.

These comments are **valid and correct**. Do not delete them just because they don't match a tagged address. If you can't verify a comment via extract:lt, leave it alone.

### Rule 5: Read the extract:lt output — don't build parallel data structures

The extract:lt output IS the verification tool. For every instruction with a comment, it shows:
```
    INSTRUCTION           ; {address} comment text
```

Read this output and visually verify that the comment describes the instruction. Do not:
- Build a separate Map/Set of addresses from the extract output
- Write scripts that compare JSON keys against address sets
- Attempt to "reconcile" two data sources

These parallel approaches introduce their own bugs (regex mismatches, path resolution errors, file encoding issues) that compound into data loss.

### Rule 6: One file at a time, verify as you go

When adding comments to a file:

1. Run `extract:lt` and read the target file
2. Note the `{address}` values on uncommented lines
3. Add comments to the JSON using those exact addresses
4. Run `extract:lt` again and verify the new comments appear on the correct instructions
5. Only then move to the next file

Do NOT batch-add comments for 10 files and then verify. Errors in one batch contaminate the next.

---

## Process Improvements and Lessons Learned

This section captures workflow improvements discovered through practical annotation experience.

### Problem: Address Contamination Across Overlapping Files

Multiple engine files can occupy overlapping address ranges. For example, in Bank 00:
- `cop_handlers_solid.asm`: 34382–46208
- `cop_handlers_flags.asm`: 45150–46336
- `actor_pool.asm`: 44864–46367

When adding comments for one file using addresses read from a DIFFERENT extract:lt run (where comments shifted the tags), the addresses can land in a completely different file's range. This caused ~107 movement handler comments to overwrite flag handler addresses.

**Prevention:** Always read addresses from the CURRENT extract:lt output. Never carry addresses across extraction runs. If you add comments and re-extract, the tags shift — re-read the fresh output.

### Problem: Off-by-One Address Cascades

When the extract:lt output has a comment on line N, the `{address}` tag on that line is consumed by the comment display. If you read the NEXT line's tag (N+1) and mistakenly assign it to the comment you're writing for line N, every subsequent comment is shifted by one instruction. This cascading off-by-one affected ~500 entries.

**Prevention:** The `{address}` tag on a commented line is STILL VISIBLE in the extract:lt output — it appears as `; {39414} existing comment text`. Read the address from the SAME line you're annotating, not from adjacent lines.

### Problem: Manual Address Computation Was Error-Prone

The original workflow required counting instruction byte sizes from a known anchor label to compute each comment's decimal address key. This involved:
- Knowing the 65C816 instruction size for every addressing mode
- Tracking M/X flag state to determine 8-bit vs 16-bit immediate sizes
- Looking up COP operand counts from `copdef.json` for every COP instruction
- Converting between hex label addresses and decimal JSON keys

For a file with ~100 instruction lines, this process could easily take 30+ minutes and was the primary source of misaligned comments.

### Solution: Location-Tagged Extraction (`extract:lt`)

The `emitLineTracking` config option (exposed via `npm run extract:lt`) solves this entirely. The engine emits `; {decimal_address}` on every uncommented instruction line, making the JSON key visible in-place. See the [Location-Tagged Extraction](#location-tagged-extraction-extractlt) section for details.

**Impact:** Comment address errors drop to zero. The annotation time for inline comments is reduced to reading the code and deciding *what to say*, not *where to say it*. Combined with `npm run merge`, agents give the address in a JSON spec and the tool validates it against the tag.

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

Block notes and part notes are keyed by **name strings** (block names from `blocks.json`, routine labels from `db-us/names/bankNN.json`), not by addresses. This means they can be written entirely from the standard `extract` output — `extract:lt` is only needed for inline comments.

With `merge`, the simplest workflow is:
1. Run `extract:lt` (provides both name structure and address tags in one pass)
2. Write one spec with all three tiers (`blockNote`, `partNotes`, `comments`) per file
3. Run `npm run merge -- <spec.json>` — the tool handles all three tiers simultaneously

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

Check every key in `notes/partNotes/bankNN.json` against the union of `db-us/names/bankNN.json` values and auto-generated `code_XXXXXX` labels. Catches:
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

### Implemented: Notes Merge (`npm run merge`)

`merge` is the **only way to change notes and comments**. It takes a JSON edit spec and writes each entry **directly into `notes/blockNotes`, `notes/partNotes` and `notes/comments`**; the extracted `.asm` is never edited. The whole process is three steps:

```bash
cd <baserom-repo>
npm run extract:lt                              # 0. labels and {address} tags to validate against
# 1. create the spec, e.g. plans/extracted-audit/edits/I021.json (Write tool, whole file)
npm run merge -- <spec.json> --dry-run          # 2. validate and preview (optional but cheap)
npm run merge -- <spec.json>                    #    write notes/*.json and verify
npm run extract:lt                              # 3. the extractor re-reads notes/: verify the output
```

The command exits non-zero on any error, so it can gate a script.

**Spec format:** see [Merge spec format](#merge-spec-format-and-iteration-files) (`blockNote`, `partNotes`, `comments`; string or array = set, `null` or an empty string = remove; `"expect"` guard on comments; top-level keys starting with `_` or `$` ignored). Re-applying a full-text spec is safe and reports `=unchanged`. The `.asm` is only **read**, to validate the spec, so the result shows in `extracted/` after the next `extract` / `extract:lt`.

**Partial edits (`merge` only):** to change part of an existing block or part note without pasting the whole text again, give an `edit` list instead of the text:

```json
"blockNote": { "edit": [
  { "find": "8 bytes nothing reads", "with": "the two collision boxes" },
  { "find": "=== SPRITES (", "until": "=== NOTES ===", "with": "=== SPRITES ===\n\nnew section\n\n" }
] }
```

`find` must occur exactly once in the stored note (otherwise the run aborts with the count); with `until`, everything from the start of `find` up to, but not including, the next `until` is replaced; `with` is a string or an array of lines. Edits apply in order. They need an existing note (a missing note is an error) and are not repeatable: once applied, `find` no longer matches, so re-running the spec reports an error instead of `=unchanged`. Use a full-text spec when the spec must stay re-applicable. Never write a helper script to rebuild note text: extend the spec instead.

**Where each entry lands:**

| Entry | File | Key |
|-------|------|-----|
| block note | `notes/blockNotes/bankNN.json` | file name without `.asm` (and without `.sprite`); bank from `?BANK` if present, else the block's start in `blocks.json` / `files.json`, else code labels, address tags, names lookup |
| part note | `notes/partNotes/bankNN.json` | label; bank = the bank that already holds the label, otherwise the file's bank (a note is never duplicated into a second bank) |
| comment | `notes/comments/bankNN.json` | decimal address; bank = address / 65536 |

Key order and formatting (sorted keys, 4-space indent) are done by the save helper in `src/notes-common.ts`, and a file is rewritten only when its content changed.

**Validation (all checked before any write; one error aborts everything):**

- File must be an `.asm` under `extracted/`; `MenuSelectionHandler.asm` is refused (transforms artifact).
- Part-note labels must exist exactly once in the file (near-misses print "Did you mean ..."). Top-level parts and indented sub-labels are both accepted.
- Comment addresses must have exactly one `; {address}` tag; a file without tags tells you to run `extract:lt`. The `expect` guard must match the instruction on that line. Exception: a stored comment can be replaced or removed without a tag when `expectOld` matches its current text (see the spec format).
- Comment text must be one line, must not contain `{digits}`, and warns when longer than 160 characters or when it matches a `db-us/transforms.json` pattern.
- Two entries in one spec may not set the same key.
- Warning: a part note whose label already lives in a different bank than the file resolves to is written to the existing bank.

**After writing:** `merge` reloads `notes/` from disk and confirms every set is present with the exact text, every removal is gone, and no key exists in more than one bank file.

**Rules of thumb:**

- Run `extract:lt` first, and again whenever labels or addresses may have changed (renames, new names, notes merged by someone else). Specs are validated against the extracted `.asm`, so a stale extract rejects a renamed label.
- `extracted/` is **stale after a merge** until the next extract. Do not copy text out of it into another spec without re-extracting.
- `extract` and `extract:lt` begin by deleting `extracted/*`; nothing is lost because the notes live in `notes/`.
- Keep the specs under `plans/extracted-audit/edits/` as the replayable record, one new file per iteration (see "Write new files" below).
- Names (`db-us/names/bankNN.json`), `blocks.json`, `overrides.json`, `transforms.json` and code changes are outside its scope. Rename a label with [`npm run names`](#implemented-names-merge-npm-run-names) (it also moves the part-note key), re-run `extract:lt`, then merge any further notes for the new name.
- **Transforms that match across labels (adjacency hazard).** A `transforms.json` regex that spans two labels (for example `diary_menu_window_dma`, which needs `diary_band_empty` and `diary_band_slot1` back to back) only matches while nothing sits between them. A part note or comment on either label puts a comment line between them, the regex stops matching, and the ROM bytes change (the rebuild CRC gate fails). Do not annotate between such labels; put the text in the block note. Prefer rules that match one label or one instruction sequence. After a merge run `npm run rebuild` and compare `artifacts/crc.json` with the baseline.

**Availability:** implemented in `gaia-iog-baserom` (`src/merge.ts`). It imports shared helpers from `src/notes-common.ts` (bank detection, JSON load/save, spec types and note normalisation), so copy those two files and the `merge` case in `src/index.ts` to another baserom repo to use it there.

### Merge spec format and iteration files

**Spec format.** Keys are `.asm` paths relative to `extracted/` (a leading `extracted/` is also accepted). Each file takes any of three sections:

```json
{
  "system/engine/smooth_follow.asm": {
    "blockNote": ["First line.", "", "Second paragraph."],
    "partNotes": {
      "ComputeFollowStep": "Produces this frame's step.\n\nInputs: ...",
      "OldHelper": null
    },
    "comments": {
      "60956": "Y = slope row offset (orbitAngle x 32 bytes)",
      "60960": { "text": "x32 via five ASL", "expect": "ASL" },
      "60961": null
    }
  }
}
```

| Section | Key | Value |
|---------|-----|-------|
| `blockNote` | (none) | text, array of lines, or `null` |
| `partNotes` | label name | text, array of lines, or `null` |
| `comments` | decimal address (the `{n}` in `; {n}`, or the key of the stored comment) | text, `{ "text", "expect" }`, `{ "text", "expectOld" }`, or `null` |

- **string or array** = set (add or replace). In note text, `\n` ends a line and an empty line becomes a `; ` paragraph break. An array is joined with `\n`.
- **`null` or `""`** = remove. Removing something that is already absent is a no-op.
- **`expect`** is an optional guard on comments: the instruction on that tagged line must contain the string (case-insensitive), otherwise the run fails. Use it whenever the address came from memory or an earlier pass.
- **`expectOld`** replaces or removes a comment on a line that **already has a comment**. `extract:lt` prints no `; {address}` tag on such a line, so the line cannot be located in the `.asm`; instead the address is the key of the stored comment in `notes/comments/bankNN.json` and `expectOld` must be a substring (case-insensitive) of that stored text, otherwise the run fails. Find the key by searching `notes/comments/` for the old text (read-only). `expectOld` on a tagged (uncommented) line is an error, and `expect` is ignored (with a warning) on a commented line, because the instruction cannot be checked there. A comment that cannot be matched either way still fails with "address tag not found".
- Keys starting with `_` or `$` at the top level are ignored (use `"_note"` for annotations in the spec).
- Re-applying the same spec is safe: identical content reports `unchanged`.

**Which labels work for `partNotes`.** Any label form the extractor emits: `Name {`, `Name [`, data parts (`Name #hex`, ``Name `text``, `Name ~text`, `Name |text`), and indented sub-labels (`  Name:`). Sub-label notes render above the sub-label with no separator. A label that appears more than once in a file is rejected as ambiguous.

**Keep the specs.** Save each spec under the project (the IOG audit uses `plans/extracted-audit/edits/<iteration>.json`). They are a reviewable, replayable record of every annotation change, which hand edits and throwaway scripts never were.

**Write new files; never append to or splice into a large file.** The merge tool changes `notes/` safely, but audit documentation (results, rename proposals, open questions) is a different matter: growing one long ledger with `StrReplace`, shell `cat >>` or `sed` is slow and error-prone and tempts an agent into one-off helper scripts. The audit therefore writes **one new file per iteration** with a single whole-file write:

```
plans/extracted-audit/
  edits/I021.json              merge spec for iteration I021 (new file; corrections get a new spec, e.g. sanity-<topic>.json)
  results/I021_results.md      verdicts, dispositions, gate result, suggested commit message (always written)
  renames/I021_renames.md      rename proposals R-I021-1.. (only if any)
  questions/I021_questions.md  unverified claims OQ-I021-1.. (only if any)
```

- IDs are scoped to the iteration (`OQ-I021-2`, `R-I021-1`) so no file needs to be read to pick the next number. Reference an older item by ID from a newer file; never edit the older file to close or amend it.
- Progress is derived, not recorded: an iteration is done when its `results/` file exists, so no checklist tick or progress log is edited.
- Ledgers from before this convention live in `*/I001-I020_*.md` and stay frozen; their numbering (OQ-1..OQ-69, rename rows 1..96) is cited from asm notes and remains valid.
- A final consolidation pass reads all files in a folder and writes a new consolidated file.

**When the tool is *not* the right choice:**

- Renames (`db-us/names/bankNN.json`, `blocks.json`), `overrides.json`, `transforms.json` and code changes are outside its scope.
- For a constant value swap use `transforms.json`, not a comment or note.
- Do not hand-edit the `.asm` expecting it to reach `notes/`: nothing reads the `.asm` back (the `ingest` and `annotate` commands were removed). Use `merge`.
- Do not write a helper script for notes, comments or names. If `merge` or `names` lacks a feature, extend the tool in `src/` and document it here.

**Rules of thumb:**

- Work from a fresh `extract:lt`: comment addresses and labels come from that output. If you extracted with different notes since, re-extract before writing the spec.
- `npm run extract` and `extract:lt` begin by deleting `extracted/*`. `merge` writes to `notes/`, so nothing is lost. Any hand edit to `extracted/*.asm` is lost at the next extraction.
- Record the rebuild CRC baseline in the **same extraction mode** you gate with. In `gaia-iog-baserom`, `extract:lt` then `rebuild` and plain `extract` then `rebuild` currently produce different `totalSize` values (3062204 vs 3062189 at the time of writing), so comparing across modes looks like a regression when it is not one.

### Bank detection

`merge` uses a 6-strategy fallback to determine which `bankNN.json` file an annotation belongs to. The first strategy that yields a bank wins:

1. `?BANK` directive in the file. **Optional**: the extractor writes it only for non-movable blocks; the ~740 `movable` blocks and every `files.json` entry (sprite maps etc.) have none, so most files rely on strategies 2-6.
2. **The block's start address in `db-us/blocks.json` / `db-us/files.json`** (bank = floor(start / 65536)). The lookup key is the file name without `.asm`, and without `.sprite` for sprite maps (`spm_x.sprite.asm` is block `spm_x` in `files.json`). A block with `parts` uses the lowest part start. This is the strategy that makes sprite files, route tables and pointer-only files (`scene_actors`) annotatable: look the block up in `blocks.json` (group -> block) or `files.json` (group -> scene -> name) and take `start / 65536`.
3. `code_XXXXXX` / `loc_XXXXXX` labels (hex address encodes the bank)
4. `; {address}` tags from extract:lt (bank = floor(address / 65536))
5. File name lookup in `db-us/names/bankNN.json`
6. First top-level label lookup in `db-us/names/bankNN.json`

Bank = floor(address / 65536) throughout, so a block at 819200 (`$0C8000`) is bank `0C` (`bank0C.json`); the ROM bank seen by the CPU is the extraction bank + `$80`. A block or part note that already exists keeps the file that holds it (a note is never duplicated into a second bank), so an old note filed under a different bank does not move by itself; to move one, null it in one spec (`"blockNote": null`, part notes `null`), merge, then merge the real text.

If `merge` still reports "cannot determine the ROM bank of this file", the file name is not a key in `blocks.json` / `files.json` (for example a renamed or removed block): fix the name, do not add a `?BANK` line to the extracted file (it is overwritten on the next extract).

For inline comments, the bank is always determined directly from the decimal address (bank = floor(address / 65536)), regardless of the file's bank.

### Implemented: Names Merge (`npm run names`)

`names` is the **only way to add or rename a name**. It takes a JSON list of `{ address, old, new }` entries, writes `db-us/names/bankNN.json`, and carries each rename into every file that mentions the old label. It exists so that no agent ever writes a one-off script to edit name files, move part-note keys or search-and-replace labels.

```bash
cd <baserom-repo>
npm run extract:lt                                # old labels are validated against extracted/
# 1. create the spec, e.g. plans/extracted-audit/renames/apply-I065_names.json (Write tool, whole file)
npm run names -- <spec.json> --dry-run            # 2. validate; lists every file that would change
npm run names -- <spec.json>                      #    write names, notes, db files, docs
npm run extract:lt && npm run rebuild             # 3. verify: output uses the new names, CRC gate unchanged
npm run names -- --check                          # optional: names files sorted, correct bank, imported, no duplicates
```

**Spec format** (JSON array; the ROM location, old name and new name are the three required fields):

```json
[
  { "address": 49863,  "old": "loc_00C2C7",  "new": "BossRewardFindScene", "row": "R-I051-3" },
  { "address": 49875,  "old": "loc_00C2D3",  "new": "BossRewardCheckClaimed" },
  { "address": 244008, "old": null,          "new": "SomeNewLabel", "note": "brand new label" }
]
```

| Field | Meaning |
|-------|---------|
| `address` | A plain integer: the **`; {n}` line-tracking number of the part's first instruction** in the `extract:lt` output. That is also the key in the names files. A part starts where its first instruction does, so read the number off the first instruction line of the label you are naming or renaming. Bank = floor(address / 65536) picks `bankNN.json`. Data parts have no instructions and therefore no tag; for those, take the integer from the part's own address (an auto label such as `sprite_set_0E8000` carries it as a 6-digit hex suffix: 0x0E8000 = 950272). Write the integer, not hex; the tool warns when an auto label's suffix does not equal the address. |
| `old` | The label the extracted `.asm` prints at that address **now**: the current names value, or the auto-generated label (`loc_00C2C7`, `code_03B922`, `sprite_set_0E8000`). `null` = brand-new name. The source is always the `.asm` files in `extracted/`; never look names up in `blocks.json` or `files.json` (they miss every auto-generated part). |
| `new` | The new label. Must be a valid identifier and unused anywhere. |
| `row`, `note` | Free text for the audit trail (rename row ID, reason). Ignored by the tool. Any other key is rejected. |

**What each entry does:**

| Situation | Result |
|-----------|--------|
| names has an entry at `address` | **rename**: `old` must equal it; the value is replaced |
| no entry; `old` is an auto label defined in `extracted/` (or `null`) | **add**: entry created |
| names already holds `new` at `address` | **unchanged**: re-applying a spec is safe |

A block or part that has the **same name** in `blocks.json` / `files.json` needs no extra entry: the raw whole-word replacement below renames it there too. `blocks.json` / `files.json` are never consulted to classify an entry.

**Validation (checked before any write; one error aborts everything):** identifiers are valid; no address, `old` or `new` repeats within the spec; `new` is not already used in names or as a label or `?INCLUDE` name in `extracted/` (unless that name is freed by another entry in the same spec); `old` matches what the address really holds; `extracted/` exists. A warning is printed when an auto label's hex suffix does not equal the address.

**What gets rewritten** (whole-word replacement; a label is never matched inside a longer identifier):

| Area | How |
|------|-----|
| `db-us/names/bankNN.json` | entry replaced or added; file sorted, 4-space indent. A missing bank file is created and imported in `src/names.ts`. |
| `notes/{blockNotes,partNotes,comments}` | JSON is parsed: the part-note key (or block-note key) is renamed **within its bank**, and note text mentioning the label is rewritten. A rename that would collide with an existing note key is an error. |
| `db-us/*.json` (blocks, files, transforms, overrides ...), `baserom/`, `docs/` | raw whole-word replacement |
| `../gaia-core/docs`, `../IOGRXLT/IOGRetranslation/{modules,docs}` | raw whole-word replacement; skipped with `--local-only` |
| **Not touched** | `extracted/` (regenerate it), `plans/`, `temp/`, `artifacts/`, `db-jp/`, `rebuilt/`, `archived/`, and the gaia-knowledge corpus copies (refresh them with `npm run ingest:all` there) |

**Flags:** `--dry-run` (report only), `--local-only` (skip the two external roots), `--check` (no spec; validates the names files themselves).

**Rules of thumb:**

- Run `extract:lt` first and again afterwards. The extracted `.asm` is the source of both `old` and `address`; it is also read to prove that `old` really is what the extractor prints.
- Keep each spec under `plans/extracted-audit/renames/apply-<range>_names.json` as the replayable record, and write a new file per iteration.
- A rename changes labels only, never ROM bytes: `npm run rebuild` must still match the CRC gate in `artifacts/crc.json`.
- Renaming moves the part-note key; do not also null and re-merge the note. Notes about the new name that are *new* go through `npm run merge` afterwards.
- Sub-labels (`Parent:` colon labels) have their own names entry and need their own spec entry.
- **Part label shadowing a names entry:** when a `blocks.json` part sits on the same address as a `names/bankNN.json` entry with a different name, the extraction prints the part name while references may use the names entry. Put the label the `.asm` prints in `old`: the tool then rewrites the names entry and both old names (the part key in `blocks.json` is replaced by the same whole-word rewrite).
- **Block patches are matched by file name:** a block patch file (for example `baserom/equipped-icon/<block>.asm`) must be renamed by hand to the new block name after a block rename; the tool rewrites its content but cannot move the file.
- **Derived `_value` labels:** the `Extract(n)` post-process of `scene_actors` cuts the title out of each record and names it `<record label>_value` (and the copied pointer table `<table>_extract_table`). These labels have no address of their own, so they cannot be named; they follow their record. Renaming a record label `R` to `S` therefore also rewrites every reference to `R_value` into `S_value` (notes keys, db files, patches, docs and modules), and the extractor emits the new name.
- **Limitation:** it cannot delete a names entry or turn a name back into an auto label. That is a deliberate manual change; ask the user.

**Availability:** implemented in `gaia-iog-baserom` (`src/names-merge.ts`, shared helpers in `src/notes-common.ts`, wired as the `names` case in `src/index.ts`). It does not depend on engine internals. Robotrek uses a single `names.json`, so it would need the bank-file logic replaced there.

### Future Improvement: Block Audit Report (`audit:blocks`)

An automated audit report would help agents and humans prioritize documentation work:

```
# Example output
Block: cop_handlers_flow (bank00)
  Block note: ✓ exists
  Part notes: 28/30 routines covered (missing: WaitByte, WaitWord)
  Comments:   18 comments across 487 instructions (3.7% coverage)
  Names:      0 generic labels remaining
  Coverage:   ██████░░░░ 60% — complex routines SwitchCase, BranchOnFlagWord under-documented

Block: combat_collision (bank03)
  Block note: ✗ missing
  Part notes: 3/12 routines covered
  Comments:   0 comments across 892 instructions
  Names:      4 generic labels (code_03A1B0, WorldMapControllerEntry, code_03A380, code_03A4C2)
  Coverage:   ░░░░░░░░░░ 0% — needs full documentation pass
```

This would combine `db-us/names/` scanning (flag generic labels), part note coverage (which named routines lack notes), comment density (instructions per comment ratio), and block note presence into a single actionable report.

### Future Improvement: Part Note Templates

Common routine patterns appear repeatedly across blocks. Template-based generation would accelerate documentation for agents:

- **COP handler template:** `COP #XX with [operand description]. [Purpose sentence]. [Implementation detail].`
- **JSL wrapper template:** `JSL helper that [verb] a [noun] at base $XXXX. Masks to byte, adds $XXXX, and calls [CoreRoutine].`
- **Data table template:** `[Count]-entry [format] lookup table mapping [input] to [output]. Used by [callers].`

Agents could detect the pattern from the code structure (e.g., a routine that only does `AND, CLC, ADC, JSR, RTL` is clearly a JSL offset wrapper) and apply the appropriate template with filled-in specifics.

---

## Practical Audit Patterns

This section captures specific patterns and pitfalls discovered through auditing multiple COP handler and engine files.

### Block notes often drift from reality

Block notes are written once and rarely updated as the codebase evolves. Common drift patterns:

- **Inaccurate counts.** A block note says "14 handlers" but the file contains 30. Always manually count every named part in the `.asm` file.
- **Cross-file references.** A block note describes routines that are actually in a *different* file due to `?INCLUDE` dependencies. For example, a "flow" block note mentioning `PrintDialogString` when that handler lives in `cop_handlers_input`. Block notes should describe only what is physically in their own `.asm` file, with cross-references to related blocks rather than claiming ownership.
- **Scope creep.** Over time, new routines get added to a block but the block note is never updated to mention them. The handler categories and descriptions become incomplete.

**Fix pattern:** Read the file, count every part, categorize them into logical groups, and rewrite the block note with accurate numbers and organized subsections.

### Part notes for trivial routines are still valuable

It's tempting to skip part notes for one-liner JSL wrappers like `TestFlag_0300` (which is just `AND, CLC, ADC #$0300, JSR TestEventFlag, RTL`). But these routines are called from *many* places in the codebase, and a reader encountering `JSL TestFlag_0300` in an actor script needs to know what the `$0300` scope means without navigating to the wrapper code.

**Rule of thumb:** Every named routine should have a part note, even if it's a single sentence. For families of similar wrappers, the notes can follow a consistent template (see "Part Note Templates" above).

### Comment prefixes are redundant with labels

A common pattern in early documentation is prefixing comments with the routine name:

```asm
STA $00               ; JumpAfterDelay: save resume PC in actor $00
```

Since the routine label `JumpAfterDelay {` appears directly above this code block, the prefix is redundant. Prefer:

```asm
STA $00               ; Store target script pointer in actor EntryPtr ($00) for deferred resume
```

This makes the comment valuable to someone reading mid-routine (where the label may have scrolled offscreen) without repeating information that's immediately visible.

### Verifying comment placement with extract:lt

When auditing existing comments, run `extract:lt` and check that each comment appears on the instruction you expect. Common misplacements:

- **Comment on the wrong instruction of a group.** A comment describing "the return convention" placed on a `LSR` instruction 20 bytes before the actual `SEC`/`CLC` return code.
- **Comment orphaned by code changes.** If a routine was reorganized, comment addresses may point at the wrong instructions or even at data bytes.
- **Off-by-one from manual address computation.** Pre-`extract:lt` comments computed by hand may be 1–2 bytes off from the actual instruction.

**Fix pattern:** For each existing comment, find its address in the `extract:lt` output. Verify the instruction at that address matches what the comment describes. If misaligned, delete the old address key and add a new one at the correct address.

### Working efficiently with large JSON files

> **Note:** With `merge`, agents should rarely need to edit JSON files directly. Write a spec and run `npm run merge` instead. This section is retained for manual inspection and debugging.

Comment files can have hundreds of entries. For agents inspecting these files:

1. **Search, don't scan.** Use grep/search to find entries by address range (e.g., `"435"` to find all addresses in the 43500–43599 range).
2. **Read targeted ranges.** Use line-offset reads around the addresses you need to inspect, not full file reads.
3. **Prefer the merge workflow.** If you need to add or update entries, write a spec and run `npm run merge` rather than modifying JSON directly; it handles key ordering and bank detection (the bank comes from `?BANK` if present, otherwise from the block's start address in `blocks.json` / `files.json`; see "Bank detection"). `merge` cannot remove a note whose label no longer exists: that needs a careful hand edit of the one JSON entry, followed by `extract:lt` to verify.

---

## Agent Workflow Recommendations

This section provides specific guidance for AI agents performing documentation work on baserom projects.

### Pre-work: Create a structured plan

Before modifying any files, read the target `.asm` file completely and create a structured checklist covering:

1. **Block note accuracy** — handler/routine count, descriptions match file contents
2. **Missing or inaccurate part notes** — list by routine name
3. **Name auditing** — generic or misleading labels in `db-us/names/bankNN.json`
4. **Existing comments to correct** — misplaced, inaccurate, or redundant
5. **New comments to add** — identify which routines need them and at what density
6. **Verification** — plan the final extraction and review

This prevents the common failure mode of starting to write comments mid-read and losing track of the remaining work.

### Batching extractions efficiently

The typical audit requires at minimum two extraction runs (standard → `extract:lt`), plus a final verification. To minimize round-trips:

1. **First read:** Read the standard-extracted `.asm` file (already available in `extracted/`). No extraction needed if it's up to date.
2. **Run `extract:lt`:** This provides addresses for comment work and shows existing annotations. Write one spec covering every file in the batch (it accepts many files at once) — block notes, part notes, and inline comments.
3. **Run `npm run merge -- <spec.json> --dry-run`, then for real:** it validates against the extracted `.asm`, writes the entries into `notes/` JSON, and verifies them. Fix any reported error and re-run; nothing is written while errors exist.
4. **Run `extract:lt` (or standard `extract`) again:** the extractor re-reads `notes/`, so this is the final verification that everything appears correctly.

If the file hasn't changed since the last extraction, skip the extraction — just read the existing file.

### Navigating the JSON files

> **Note:** With `npm run merge`, agents no longer need to manually edit JSON files. Write a spec and run `merge`. This section is retained for understanding the file structure and for manual inspection/debugging.

The note and comment JSON files are organized by bank. To find the right file and position:

1. **Bank file:** Comments for addresses 32768–65535 → `bank00.json`, 163840–196607 → `bank02.json`, etc.
2. **Finding insertion point:** Search for the nearest existing address key. Comments must be in ascending address order.
3. **Cross-referencing names:** Search `db-us/names/bankNN.json` (bank = floor(address / 65536)) for the routine address (decimal key) to get the label. Search `partNotes/bankNN.json` for that label to check for an existing part note.

### Handling multi-block files

Some `.asm` files contain routines from multiple logical blocks due to `?INCLUDE` directives. For example, `cop_handlers_flow.asm` includes `cop_handlers_flags` and `inventory_mgmt`. Each included block has its own block note and its routines have separate part notes, but they all appear in a single extracted file.

When auditing such files:
- The block note for the **host** file should describe the routines in that file, not the included dependencies
- Part notes for included routines belong to the included block's bank file (usually the same bank)
- Comments are always keyed by address regardless of which block "owns" the routine

### Comment authoring tips for agents

1. **Use `npm run merge`, not hand edits or throwaway scripts.** Run `npm run extract:lt` for address-tagged output, write a JSON spec (block note, part notes by label, comments by address, `null` to remove), run `npm run merge -- <spec.json>`, then `npm run extract:lt` to check the result. Never manually edit `notes/` JSON files, and do not write one-off scripts that rewrite `.asm` text.
2. **One comment per logical operation.** Don't comment every instruction — aggregate sequences into a single explanation at the first meaningful instruction.
3. **Avoid restating the instruction.** `PHX ; Save X` adds no value. Instead, explain *why* X is being saved: `PHX ; Preserve actor index across flag lookup`.
4. **Document non-obvious values.** Magic numbers, bitmask meanings, hardware register purposes, and sentinel return values always need comments.
5. **Cross-reference shared patterns.** When the same code pattern appears in multiple routines, comment it thoroughly the first time and abbreviate on subsequent occurrences.
6. **Maintain consistent style.** Don't start some comments with verbs and others with nouns. Pick a consistent pattern per routine type.

### Handling wrapper families

Many engines have families of near-identical wrapper routines (e.g., `SetFlag_0100`, `SetFlag_0300`, `TestFlag_0510`). For these:

1. **Write a thorough part note for the core routine** explaining the full algorithm (e.g., `SetEventFlag` with its byte/bit decomposition)
2. **Write one-line template part notes for each wrapper** stating the base offset and scope meaning
3. **Skip inline comments for wrappers** — the part note provides sufficient context
4. **Add one inline comment on the core routine's key instruction** (e.g., the bitmask lookup or bit decomposition)

### Suggested improvements that would make this process more manageable

The following would significantly reduce the time and context required for documentation work:

**1. ~~Inline comment ingestion~~ ✅ IMPLEMENTED (superseded by `merge`)** — `npm run merge` lets agents write all annotations (block notes, part notes, and inline comments) from a JSON spec straight into `notes/`. See [Notes Merge](#implemented-notes-merge-npm-run-merge).

**2. Coverage audit report** — A single command (`npm run audit:coverage`) that reports which blocks have block notes, which routines have part notes, which routines have inline comments, and which `db-us/names/` labels are still generic. This would let agents instantly identify what needs attention without manually scanning multiple JSON files.

**3. Name audit report** — A tool that scans `db-us/names/` for generic labels (`code_XXXXXX`, `sub_XXXXXX`, `loc_XXXXXX` at part boundaries) and reports them as candidates for renaming.

**4. Part note scaffolding** — A tool that generates template part notes for all named routines that lack them, using pattern detection (COP handler → COP handler template, 5-instruction JSL wrapper → wrapper template, data table → table template). Agents could then review and refine rather than writing from scratch.

**5. Validation on extract** — Run basic validation during `npm run extract` that warns about orphaned part notes (keys not matching any names value), missing part notes for named routines, and comment addresses that don't match any instruction. Currently agents discover these issues only through manual verification.

**6. Reduced context requirements** — The current workflow requires holding the entire `.asm` file, three JSON files, and the names files in context simultaneously. A focused audit view that shows one routine at a time with its part note, comments, and names entry would let agents work routine-by-routine instead of file-by-file.

### Checklist: Annotating a New Block

Quick reference for the complete annotation workflow:

- [ ] Run `npm run extract` and read the entire `.asm` file
- [ ] Identify all routines and their relationships
- [ ] Count every named routine — verify any existing block note count is accurate
- [ ] Determine the bank number (floor(start_address / 65536)) — all notes go in `bankNN.json` files
- [ ] Audit `db-us/names/bankNN.json`: rename generic labels (`code_XXXXXX`), fix misleading names
- [ ] Run `npm run extract:lt` to get address-tagged output
- [ ] Write an edit spec JSON: block note, part notes (by label), inline comments (by `{address}`, with `expect` guards)
- [ ] Run `npm run merge -- <spec.json> --dry-run`, fix any errors, then run it without `--dry-run` (it writes and verifies `notes/` JSON)
- [ ] Run `npm run extract:lt` (or standard `npm run extract`) and review the final output
- [ ] Read the file top-to-bottom as a consumer — does it flow? Are the comments helpful without being noisy?

### Checklist: Auditing an Existing Block

Quick reference for verifying and improving existing annotations:

- [ ] Run `npm run extract` and read the entire `.asm` file end-to-end
- [ ] Verify block note: correct handler/routine count, descriptions match file contents, no references to routines in other files
- [ ] For each named routine: verify part note exists and accurately describes the code
- [ ] Audit `db-us/names/bankNN.json` labels: descriptive, follows naming conventions, matches part note keys
- [ ] Run `npm run extract:lt` to get address-tagged output
- [ ] For each existing comment: verify address matches the correct instruction, description is accurate (not misplaced or misleading), and adds value (not just restating the instruction)
- [ ] Look for `; {address}` tags in complex routines — these are uncommented lines that may need annotation
- [ ] Write an edit spec: `null` for redundant comments/notes, new text for missing or inaccurate ones (density guidelines: high for complex logic, low for trivial handlers)
- [ ] Run `npm run merge -- <spec.json> --dry-run`, then for real (it writes and verifies `notes/` JSON)
- [ ] Run `npm run extract:lt` (or standard `npm run extract`) and verify the final output reads naturally
- [ ] Read the file as a consumer — do annotations flow? Are they accurate and non-redundant?
