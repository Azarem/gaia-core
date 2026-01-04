/**
 * Utility functions for Supabase integration
 */

/**
 * Get environment variable value that works in both browser and Node.js contexts
 * @param key - The environment variable key to retrieve
 * @throws {Error} If the environment variable is not set
 * @returns The environment variable value
 */
export function getEnvVar(key: string): string {
  let value = '';

  // Try different environment variable sources in order of preference
  try {
    // Browser with Vite (import.meta.env) - check if we're in a browser environment
    if (typeof globalThis !== 'undefined' &&
        typeof (globalThis as any).window !== 'undefined' &&
        typeof import.meta !== 'undefined' &&
        (import.meta as any).env) {
      const env = (import.meta as any).env;
      // Try the exact key first
      value = env[key] ||
              // Try with VITE_ prefix if not already prefixed
              (key.startsWith('VITE_') ? '' : env[`VITE_${key}`]) ||
              '';
    }
  } catch (error) {
    // import.meta might not be available in all contexts, continue to Node.js fallback
  }

  // Node.js (process.env) - fallback or primary for server-side
  if (!value && typeof process !== 'undefined' && process.env) {
    value = process.env[key] ||
            // Try with VITE_ prefix if not already prefixed (for Node.js build tools)
            (key.startsWith('VITE_') ? '' : process.env[`VITE_${key}`]) ||
            '';
  }

  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }

  return value;
}

/**
 * Convert base64 string to Uint8Array for binary data processing
 * @param base64 - Base64 encoded string
 * @returns Uint8Array containing the binary data
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  // Handle data URLs by extracting just the base64 part
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  
  try {
    // Use browser's built-in atob if available
    if (typeof atob !== 'undefined') {
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }
    
    // Node.js fallback
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64Data, 'base64'));
    }
    
    throw new Error('No base64 decoding method available');
  } catch (error) {
    throw new Error(`Failed to decode base64 data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Convert hex-encoded string to Uint8Array
 * @param hexString - Hex encoded string (with or without \x prefix)
 * @returns Uint8Array containing the binary data
 */
export function hexToUint8Array(hexString: string): Uint8Array {
  try {
    // Remove \x prefixes and any whitespace
    let cleanHex = hexString.replace(/\\x/g, '').replace(/\s/g, '');

    // Ensure even length
    if (cleanHex.length % 2 !== 0) {
      throw new Error('Hex string must have even length');
    }

    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      const hexByte = cleanHex.substring(i, i + 2);
      const byte = parseInt(hexByte, 16);
      if (isNaN(byte)) {
        throw new Error(`Invalid hex character at position ${i}: ${hexByte}`);
      }
      bytes[i / 2] = byte;
    }

    return bytes;
  } catch (error) {
    throw new Error(`Failed to decode hex data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Convert binary data to appropriate format based on the input string
 * Automatically detects if the input is hex-encoded or base64
 * @param dataString - Either hex-encoded string (starting with \x) or base64 string
 * @returns Uint8Array containing the binary data
 */
export function decodeDataString(dataString: string): Uint8Array {
  // Check if it's hex-encoded (starts with \x)
  if (dataString.startsWith('\\x')) {
    return hexToUint8Array(dataString);
  }

  // Otherwise assume it's base64
  return base64ToUint8Array(dataString);
}

/**
 * Convert Uint8Array to base64 string
 * @param uint8Array - Binary data as Uint8Array
 * @returns Base64 encoded string
 */
export function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  try {
    // Use browser's built-in btoa if available
    if (typeof btoa !== 'undefined') {
      const binaryString = Array.from(uint8Array)
        .map(byte => String.fromCharCode(byte))
        .join('');
      return btoa(binaryString);
    }
    
    // Node.js fallback
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(uint8Array).toString('base64');
    }
    
    throw new Error('No base64 encoding method available');
  } catch (error) {
    throw new Error(`Failed to encode base64 data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate that required environment variables are set
 * @param requiredVars - Array of environment variable names that must be set
 * @throws {Error} If any required environment variable is missing
 */
export function validateEnvironmentVariables(requiredVars: string[]): void {
  const missingVars: string[] = [];
  
  for (const varName of requiredVars) {
    try {
      getEnvVar(varName);
    } catch {
      missingVars.push(varName);
    }
  }
  
  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}\n` +
      'For web/Vite environments, use VITE_ prefixed variables (e.g., VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)\n' +
      'For Node.js environments, use the variable names directly (e.g., SUPABASE_URL, SUPABASE_ANON_KEY)'
    );
  }
}
