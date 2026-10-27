/**
 * Override directive declared by a patch label suffix.
 *
 * | kind      | symbol    | verb              | effect                                              |
 * |-----------|-----------|-------------------|-----------------------------------------------------|
 * | `replace` | `Label!`  | `Label.replace`   | replace the whole block                             |
 * | `before`  | `Label-`  | `Label.before`    | splice a new part before the block                  |
 * | `after`   | `Label+`  | `Label.after`     | splice a new part after the block                   |
 * | `head`    | `Label-=` | `Label.prepend`   | merge content into the start of the block           |
 * | `tail`    | `Label+=` | `Label.append`    | merge content onto the end of the block             |
 * | `bytes`   | `Label#1F`| `Label.at(1F)`    | replace bytes at a hex offset inside the block      |
 */
export type PatchOverrideKind = 'replace' | 'before' | 'after' | 'head' | 'tail' | 'bytes';

/** A parsed patch override directive (see RomProcessingConstants.parseOverride) */
export interface PatchOverride {
  /** Target label with the directive suffix removed */
  name: string;
  kind: PatchOverrideKind;
  /** Byte offset into the target block (only meaningful for `bytes`; 0 otherwise) */
  offset: number;
}

const OVERRIDE_SYMBOLS: Record<string, PatchOverrideKind> = {
  '!': 'replace',
  '-': 'before',
  '+': 'after',
  '-=': 'head',
  '+=': 'tail',
};

const OVERRIDE_VERBS: Record<string, PatchOverrideKind> = {
  replace: 'replace',
  before: 'before',
  after: 'after',
  prepend: 'head',
  append: 'tail',
  at: 'bytes',
};

/** `Label.verb` / `Label.at(1F)` */
const OVERRIDE_VERB_REGEX = /^(.+)\.(replace|before|after|prepend|append|at)(?:\(([0-9a-f]*)\))?$/i;

/**
 * ROM processing constants
 * Converted from GaiaLib/Types/RomProcessingConstants.cs
 */
export class RomProcessingConstants {
  // Core constants
  public static readonly PAGE_SIZE = 0x8000;
  public static readonly SNES_HEADER_SIZE = 0x50;

  // Dictionary constants
  public static readonly DICTIONARIES = ["dictionary_01EBA8", "dictionary_01F54D"];
  public static readonly DICT_COMMANDS = [0xD6, 0xD7];
  public static readonly END_CHARS = [0xC0, 0xCA, 0xD1];

