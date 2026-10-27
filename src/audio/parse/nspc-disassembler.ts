import {
  PERCUSSION_TO_GM_DRUM,
  SPC_SLOT_BASE,
  nspcPitchToMidi,
} from '../constants.ts';
import type { NspcEvent, NspcSong, NspcTrack } from '../types.ts';

function readU16LE(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8);
}

/** Velocity entries start at byte 8 of the 24-byte combined dur+vel table. */
const VELOCITY_TABLE_OFFSET = 8;

/**
 * Map an SPC velocity table value (0–255) to MIDI velocity (1–127).
 *
 * The SNES uses LINEAR amplitude: output ∝ raw/255.
 * FluidSynth's default SF2 modulator applies a SQUARE LAW to MIDI velocity:
 *   amplitude ∝ (vel/127)²   (concave curve, 960 cB range)
 *
 * A naïve linear mapping (vel = raw×127/255) produces an effective amplitude
 * of (raw/255)² — the SQUARE of the intended value.  For moderate velocities
 * this makes notes 50–90% too quiet.
 *
 * Applying a square-root compensates for the synth's square law:
 *   vel = 127 × √(raw/255)   →   amp = (√(raw/255))² = raw/255   ✓
 */
function lookupVelocity(velocityRate: number, velocityTable: Uint8Array): number {
  const index = Math.min(VELOCITY_TABLE_OFFSET + velocityRate, velocityTable.length - 1);
  const raw = velocityTable[index]!; // SPC value 0-255
  return Math.max(1, Math.min(127, Math.round(127 * Math.sqrt(raw / 255))));
}

/**
 * Look up the gate fraction from the duration portion of the 24-byte table.
 * The SPC engine uses: gate_ticks = max(1, (multiplier × gate_fraction) >> 8).
 * Duration class 0 → staccato (~20%), class 7 → nearly legato (~98%).
 */
function lookupGateFraction(durationClass: number, velocityTable: Uint8Array): number {
  const index = Math.min(durationClass, 7);
  return velocityTable[index]!;
}

function isNoteOrCommand(byte: number): boolean {
  return (
    byte === 0x00 ||
    byte === 0xc8 ||
    byte === 0xc9 ||
    (byte >= 0xca && byte <= 0xdf) ||
    (byte >= 0x80 && byte <= 0xc7) ||
    byte >= 0xe0
  );
}

function readOptionalVelocityParam(
  data: Uint8Array,
  offset: number,
  velocityTable: Uint8Array,
): { velocity: number | null; durationClass: number | null; consumed: number } {
  if (offset >= data.length) return { velocity: null, durationClass: null, consumed: 0 };
  const next = data[offset]!;
  if (next >= 0x80 || isNoteOrCommand(next)) {
    return { velocity: null, durationClass: null, consumed: 0 };
  }
  const velocityRate = next & 0x0f;
  const durationClass = (next >> 4) & 0x07;
  return {
    velocity: lookupVelocity(velocityRate, velocityTable),
    durationClass,
    consumed: 1,
  };
}

/**
 * Persistent channel state that carries over between patterns and from intro to loop.
 * The SPC engine does NOT reset these at pattern boundaries.
 */
export interface TrackDisasmState {
  currentDuration: number;
  currentGateFraction: number;
  currentVelocity: number | null;
  channelVolume: number;
  channelTranspose: number;
}

function defaultTrackState(): TrackDisasmState {
  return {
    currentDuration: 48,
    currentGateFraction: 0xfc, // nearly legato (class 7)
    currentVelocity: null,
    channelVolume: 240,
    channelTranspose: 0,
  };
}

