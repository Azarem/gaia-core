import { MIDI_PPQN, NSPC_TICKS_PER_QUARTER } from '../constants.js';

/**
 * N-SPC tempo byte → microseconds per quarter note.
 *
 * IoG SPC700 timing (from engine binary analysis):
 *   Timer 1 divisor = $10 (16) → fires at 8000/16 = 500 Hz
 *   Each fire: accumulator += tempoByte
 *   Sequence tick on carry (accumulator ≥ 256)
 *   Quarter note = 24 ticks (NSPC_TICKS_PER_QUARTER)
 *
 * µs/quarter = NSPC_TICKS_PER_QUARTER × 256 × 1_000_000 / (500 × tempoByte)
 *            = 12_288_000 / tempoByte
 */
export function tempoByteToMicrosecondsPerQuarter(tempoByte: number): number {
  if (tempoByte <= 0) return 500_000;
  return Math.round(
    (NSPC_TICKS_PER_QUARTER * 256 * 1_000_000) / (500 * tempoByte),
  );
}

export function nspcTicksToMidiTicks(nspcTicks: number): number {
  return Math.round(nspcTicks * (MIDI_PPQN / NSPC_TICKS_PER_QUARTER));
}

export function nspcDurationToSeconds(duration: number, tempoByte: number): number {
  const usPerQuarter = tempoByteToMicrosecondsPerQuarter(tempoByte);
  const usPerNspcTick = usPerQuarter / NSPC_TICKS_PER_QUARTER;
  return (duration * usPerNspcTick) / 1_000_000;
}

/** SPC engine initializes the tempo multiplier ($53) to $10 = 16 → ~78 BPM. */
export const DEFAULT_TEMPO_BYTE = 0x10;