  // Character arrays for parsing
  public static readonly WHITESPACE = [' ', '\t'];
  public static readonly OPERATORS = ['-', '+'];
  public static readonly COMMA_SPACE = [',', ' ', '\t'];
  public static readonly ADDRESS_SPACE = ['@', '&', '^', '#', '$', '%', '*', '!'];
  public static readonly SYMBOL_SPACE = [',', ' ', '\t', '<', '>', '(', ')', ':', '[', ']', '{', '}', '`', '~', '|'];
  public static readonly LABEL_SPACE = ['[', '{', '#', '`', '~', '|', ':', '&', '^', '*'];
  public static readonly OBJECT_SPACE = ['<', '['];
  public static readonly COP_SPLIT_CHARS = [' ', '\t', ',', '(', ')', '[', ']', '$', '#'];
  // Pre-compiled regular expressions for parsing
  public static readonly WHITESPACE_REGEX = /[ \t]/;
  public static readonly COMMA_SPACE_REGEX = /[, \t]/;
  public static readonly SYMBOL_SPACE_REGEX = /[, \t<>()\:\[\]{}`~|]/;
  public static readonly LABEL_SPACE_REGEX = /[\[{#`~|:]/;
  public static readonly OBJECT_SPACE_REGEX = /[<\[]/;
  public static readonly ADDRESS_SPACE_REGEX = /[@&^#$%*!]/;
  public static readonly COP_SPLIT_REGEX = /[ \t,()[\]$#]/;
  
  // Trim patterns (for start/end of string)
  public static readonly COMMA_SPACE_TRIM_REGEX = /^[, \t]+|[, \t]+$/g;

  /**
   * Matches a parenthesised byte-replacement label (`Label.at(1F)`) at the start of a line.
   * `(` and `)` are symbol characters, so this label must be recognised before the line is split into
   * mnemonic/operand. It must be followed by a block opener (`{`, `[`) or colon label.
   */
  public static readonly AT_LABEL_REGEX = /^[^\s,<>()\[\]{}:`~|]+\.at\([0-9a-f]*\)(?=\s*[\[{:])/i;

  
  // Platform detection that works in both Node.js and web environments
  public static readonly IS_WINDOWS = (() => {
    // Check if we're in Node.js environment
    if (typeof process !== 'undefined' && process.platform) {
      return process.platform === 'win32';
    }
    // In web environment, check user agent as fallback
    // if (typeof navigator !== 'undefined' && navigator.userAgent) {
    //   return navigator.userAgent.includes('Windows');
    // }
    // Default to Unix-style line endings if we can't determine
    return false;
  })();

  public static readonly NEWLINE = RomProcessingConstants.IS_WINDOWS ? '\r\n' : '\n';

  /**
   * Parses a patch label as an override directive.
   *
   * Symbol forms:
   * - `Label!`      replace the matched block
   * - `Label-`      splice a new part before the matched block
   * - `Label+`      splice a new part after the matched block
   * - `Label-=`     merge content into the head (start) of the matched block
   * - `Label+=`     merge content onto the tail (end) of the matched block
   * - `Label#`      replace bytes at offset 0 of the matched block
   * - `Label#1F`    replace bytes at hex offset 0x1F of the matched block
   *
   * Verb forms (case-insensitive; the verb must follow the last `.` of the label):
   * `Label.replace`, `Label.before`, `Label.after`, `Label.prepend`, `Label.append`,
   * `Label.at` / `Label.at(1F)`
   *
   * @returns The parsed override, or null when the label is a plain label
   */
  public static parseOverride(label: string | undefined | null): PatchOverride | null {
    if (!label) return null;

    // Verb forms
    const verb = OVERRIDE_VERB_REGEX.exec(label);
    if (verb) {
      const kind = OVERRIDE_VERBS[verb[2].toLowerCase()];
      const hex = verb[3];
      if (hex !== undefined && kind !== 'bytes') return null; // Only `.at` takes an argument
      return { name: verb[1], kind, offset: hex ? parseInt(hex, 16) : 0 };
    }

    // Symbol forms - compound (`+=`, `-=`) before single character
    const suffix = label.endsWith('=') ? label.slice(-2) : label[label.length - 1];
    const symbolKind = OVERRIDE_SYMBOLS[suffix];
    if (symbolKind && label.length > suffix.length) {
      return { name: label.slice(0, -suffix.length), kind: symbolKind, offset: 0 };
    }

    // Byte replacement: `Label#` / `Label#1F`
    const hashIx = label.lastIndexOf('#');
    if (hashIx > 0) {
      const hex = label.substring(hashIx + 1);
      if (/^[0-9a-f]*$/i.test(hex)) {
        return { name: label.substring(0, hashIx), kind: 'bytes', offset: hex.length ? parseInt(hex, 16) : 0 };
      }
    }

    return null;
  }

  public static stripMarkers(name: string): { raw: string, name: string, isSoft: boolean, isRaw: boolean } {
    let isSoft = false;
    let isRaw = false;
    let stripped = name;

    if(stripped[0] === '~') {
      isSoft = true;
      stripped = stripped.substring(1);
    }
    
    if(stripped[stripped.length - 1] === '!') {
      isRaw = true;
      stripped = stripped.substring(0, stripped.length - 1);
    }

    return { raw: name, name: stripped, isSoft, isRaw };
  }

  /**
   * Gets the size of an object for processing purposes
   * @param obj The object to get the size for
   * @returns Size in bytes
   * @throws Error when unable to determine size
   */
  public static getSize(obj: unknown): number {
    if(obj === undefined || obj === null) return 0;
    switch(typeof obj) {
      case 'object':
        if(Array.isArray(obj)) {
          return obj.reduce((acc, x) => acc + RomProcessingConstants.getSize(x), 0);
        }
        if ('size' in obj) return obj.size as number;
        if ('length' in obj) return obj.length as number;
        if ('_tag' in obj) {
          switch ((obj as { _tag: string })._tag) {
            case 'Byte':
              return 1;
            case 'Word':
              return 2;
          }
        }
        break;

      case 'number':
        // Determine size based on value range
        if (obj <= 0xFF) return 1;
        if (obj <= 0xFFFF) return 2;
        if (obj <= 0xFFFFFF) return 3;
        return 4;

      case 'string':
        let str = obj as string;
        if(!str.length) return 0;

        switch (str[0]) {
          case '@':
          case '%':
          case '!':
            return 3;
          case '*':
          case '&':
            return 2;
          case '^':
            return 1;
        }

        switch (str.toLowerCase()) {
          case "byte":
            return 1;
          case "word":
          case "offset":
            return 2;
          case "address":
          case "long":
            return 3;
        }
        
        return obj.length;
    }

    return 0;
  }
}

/**
 * BlockReader specific constants
 */
export class BlockReaderConstants {
  public static readonly REF_SEARCH_MAX_RANGE = 0x380;
  public static readonly BANK_MASK_CHECK = 0x40;
  public static readonly BYTE_DELIMITER_THRESHOLD = 0x100;
  public static readonly BANK_HIGH_MEMORY_1 = 0x7E;
  public static readonly BANK_HIGH_MEMORY_2 = 0x7F;
  public static readonly POINTER_CHARACTERS = ['&', '@', '%', '!'];
  public static readonly BINARY_TYPE = "Binary";
  public static readonly CODE_TYPE = "Code";
  
  // Format strings
  public static readonly MARKER_FORMAT = "+M";
} 