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

// Supabase integration
export * from './supabase'

// Utilities
export * from './utils' 

// All core modules have been converted and are exported above


// Platform detection
//export const isPlatformBrowser = typeof window !== 'undefined';
export const isPlatformNode = typeof process !== 'undefined' && process.versions?.node;
//export const isPlatformWebWorker = typeof importScripts !== 'undefined'; 

