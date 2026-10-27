export interface BgmBlock {
  payloadSize: number;
  spcRamTargetAddr: number;
  payload: Uint8Array;
}

export interface BgmFile {
  blocks: BgmBlock[];
  instrumentCount: number;
  instrumentIds: number[];
  spcRamSampleAddr: number;
}

export interface InstrumentDefinition {
  slot: number;
  definitionBytes: Uint8Array;
}

export interface SampleDirEntry {
  start: number;
  loop: number;
}

export type NspcEvent =
  | { kind: 'note'; pitch: number; midiNote: number; duration: number; gateTime: number; velocity: number }
  | { kind: 'rest'; duration: number }
  | { kind: 'percussion'; note: number; duration: number; gateTime: number; velocity: number }
  | { kind: 'setInstrument'; slot: number }
  | { kind: 'tempo'; value: number }
  | { kind: 'mainVolume'; value: number }
  | { kind: 'volume'; value: number }
  | { kind: 'pan'; value: number }
  | { kind: 'tuning'; value: number }
  | { kind: 'vibrato'; delay: number; rate: number; depth: number }
  | { kind: 'vibratoOff' }
  | { kind: 'echo'; enabled: number; volume: number; feedback: number }
  | { kind: 'end' };

export interface NspcTrack {
  introEvents: NspcEvent[];
  loopEvents: NspcEvent[];
  introPtr: number;
  loopPtr: number;
}

export interface NspcSong {
  baseAddr: number;
  headerType: 'standard' | 'minimal' | 'extended';
  channels: NspcTrack[];
  loopJumpAddr: number;
  sequenceData: Uint8Array;
}

export interface DecodedBgm {
  layout: 'standard' | 'extended' | 'minimal' | 'restart';
  instruments: InstrumentDefinition[];
  driverInitScript: Uint8Array | null;
  velocityTable: Uint8Array;
  song: NspcSong;
  sampleDir: SampleDirEntry[];
  songBasePtr: number;
  sampleEndPtr: number;
  spcSlots: number[];
  sampleIds: number[];
}

export interface SampleMeta {
  id: number;
  name: string;
  definitionBytes: Uint8Array;
  sampleLength: number;
  loopStartOffset: number;
  gmProgram: number;
  isPercussion: boolean;
  brrData?: Uint8Array;
}

export interface MidiNoteEvent {
  tick: number;
  midiNote: number;
  velocity: number;
  duration: number;
  channel: number;
  isDrum: boolean;
}

export interface MidiControlEvent {
  tick: number;
  channel: number;
  controller: number;
  value: number;
}

export interface MidiProgramEvent {
  tick: number;
  channel: number;
  program: number;
}

export interface MidiTempoEvent {
  tick: number;
  microsecondsPerQuarter: number;
}

export interface MidiTrackData {
  channel: number;
  name: string;
  notes: MidiNoteEvent[];
  controls: MidiControlEvent[];
  programs: MidiProgramEvent[];
  tempos: MidiTempoEvent[];
  pitchBends: MidiPitchBendEvent[];
}

export interface MidiPitchBendEvent {
  tick: number;
  channel: number;
  value: number;
}
