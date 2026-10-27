import type {
  DecodedBgm,
  MidiControlEvent,
  MidiNoteEvent,
  MidiPitchBendEvent,
  MidiProgramEvent,
  MidiTempoEvent,
  MidiTrackData,
  NspcEvent,
} from '../types.js';
import {
  getSampleName,
  nspcPanToMidi,
  nspcTuningToPitchBend,
  sampleIdToMidiProgram,
  SPC_SLOT_BASE,
} from '../constants.js';
import { slotToSampleId } from '../parse/sfx-parser.js';
import {
  DEFAULT_TEMPO_BYTE,
  nspcTicksToMidiTicks,
  tempoByteToMicrosecondsPerQuarter,
} from './tempo.js';

/**
 * Lead-in silence (in MIDI ticks) prepended before musical content.
 * Gives FluidSynth / VLC time to initialise the SF2 before the first note.
 * 960 ticks = 2 quarter notes ≈ 1–1.5 s depending on tempo.
 */
const LEAD_IN_TICKS = 960;

interface ChannelState {
  tempoByte: number;
  program: number;
  sampleId: number;
  volume: number;
  pan: number;
  currentSlot: number;
  pitchBend: number;
}

/**
 * Map SPC channel volume (0–240) to MIDI CC7 (1–127).
 *
 * The SNES DSP applies channel volume LINEARLY (amplitude ∝ vol/240).
 * FluidSynth's default CC7 modulator applies a LOGARITHMIC curve:
 *   attenuation_cB = 960 × (1 − CC7/127)
 *   amplitude      = 10^(−attenuation_cB / 200)
 *
 * A naïve linear mapping (CC7 = vol/240 × 127) preserves the ratio but
 * FluidSynth interprets it logarithmically, making quiet channels nearly
 * inaudible (e.g., SNES vol=25 → 10% amplitude, but linear CC7=13 →
 * FluidSynth amplitude 0.005%).
 *
 * The correct mapping inverts FluidSynth's curve so that the final
 * amplitude matches the SNES linear target:
 *   CC7 = 127 × (1 + (200/960) × log₁₀(vol/240))
 */
function scaleVolume(vol: number): number {
  if (vol <= 0) return 1;
  const linearAmp = vol / 240;
  const cc7 = 127 * (1 + (200 / 960) * Math.log10(linearAmp));
  return Math.max(1, Math.min(127, Math.round(cc7)));
}

function processEvents(
  events: NspcEvent[],
  channelIndex: number,
  state: ChannelState,
  decoded: DecodedBgm,
  notes: MidiNoteEvent[],
  controls: MidiControlEvent[],
  programs: MidiProgramEvent[],
  tempos: MidiTempoEvent[],
  pitchBends: MidiPitchBendEvent[],
  startTick: number,
): number {
  let tick = startTick;

  for (const ev of events) {
    if (ev.kind === 'end') break;

    const midiTick = nspcTicksToMidiTicks(tick);

    switch (ev.kind) {
      case 'tempo':
        state.tempoByte = ev.value;
        tempos.push({
          tick: midiTick,
          microsecondsPerQuarter: tempoByteToMicrosecondsPerQuarter(ev.value),
        });
        break;

      case 'mainVolume':
        state.volume = ev.value;
        controls.push({
          tick: midiTick,
          channel: channelIndex,
          controller: 7,
          value: scaleVolume(ev.value),
        });
        break;

      case 'volume':
        state.volume = ev.value;
        controls.push({
          tick: midiTick,
          channel: channelIndex,
          controller: 7,
          value: scaleVolume(ev.value),
        });
        break;

      case 'pan':
        state.pan = ev.value;
        controls.push({
          tick: midiTick,
          channel: channelIndex,
          controller: 10,
          value: nspcPanToMidi(ev.value),
        });
        break;

      case 'tuning':
        state.pitchBend = nspcTuningToPitchBend(ev.value);
        pitchBends.push({
          tick: midiTick,
          channel: channelIndex,
          value: state.pitchBend,
        });
        break;

      case 'vibrato':
        controls.push({
          tick: midiTick,
          channel: channelIndex,
          controller: 1,
          value: Math.min(127, Math.round((ev.depth / 255) * 127)),
        });
        break;

      case 'vibratoOff':
        controls.push({
          tick: midiTick,
          channel: channelIndex,
          controller: 1,
          value: 0,
        });
        break;

      case 'echo':
        controls.push({
          tick: midiTick,
          channel: channelIndex,
          controller: 91,
          value: ev.enabled !== 0
            ? Math.min(127, Math.round((ev.volume / 255) * 127))
            : 0,
        });
        break;

      case 'setInstrument': {
        state.currentSlot = ev.slot;
        const sampleId = slotToSampleId(ev.slot, decoded.spcSlots, decoded.sampleIds);
        if (sampleId !== undefined) {
          state.sampleId = sampleId;
          state.program = sampleIdToMidiProgram(sampleId);
          programs.push({
            tick: midiTick,
            channel: channelIndex,
            program: state.program,
          });
        }
        break;
      }

      case 'note':
        notes.push({
          tick: midiTick,
          midiNote: ev.midiNote,
          velocity: ev.velocity,
          duration: nspcTicksToMidiTicks(ev.gateTime),
          channel: channelIndex,
          isDrum: false,
        });
        tick += ev.duration;
        break;

      case 'percussion':
        notes.push({
          tick: midiTick,
          midiNote: ev.note,
          velocity: ev.velocity,
          duration: nspcTicksToMidiTicks(ev.gateTime),
          channel: channelIndex,
          isDrum: true,
        });
        tick += ev.duration;
        break;

      case 'rest':
        tick += ev.duration;
        break;
    }
  }

  return tick;
}

