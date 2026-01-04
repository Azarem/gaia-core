/**
 * Universal file reading utilities
 * Works in both Node.js and browser environments
 */

// Platform detection
const isNode = typeof process !== 'undefined' && process.versions?.node;
// const isBrowser = typeof globalThis !== 'undefined' && 'window' in globalThis;

export interface FileReadOptions {
  encoding?: 'utf8' | 'binary';
}

/**
 * Read a file as text
 * @param path File path or URL
 * @param options Read options
 * @returns Promise<string>
 */
export async function readFileAsText(path: string, options: FileReadOptions = {}): Promise<string> {
  const { encoding = 'utf8' } = options;
  
  if (isNode) {
    // Node.js environment
    const { readFile } = await import('fs/promises');
    const pathModule = await import('path');
    
    const fullPath = pathModule.resolve(path);
    
    try {
      let text = await readFile(fullPath, { encoding });
      
      // Strip UTF-8 BOM if present
      if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
      }
      
      return text;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${fullPath}`);
      }
      throw error;
    }
  } else {
    // Browser environment
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${path} (${response.status})`);
    }
    
    let text = await response.text();
    
    // Strip UTF-8 BOM if present
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }
    
    return text;
  }
}

/**
 * Read a file as binary data (Uint8Array)
 * @param path File path or URL
 * @returns Promise<Uint8Array>
 */
export async function readFileAsBinary(path: string): Promise<Uint8Array> {
  if (isNode) {
    // Node.js environment
    const { readFile } = await import('fs/promises');
    const pathModule = await import('path');
    
    const fullPath = pathModule.resolve(path);

    try {
      const buffer = await readFile(fullPath);
      return new Uint8Array(buffer);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${fullPath}`);
      }
      throw error;
    }
  } else {
    // Browser environment
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${path} (${response.status})`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
}

/**
 * Read a JSON file and parse it
 * @param path File path or URL
 * @returns Promise<any>
 */
export async function readJsonFile<T = any>(path: string): Promise<T> {
  const text = await readFileAsText(path);
  return JSON.parse(text) as T;
}

/**
 * Check if a file exists
 * @param path File path
 * @returns Promise<boolean>
 */
export async function fileExists(path: string): Promise<boolean> {
  if (isNode) {
    // Node.js environment
    const { access } = await import('fs/promises');
    const pathModule = await import('path');
    
    const fullPath = pathModule.resolve(path);
    try {
      await access(fullPath);
      return true;
    } catch {
      return false;
    }
  } else {
    // Browser environment - try to fetch and check if successful
    try {
      const response = await fetch(path, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Get the directory path containing a file
 * @param filePath File path
 * @returns string
 */
export async function getDirectory(filePath: string): Promise<string> {
  if (isNode) {
    // Node.js environment
    const path = await import('path');
    return path.dirname(path.resolve(filePath));
  } else {
    // Browser environment
    const url = new URL(filePath, (globalThis as any).location.href);
    return url.pathname.split('/').slice(0, -1).join('/') || './';
  }
}

/**
 * Create a temporary directory.
 * This is a Node.js-specific operation.
 * @param prefix Prefix for the temporary directory name.
 * @returns Promise<string> Path to the created temporary directory.
 */
export async function createTempDirectory(prefix: string): Promise<string> {
  if (isNode) {
    const { mkdtemp } = await import('fs/promises');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    return mkdtemp(join(tmpdir(), prefix));
  } else {
    throw new Error('createTempDirectory is not supported in the browser environment.');
  }
}

/**
 * Remove a directory recursively.
 * This is a Node.js-specific operation.
 * @param dirPath Path to the directory to remove.
 * @returns Promise<void>
 */
export async function removeDirectory(dirPath: string): Promise<void> {
  if (isNode) {
    const { rm } = await import('fs/promises');
    return rm(dirPath, { recursive: true, force: true });
  } else {
    throw new Error('removeDirectory is not supported in the browser environment.');
  }
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
}

/**
 * List directory contents
 * This is a Node.js-specific operation.
 * @param dirPath Path to the directory to list
 * @param options Options for filtering and recursion
 * @returns Promise<DirectoryEntry[]>
 */
export async function listDirectory(
  dirPath: string,
  options: {
    recursive?: boolean;
    filter?: (entry: DirectoryEntry) => boolean;
    extension?: string;
  } = {}
): Promise<DirectoryEntry[]> {
  if (isNode) {
    const { readdir, stat } = await import('fs/promises');
    const pathModule = await import('path');

    const { recursive = false, filter, extension } = options;
    const fullPath = pathModule.resolve(dirPath);

    try {
      const entries: DirectoryEntry[] = [];
      const items = await readdir(fullPath);

      for (const item of items) {
        const itemPath = pathModule.join(fullPath, item);
        const stats = await stat(itemPath);

        const entry: DirectoryEntry = {
          name: item,
          path: itemPath,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile()
        };

        // Apply extension filter
        if (extension && entry.isFile && !entry.name.endsWith(extension)) {
          continue;
        }

        // Apply custom filter
        if (filter && !filter(entry)) {
          continue;
        }

        entries.push(entry);

        // Recurse into subdirectories if requested
        if (recursive && entry.isDirectory) {
          const subEntries = await listDirectory(itemPath, options);
          entries.push(...subEntries);
        }
      }

      return entries;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Directory not found: ${fullPath}`);
      }
      throw error;
    }
  } else {
    throw new Error('listDirectory is not supported in the browser environment.');
  }
}

/**
 * Save text content to a file
 * This is a Node.js-specific operation.
 * @param path File path where to save the content
 * @param text Text content to save
 * @returns Promise<void>
 */
export async function saveFileAsText(path: string, text: string): Promise<void> {
  if (isNode) {
    const { writeFile, mkdir } = await import('fs/promises');
    const pathModule = await import('path');

    const fullPath = pathModule.resolve(path);
    const dirPath = pathModule.dirname(fullPath);

    try {
      // Ensure parent directories exist
      await mkdir(dirPath, { recursive: true });

      // Write the file with UTF-8 encoding
      await writeFile(fullPath, text, { encoding: 'utf8' });
    } catch (error: any) {
      throw new Error(`Failed to save file: ${fullPath} - ${error.message}`);
    }
  } else {
    throw new Error('saveFileAsText is not supported in the browser environment.');
  }
}

/**
 * Save binary data to a file
 * This is a Node.js-specific operation.
 * @param path File path where to save the data
 * @param data Binary data as Uint8Array to save
 * @returns Promise<void>
 */
export async function saveFileAsBinary(path: string, data: Uint8Array): Promise<void> {
  if (isNode) {
    const { writeFile, mkdir } = await import('fs/promises');
    const pathModule = await import('path');

    const fullPath = pathModule.resolve(path);
    const dirPath = pathModule.dirname(fullPath);

    try {
      // Ensure parent directories exist
      await mkdir(dirPath, { recursive: true });

      // Write the binary data directly
      await writeFile(fullPath, data);
    } catch (error: any) {
      throw new Error(`Failed to save file: ${fullPath} - ${error.message}`);
    }
  } else {
    throw new Error('saveFileAsBinary is not supported in the browser environment.');
  }
}