// Universal ROM processing engine for GaiaLabs
// This is the main entry point for gaia-core


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

/**
 * GaiaCore - Universal ROM processing engine
 * 
 * This package provides the core functionality for ROM processing
 * that can run in both browser (Web Worker) and Node.js environments.
 * 
 * High-level APIs:
 * - RomProcessor: Unified ROM processing workflows
 * - ProjectManager: Complete project lifecycle management
 * 
 * Low-level modules:
 * - ROM: ROM state management, project configuration
 * - Assembly: 65816 instruction set, stack operations
 * - Compression: QuintetLZ compression algorithm
 * - Sprites: Sprite animation system
 */
export const GAIA_CORE_VERSION = '0.1.6';

// Platform detection
export const isPlatformBrowser = typeof window !== 'undefined';
export const isPlatformNode = typeof process !== 'undefined' && process.versions?.node;
export const isPlatformWebWorker = typeof importScripts !== 'undefined'; 