export function disassembleTrack(
  data: Uint8Array,
  baseAddr: number,
  trackAddr: number,
  velocityTable: Uint8Array,
  initialState?: TrackDisasmState,
): { events: NspcEvent[]; finalState: TrackDisasmState } {
  const events: NspcEvent[] = [];
  let offset = trackAddr - baseAddr;

  const st = initialState ? { ...initialState } : defaultTrackState();

  if (offset < 0 || offset >= data.length) {
    return { events, finalState: st };
  }

  let { currentDuration, currentGateFraction, currentVelocity, channelVolume, channelTranspose } = st;

  while (offset < data.length) {
    const byte = data[offset]!;

    if (byte === 0x00) {
      events.push({ kind: 'end' });
      break;
    }

    if (byte >= 0x01 && byte <= 0x7f) {
      currentDuration = byte;
      const param = readOptionalVelocityParam(data, offset + 1, velocityTable);
      if (param.velocity !== null) {
        currentVelocity = param.velocity;
      }
      if (param.durationClass !== null) {
        currentGateFraction = lookupGateFraction(param.durationClass, velocityTable);
      }
      offset += 1 + param.consumed;
      continue;
    }

    if (byte >= 0x80 && byte <= 0xc7) {
      const midiNote = nspcPitchToMidi(byte) + channelTranspose;
      const velocity =
        currentVelocity ?? Math.max(1, Math.round((channelVolume / 240) * 100));
      const gateTime = Math.max(1, (currentDuration * currentGateFraction) >> 8);
      events.push({
        kind: 'note',
        pitch: byte,
        midiNote,
        duration: currentDuration,
        gateTime,
        velocity,
      });
      offset += 1;
      continue;
    }

    if (byte === 0xc8) {
      for (let i = events.length - 1; i >= 0; i--) {
        const prev = events[i]!;
        if (prev.kind === 'note' || prev.kind === 'percussion') {
          prev.duration += currentDuration;
          prev.gateTime += Math.max(1, (currentDuration * currentGateFraction) >> 8);
          break;
        }
        if (prev.kind === 'rest') break;
      }
      offset += 1;
      continue;
    }

    if (byte === 0xc9) {
      events.push({ kind: 'rest', duration: currentDuration });
      offset += 1;
      continue;
    }

    if (byte >= 0xca && byte <= 0xdf) {
      const drumNote = PERCUSSION_TO_GM_DRUM[byte] ?? byte;
      const velocity =
        currentVelocity ?? Math.max(1, Math.round((channelVolume / 240) * 100));
      const gateTime = Math.max(1, (currentDuration * currentGateFraction) >> 8);
      events.push({
        kind: 'percussion',
        note: drumNote,
        duration: currentDuration,
        gateTime,
        velocity,
      });
      offset += 1;
      continue;
    }

    switch (byte) {
      case 0xe0:
        events.push({ kind: 'setInstrument', slot: SPC_SLOT_BASE + data[offset + 1]! });
        offset += 2;
        break;
      case 0xe1:
        events.push({ kind: 'pan', value: data[offset + 1]! & 0x1f });
        offset += 2;
        break;
      case 0xe2: // pan fade (speed, target)
        offset += 3;
        break;
      case 0xe3:
        events.push({
          kind: 'vibrato',
          delay: data[offset + 1]!,
          rate: data[offset + 2]!,
          depth: data[offset + 3]!,
        });
        offset += 4;
        break;
      case 0xe4:
        events.push({ kind: 'vibratoOff' });
        offset += 1;
        break;
      case 0xe5:
        events.push({ kind: 'mainVolume', value: data[offset + 1]! });
        offset += 2;
        break;
      case 0xe6:
        offset += 3;
        break;
      case 0xe7:
        events.push({ kind: 'tempo', value: data[offset + 1]! });
        offset += 2;
        break;
      case 0xe8: // tempo fade (duration, target)
        offset += 3;
        break;
      case 0xe9: { // global transpose — applies to all channels
        const val = data[offset + 1]!;
        channelTranspose = val > 127 ? val - 256 : val;
        offset += 2;
        break;
      }
      case 0xea: { // per-voice transpose — shifts subsequent note pitches
        const val = data[offset + 1]!;
        channelTranspose = val > 127 ? val - 256 : val;
        offset += 2;
        break;
      }
      case 0xeb: // tremolo (delay, rate, depth) — 3 params
        offset += 4;
        break;
      case 0xec: // ADSR attack rate override — 0 params (only pre-read byte)
        offset += 1;
        break;
      case 0xed:
        channelVolume = data[offset + 1]!;
        events.push({ kind: 'volume', value: channelVolume });
        offset += 2;
        break;
      case 0xee:
        offset += 3;
        break;
      case 0xef: // subcommand (sub, p1, p2) — 3 params
        offset += 4;
        break;
      case 0xf0: // amplitude modulation on
        offset += 2;
        break;
      case 0xf1: // ADSR override (adsr1, adsr2, gain) — 3 params
        offset += 4;
        break;
      case 0xf2: // pitch envelope (delay, speed, depth) — 3 params
        offset += 4;
        break;
      case 0xf3: // pitch envelope off
        offset += 1;
        break;
      case 0xf4:
        events.push({ kind: 'tuning', value: data[offset + 1]! });
        offset += 2;
        break;
      case 0xf5:
        events.push({
          kind: 'echo',
          enabled: data[offset + 1]!,
          volume: data[offset + 2]!,
          feedback: data[offset + 3]!,
        });
        offset += 4;
        break;
      case 0xf6: // echo off — 0 params
        offset += 1;
        break;
      case 0xf7: // echo FIR filter coefficients
        offset += 4;
        break;
      case 0xf8: // subroutine call (addr_lo, addr_hi, count) — 3 params
        offset += 4;
        break;
      case 0xf9: // loop/return (addr_lo, addr_hi, count) — 3 params
        offset += 4;
        break;
      case 0xfa:
        offset += 2;
        break;
      case 0xfb: // UNUSED in IoG engine — 0 params
        offset += 1;
        break;
      case 0xfc: // UNUSED in IoG engine — 0 params
        offset += 1;
        break;
      case 0xfd: // UNUSED in IoG engine — 0 params
        offset += 1;
        break;
      case 0xfe: // UNUSED in IoG engine — 0 params
        offset += 1;
        break;
      case 0xff:
        offset += 2;
        break;
      default:
        console.warn(
          `Unknown N-SPC opcode $${byte.toString(16).toUpperCase().padStart(2, '0')} at offset ${offset}, skipping`,
        );
        offset += 1;
        break;
    }
  }

  return {
    events,
    finalState: {
      currentDuration,
      currentGateFraction,
      currentVelocity,
      channelVolume,
      channelTranspose,
    },
  };
}

