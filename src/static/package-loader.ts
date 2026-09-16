/**
 * Static ROM package loader
 * 
 * Provides browser-friendly fetch-based alternatives to Supabase loading.
 * Reads pre-built JSON packages served as static files from GitHub Pages
 * or any other static hosting.
 */

import { DbGameRomModule } from '../database/modules';
import type { PackageSummary } from './types';

/**
 * Fetch the lightweight summary from a static package URL.
 * Appends a timestamp query param to bypass browser/CDN caching so the
 * summary (and its embedded `packageHash`) is always fresh.
 * 
 * @param baseUrl - Base URL where the static package is hosted (e.g. '/data' or 'https://example.com/data')
 * @returns PackageSummary with project name, version, modules, CRC, fileTypes, packageHash
 */
export async function summaryFromPackageUrl(baseUrl: string): Promise<PackageSummary> {
  const url = `${baseUrl}/summary.json?t=${Date.now()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch package summary from ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<PackageSummary>;
}

/**
 * Fetch the full ROM package from a static URL and assemble a DbGameRomModule.
 * 
 * When a `packageHash` is provided (from the summary), it is appended as a
 * query param so the browser cache invalidates whenever the content changes.
 * 
 * Binary file data stored as base64 strings is decoded to Uint8Array.
 * 
 * @param baseUrl - Base URL where the static package is hosted (e.g. '/data' or 'https://example.com/data')
 * @param packageHash - Content hash from PackageSummary.packageHash for cache-busting
 * @returns DbGameRomModule ready for use with DbRootUtils.fromGameModule()
 */
export async function fromPackageUrl(baseUrl: string, packageHash?: string): Promise<DbGameRomModule> {
  const cacheBust = packageHash ? `?h=${packageHash}` : '';
  const url = `${baseUrl}/rom-package.json${cacheBust}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ROM package from ${url}: ${response.status} ${response.statusText}`);
  }

  const pkg = await response.json() as any;

  const module: DbGameRomModule = {
    projectFiles: pkg.projectFiles,
    baseRomFiles: pkg.baseRomFiles,
    mnemonics: pkg.mnemonics,
    overrides: pkg.overrides,
    rewrites: pkg.rewrites,
    blocks: pkg.blocks,
    files: pkg.files,
    config: pkg.config,
    labels: pkg.labels,
    structs: pkg.structs,
    copdef: pkg.copdef,
    strings: pkg.strings,
    transforms: pkg.transforms,
    groups: pkg.groups,
    fileTypes: pkg.fileTypes,
    addrModes: pkg.addrModes,
    headers: pkg.headers,
    names: pkg.names,
    types: pkg.types,
  };

  return module;
}
