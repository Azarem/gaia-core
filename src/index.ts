import snesAddressingModes from '../snes/addressingModes.json' with { type: 'json' };
import snesVectors from '../snes/vectors.json' with { type: 'json' };
import snesHeaders from '../snes/headers.json' with { type: 'json' };

export const snes = {
    addressingModes: snesAddressingModes,
    vectors: snesVectors,
    headers: snesHeaders
}

// Core modules
export * from './rom';
export * from './assembly';
export * from './compression';
export * from './sprites';

// Core types
export * from './types'
export * from './project'
export * from './collaboration'

// Database
export * from './database'

// Static package loading
export * from './static'

// Utilities
export * from './utils' 

// Audio — BRR decode, SFX/BGM parsing, MIDI conversion, SoundFont generation
export * from './audio'


// Platform detection
//export const isPlatformBrowser = typeof window !== 'undefined';
export const isPlatformNode = typeof process !== 'undefined' && process.versions?.node;
//export const isPlatformWebWorker = typeof importScripts !== 'undefined'; 