/**
 * Compute total ticks (note/rest/percussion durations) in an event list.
 */
function totalTicks(events: NspcEvent[]): number {
  let t = 0;
  for (const ev of events) {
    if (ev.kind === 'note' || ev.kind === 'rest' || ev.kind === 'percussion') {
      t += ev.duration;
    }
  }
  return t;
}

/**
 * Disassemble a sequence of patterns for all 8 channels.
 *
 * The N-SPC engine plays patterns sequentially from the phrase list.
 * All 8 channels within a pattern play SIMULTANEOUSLY. When the longest
 * channel finishes, ALL channels advance to the next pattern together.
 *
 * This function handles:
 * - Pattern-boundary synchronization (padding shorter channels with rests)
 * - State persistence across patterns (transpose, duration, velocity, etc.)
 */
function disassemblePatternSequence(
  patternAddrs: number[],
  sequenceData: Uint8Array,
  baseAddr: number,
  velocityTable: Uint8Array,
  initialStates: TrackDisasmState[],
): { channelEvents: NspcEvent[][]; finalStates: TrackDisasmState[] } {
  const channelEvents: NspcEvent[][] = Array.from({ length: 8 }, () => []);
  const states = initialStates.map(s => ({ ...s }));

  for (const patternAddr of patternAddrs) {
    const patternOff = patternAddr - baseAddr;

    let maxPatternTicks = 0;
    const results: Array<{
      events: NspcEvent[];
      finalState: TrackDisasmState;
      ticks: number;
    }> = [];

    for (let ch = 0; ch < 8; ch++) {
      const chPtr = readU16LE(sequenceData, patternOff + ch * 2);
      if (!chPtr) {
        results.push({ events: [], finalState: states[ch]!, ticks: 0 });
        continue;
      }
      const result = disassembleTrack(
        sequenceData, baseAddr, chPtr, velocityTable, states[ch],
      );
      const ticks = totalTicks(result.events);
      results.push({ ...result, ticks });
      maxPatternTicks = Math.max(maxPatternTicks, ticks);
    }

    for (let ch = 0; ch < 8; ch++) {
      const r = results[ch]!;
      for (const ev of r.events) {
        if (ev.kind !== 'end') channelEvents[ch]!.push(ev);
      }
      const pad = maxPatternTicks - r.ticks;
      if (pad > 0) {
        channelEvents[ch]!.push({ kind: 'rest', duration: pad });
      }
      states[ch] = r.finalState;
    }
  }

  return { channelEvents, finalStates: states };
}

function emptyTrack(): NspcTrack {
  return { introEvents: [], loopEvents: [], introPtr: 0, loopPtr: 0 };
}

