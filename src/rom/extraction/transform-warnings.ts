import type { TransformWarning } from '../../types/transforms';

const MAX_KEY_LENGTH = 90;

function shortKey(key: string): string {
  const flat = key.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  return flat.length > MAX_KEY_LENGTH ? `${flat.slice(0, MAX_KEY_LENGTH)}...` : flat;
}

/**
 * Formats transform warnings as a short, grouped, human-readable report.
 * Returns an empty array when there is nothing to report.
 */
export function formatTransformWarnings(warnings: readonly TransformWarning[]): string[] {
  if (warnings.length === 0) return [];

  const missing = warnings.filter(w => w.kind === 'block-not-found');
  const unmatched = warnings.filter(w => w.kind === 'no-match');
  const invalid = warnings.filter(w => w.kind === 'invalid-regex');

  const skipped = missing.reduce((n, w) => n + w.count, 0) + unmatched.length + invalid.length;
  const lines: string[] = [`transforms.json: ${skipped} transform(s) were not applied`];

  if (missing.length > 0) {
    lines.push('');
    lines.push(`  Block not found in blocks.json (${missing.length} block(s)): rename the key in transforms.json to match`);
    for (const w of missing) {
      lines.push(`    - ${w.block} (${w.count} transform(s) skipped)`);
    }
  }

  if (unmatched.length > 0) {
    lines.push('');
    lines.push(`  Regex matched nothing (${unmatched.length}):`);
    for (const w of unmatched) {
      lines.push(`    - ${w.block} #${w.index}: ${shortKey(w.key!)}`);
    }
  }

  if (invalid.length > 0) {
    lines.push('');
    lines.push(`  Invalid regex (${invalid.length}):`);
    for (const w of invalid) {
      lines.push(`    - ${w.block} #${w.index}: ${shortKey(w.key!)}${w.detail ? ` (${w.detail})` : ''}`);
    }
  }

  if (unmatched.length > 0) {
    lines.push('');
    lines.push('  Tip: patterns are matched against the generated .asm text. Renamed labels, notes, inline comments');
    lines.push('  and line-tracking tags (; {n}) all change that text; use [^\\r\\n]* to skip trailing comments.');
  }

  return lines;
}

/** Writes the formatted report to the console (no output when there are no warnings). */
export function reportTransformWarnings(warnings: readonly TransformWarning[]): void {
  const lines = formatTransformWarnings(warnings);
  if (lines.length === 0) return;
  console.warn(['', ...lines, ''].join('\n'));
}
