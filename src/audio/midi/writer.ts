import type { DecodedBgm, MidiTrackData } from '../types.ts';
import { MIDI_PPQN } from '../constants.ts';
import { buildMidiTracks } from './mapper.ts';

function writeU32BE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = (value >>> 24) & 0xff;
  buf[1] = (value >>> 16) & 0xff;
  buf[2] = (value >>> 8) & 0xff;
  buf[3] = value & 0xff;
  return buf;
}

function writeU16BE(value: number): Uint8Array {
  const buf = new Uint8Array(2);
  buf[0] = (value >>> 8) & 0xff;
  buf[1] = value & 0xff;
  return buf;
}

function writeVarLen(value: number): Uint8Array {
  const bytes: number[] = [value & 0x7f];
  let v = value >>> 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  return new Uint8Array(bytes);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

interface TimedEvent {
  tick: number;
  data: Uint8Array;
  priority: number;
}

function buildTrackEvents(track: MidiTrackData): TimedEvent[] {
  const events: TimedEvent[] = [];

  for (const tempo of track.tempos) {
    events.push({
      tick: tempo.tick,
      priority: 0,
      data: concat(
        new Uint8Array([0xff, 0x51, 0x03]),
        new Uint8Array([
          (tempo.microsecondsPerQuarter >>> 16) & 0xff,
          (tempo.microsecondsPerQuarter >>> 8) & 0xff,
          tempo.microsecondsPerQuarter & 0xff,
        ]),
      ),
    });
  }

  const usesDrums = track.notes.some((n) => n.isDrum);
  const midiChannel = track.channel === -1 ? 0 : usesDrums ? 9 : track.channel;

  // Set pitch bend sensitivity to ±2 semitones (GM standard) via RPN 0,0.
  // This ensures all SF2 players interpret our N-SPC tuning pitch bends correctly.
  if (track.channel >= 0 && track.pitchBends.length > 0) {
    const ch = midiChannel & 0x0f;
    for (const rpnMsg of [
      new Uint8Array([0xb0 | ch, 101, 0]),   // RPN MSB = 0
      new Uint8Array([0xb0 | ch, 100, 0]),   // RPN LSB = 0
      new Uint8Array([0xb0 | ch, 6, 2]),     // Data Entry MSB = 2 semitones
      new Uint8Array([0xb0 | ch, 38, 0]),    // Data Entry LSB = 0 cents
      new Uint8Array([0xb0 | ch, 101, 127]), // RPN reset (null)
      new Uint8Array([0xb0 | ch, 100, 127]),
    ]) {
      events.push({ tick: 0, priority: -1, data: rpnMsg });
    }
  }

  for (const prog of track.programs) {
    if (track.channel === -1) continue;
    const ch = usesDrums && !track.notes.some((n) => !n.isDrum) ? 9 : track.channel;
    events.push({
      tick: prog.tick,
      priority: 1,
      data: new Uint8Array([0xc0 | (ch & 0x0f), prog.program & 0x7f]),
    });
  }

  for (const bend of track.pitchBends) {
    events.push({
      tick: bend.tick,
      priority: 2,
      data: new Uint8Array([
        0xe0 | (bend.channel & 0x0f),
        bend.value & 0x7f,
        (bend.value >> 7) & 0x7f,
      ]),
    });
  }

  for (const ctrl of track.controls) {
    events.push({
      tick: ctrl.tick,
      priority: 3,
      data: new Uint8Array([
        0xb0 | (ctrl.channel & 0x0f),
        ctrl.controller & 0x7f,
        ctrl.value & 0x7f,
      ]),
    });
  }

  for (const note of track.notes) {
    const ch = note.isDrum ? 9 : note.channel;
    // Note-off priority (3) < note-on priority (5) so at the same tick,
    // the old note stops before the new one starts — matching SNES monophonic channels.
    events.push({
      tick: note.tick,
      priority: 5,
      data: new Uint8Array([0x90 | (ch & 0x0f), note.midiNote & 0x7f, note.velocity & 0x7f]),
    });
    events.push({
      tick: note.tick + note.duration,
      priority: 3,
      data: new Uint8Array([0x80 | (ch & 0x0f), note.midiNote & 0x7f, 0]),
    });
  }

  events.sort((a, b) => a.tick - b.tick || a.priority - b.priority);
  return events;
}

function encodeTrack(events: TimedEvent[], trackName: string): Uint8Array {
  const parts: Uint8Array[] = [];
  let lastTick = 0;

  if (trackName) {
    const nameBytes = new TextEncoder().encode(trackName);
    parts.push(
      concat(
        writeVarLen(0),
        new Uint8Array([0xff, 0x03]),
        new Uint8Array([nameBytes.length]),
        nameBytes,
      ),
    );
  }

  for (const ev of events) {
    parts.push(concat(writeVarLen(ev.tick - lastTick), ev.data));
    lastTick = ev.tick;
  }

  parts.push(concat(writeVarLen(0), new Uint8Array([0xff, 0x2f, 0x00])));

  const trackData = concat(...parts);
  return concat(
    new TextEncoder().encode('MTrk'),
    writeU32BE(trackData.length),
    trackData,
  );
}

export function writeMidi(tracks: MidiTrackData[], title?: string): Uint8Array {
  const encodedTracks: Uint8Array[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]!;
    const events = buildTrackEvents(track);
    const name = i === 0 && title ? title : track.name;
    encodedTracks.push(encodeTrack(events, name));
  }

  const header = concat(
    new TextEncoder().encode('MThd'),
    writeU32BE(6),
    writeU16BE(1),
    writeU16BE(tracks.length),
    writeU16BE(MIDI_PPQN),
  );

  return concat(header, ...encodedTracks);
}

export function bgmToMidi(decoded: DecodedBgm, title?: string): Uint8Array {
  const tracks = buildMidiTracks(decoded);
  return writeMidi(tracks, title);
}