export function disassembleSong(
  sequenceData: Uint8Array,
  baseAddr: number,
  velocityTable: Uint8Array,
  headerType: NspcSong['headerType'],
): NspcSong {
  const channels: NspcTrack[] = Array.from({ length: 8 }, emptyTrack);
  let loopJumpAddr = baseAddr + 4;

  if (headerType === 'minimal') {
    const phraseListOff = readU16LE(sequenceData, 0) - baseAddr;
    const patternAddr = readU16LE(sequenceData, phraseListOff);
    const patternOff = patternAddr - baseAddr;

    for (let ch = 0; ch < 8; ch++) {
      const chPtr = readU16LE(sequenceData, patternOff + ch * 2);
      if (chPtr === 0) continue;
      const { events } = disassembleTrack(sequenceData, baseAddr, chPtr, velocityTable);
      channels[ch] = {
        introPtr: chPtr,
        loopPtr: chPtr,
        introEvents: events,
        loopEvents: events,
      };
    }
    return { baseAddr, headerType, channels, loopJumpAddr: patternAddr, sequenceData };
  }

  /*
   * Standard / extended N-SPC phrase-list structure:
   *
   *   songBase + 0:   u16 pointer to phrase list
   *   phrase list:    [u16 patternAddr]... [u16 0x00FF] [u16 loopTarget] [u16 0x0000]
   *   each pattern:   8 × u16 channel pointers (16 bytes)
   *
   * The phrase list defines all patterns played in order. The 0x00FF marker
   * indicates the loop point — when reached, playback jumps back to the
   * phrase list entry at loopTarget. Patterns BEFORE the loop target are
   * played only once (intro); patterns from the loop target onward repeat.
   *
   * Example (awakening_the_wind):
   *   [P0] [P1] [P2] [P2] [P3] [0x00FF → P1]
   *   Intro: P0 (setup, played once)
   *   Loop:  P1, P2, P2, P3 (repeating)
   */
  const phraseListOff = readU16LE(sequenceData, 0) - baseAddr;

  // Walk the phrase list to collect all pattern addresses
  const phraseEntries: { offset: number; addr: number }[] = [];
  let loopTargetDataOff = -1;
  let off = phraseListOff;
  while (off >= 0 && off < sequenceData.length - 1) {
    const entry = readU16LE(sequenceData, off);
    if (entry === 0x0000) break;
    if (entry === 0x00ff) {
      const target = readU16LE(sequenceData, off + 2);
      loopTargetDataOff = target - baseAddr;
      loopJumpAddr = target;
      break;
    }
    phraseEntries.push({ offset: off, addr: entry });
    off += 2;
  }

  // Split phrase entries into intro group and loop group.
  // The loop target is a phrase-list ARAM address — entries at or after that
  // offset are the loop body; entries before it are intro-only.
  const introPatternAddrs: number[] = [];
  const loopPatternAddrs: number[] = [];
  let inLoop = false;

  for (const entry of phraseEntries) {
    if (loopTargetDataOff >= 0 && entry.offset === loopTargetDataOff) {
      inLoop = true;
    }
    if (inLoop) {
      loopPatternAddrs.push(entry.addr);
    } else {
      introPatternAddrs.push(entry.addr);
    }
  }

  // If no loop marker found, treat all patterns as intro (play-once song)
  // No loop patterns in this case.

  const defaultStates = Array.from({ length: 8 }, () => defaultTrackState());

  // Disassemble intro patterns (played once)
  const introResult = disassemblePatternSequence(
    introPatternAddrs, sequenceData, baseAddr, velocityTable, defaultStates,
  );

  // Disassemble loop patterns (repeating), starting from intro's final state
  const loopResult = disassemblePatternSequence(
    loopPatternAddrs, sequenceData, baseAddr, velocityTable, introResult.finalStates,
  );

  // Build per-channel tracks
  for (let ch = 0; ch < 8; ch++) {
    const introEvs = introResult.channelEvents[ch]!;
    const loopEvs = loopResult.channelEvents[ch]!;

    // Use the first pattern's channel pointer as introPtr/loopPtr (metadata)
    let introPtr = 0;
    if (introPatternAddrs.length > 0) {
      const firstIntroOff = introPatternAddrs[0]! - baseAddr;
      introPtr = readU16LE(sequenceData, firstIntroOff + ch * 2);
    }
    let loopPtr = 0;
    if (loopPatternAddrs.length > 0) {
      const firstLoopOff = loopPatternAddrs[0]! - baseAddr;
      loopPtr = readU16LE(sequenceData, firstLoopOff + ch * 2);
    }

    channels[ch] = {
      introPtr,
      loopPtr,
      introEvents: introEvs,
      loopEvents: loopEvs,
    };
  }

  return { baseAddr, headerType, channels, loopJumpAddr, sequenceData };
}

export function countNoteEvents(song: NspcSong): number {
  let count = 0;
  for (const ch of song.channels) {
    for (const ev of [...ch.introEvents, ...ch.loopEvents]) {
      if (ev.kind === 'note' || ev.kind === 'percussion') count += 1;
    }
  }
  return count;
}