export function buildMidiTracks(decoded: DecodedBgm): MidiTrackData[] {
  const tracks: MidiTrackData[] = [];
  const globalTempos: MidiTempoEvent[] = [
    {
      tick: 0,
      microsecondsPerQuarter: tempoByteToMicrosecondsPerQuarter(DEFAULT_TEMPO_BYTE),
    },
  ];

  for (let ch = 0; ch < 8; ch++) {
    const track = decoded.song.channels[ch]!;
    const hasIntro = track.introEvents.some((e) => e.kind !== 'end');
    const hasLoop = track.loopEvents.some((e) => e.kind !== 'end');
    if (!hasIntro && !hasLoop) continue;

    const notes: MidiNoteEvent[] = [];
    const controls: MidiControlEvent[] = [];
    const programs: MidiProgramEvent[] = [];
    const tempos: MidiTempoEvent[] = [];
    const pitchBends: MidiPitchBendEvent[] = [];

    const defaultSampleId = decoded.sampleIds[0] ?? 0x0f;
    const state: ChannelState = {
      tempoByte: DEFAULT_TEMPO_BYTE,
      program: sampleIdToMidiProgram(defaultSampleId),
      sampleId: defaultSampleId,
      volume: 240,
      pan: 10,
      currentSlot: SPC_SLOT_BASE,
      pitchBend: 8192,
    };

    let endTick = 0;
    if (hasIntro) {
      endTick = processEvents(
        track.introEvents,
        ch,
        state,
        decoded,
        notes,
        controls,
        programs,
        tempos,
        pitchBends,
        0,
      );
    }

    if (hasLoop) {
      processEvents(
        track.loopEvents,
        ch,
        state,
        decoded,
        notes,
        controls,
        programs,
        tempos,
        pitchBends,
        endTick,
      );
    }

    // Ensure every channel has at least one program change.
    // If the intro/loop already set an instrument, this is unnecessary.
    // If not, use the fallback default as the first program change.
    if (programs.length === 0) {
      programs.unshift({ tick: 0, channel: ch, program: state.program });
    }

    for (const n of notes) n.tick += LEAD_IN_TICKS;
    for (const c of controls) c.tick += LEAD_IN_TICKS;
    for (const p of programs) p.tick += LEAD_IN_TICKS;
    for (const b of pitchBends) b.tick += LEAD_IN_TICKS;
    for (const t of tempos) t.tick += LEAD_IN_TICKS;

    if (tempos.length > 0) {
      globalTempos.push(...tempos);
    }

    const sampleName = getSampleName(state.sampleId);
    tracks.push({
      channel: ch,
      name: `Ch ${ch + 1}: ${sampleName}`,
      notes,
      controls,
      programs,
      tempos: [],
      pitchBends,
    });
  }

  globalTempos.sort((a, b) => a.tick - b.tick);
  const dedupedTempos: MidiTempoEvent[] = [];
  for (const t of globalTempos) {
    if (dedupedTempos.length > 0 && dedupedTempos[dedupedTempos.length - 1]!.tick === t.tick) {
      dedupedTempos[dedupedTempos.length - 1] = t;
    } else {
      dedupedTempos.push(t);
    }
  }

  tracks.unshift({
    channel: -1,
    name: 'Conductor',
    notes: [],
    controls: [],
    programs: [],
    tempos: dedupedTempos,
    pitchBends: [],
  });

  return tracks;
}

export function getSongDurationTicks(tracks: MidiTrackData[]): number {
  let max = 0;
  for (const track of tracks) {
    for (const note of track.notes) {
      max = Math.max(max, note.tick + note.duration);
    }
  }
  return max;
}
