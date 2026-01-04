import type { ChunkFile } from '../types/files';
import { writeFileSync } from 'fs';

/**
 * Debug utility to export processing results as JSON for comparison
 */
export class DebugExporter {
  
  /**
   * Export chunk files to JSON for comparison with C# output
   */
  public static exportChunkFiles(files: ChunkFile[], filename: string): void {
    const exportData = {
      timestamp: new Date().toISOString(),
      totalFiles: files.length,
      files: files.map(file => ({
        name: file.name,
        type: file.type,
        size: file.size,
        location: file.location,
        bank: file.bank,
        upper: file.upper,
        compressed: file.compressed,
        hasTextData: !!file.textData,
        textDataLength: file.textData?.length || 0,
        hasParts: !!file.parts,
        partsCount: file.parts?.length || 0,
        hasIncludes: !!file.includes,
        includesCount: file.includes?.size || 0,
        includesList: file.includes ? Array.from(file.includes).sort() : [],
        parts: file.parts?.map(part => ({
          label: part.label,
          location: part.location,
          size: part.size,
          objListCount: part.objList?.length || 0,
          hasObjList: !!part.objList,
          objList: part.objList?.map(obj => ({
            location: obj.location,
            size: obj.size,
            hasObject: !!obj.object,
            objectType: obj.object?.constructor?.name || 'unknown'
          })) || []
        })) || []
      }))
    };

    try {
      writeFileSync(filename, JSON.stringify(exportData, null, 2));
      console.log(`📄 Exported ${files.length} files to ${filename}`);
    } catch (error) {
      console.error(`❌ Failed to export to ${filename}:`, error);
    }
  }

  /**
   * Export patch application summary
   */
  public static exportPatchSummary(
    originalFiles: ChunkFile[], 
    patchedFiles: ChunkFile[], 
    patches: ChunkFile[], 
    filename: string
  ): void {
    const summary = {
      timestamp: new Date().toISOString(),
      originalFileCount: originalFiles.length,
      patchedFileCount: patchedFiles.length,
      patchCount: patches.length,
      patches: patches.map(patch => ({
        name: patch.name,
        partsCount: patch.parts?.length || 0,
        includesCount: patch.includes?.size || 0,
        includes: patch.includes ? Array.from(patch.includes).sort() : []
      })),
      sizeChanges: patchedFiles.map(file => {
        const original = originalFiles.find(f => f.name === file.name);
        return {
          name: file.name,
          originalSize: original?.size || 0,
          patchedSize: file.size || 0,
          sizeDelta: (file.size || 0) - (original?.size || 0),
          originalPartsCount: original?.parts?.length || 0,
          patchedPartsCount: file.parts?.length || 0,
          partsCountDelta: (file.parts?.length || 0) - (original?.parts?.length || 0)
        };
      }).filter(change => change.sizeDelta !== 0 || change.partsCountDelta !== 0)
    };

    try {
      writeFileSync(filename, JSON.stringify(summary, null, 2));
      console.log(`📊 Exported patch summary to ${filename}`);
    } catch (error) {
      console.error(`❌ Failed to export patch summary to ${filename}:`, error);
    }
  }

  /**
   * Export layout debugging information
   */
  public static exportLayoutDebug(files: ChunkFile[], filename: string): void {
    const layoutData = {
      timestamp: new Date().toISOString(),
      totalFiles: files.length,
      filesWithSize: files.filter(f => (f.size || 0) > 0).length,
      filesWithoutSize: files.filter(f => (f.size || 0) === 0).length,
      asmFiles: files.filter(f => !!f.parts).length,
      binaryFiles: files.filter(f => !f.parts).length,
      files: files.map(file => ({
        name: file.name,
        size: file.size || 0,
        hasSize: (file.size || 0) > 0,
        isAsm: !!file.parts,
        bank: file.bank,
        upper: file.upper,
        location: file.location,
        partsCount: file.parts?.length || 0
      })).sort((a, b) => {
        // Sort by assembly first, then by size desc
        const aAsm = a.isAsm ? 0 : 1;
        const bAsm = b.isAsm ? 0 : 1;
        if (aAsm !== bAsm) return aAsm - bAsm;
        if (b.size !== a.size) return b.size - a.size;
        return a.location - b.location;
      }),
      zeroSizeFiles: files.filter(f => (f.size || 0) === 0).map(f => f.name)
    };

    try {
      writeFileSync(filename, JSON.stringify(layoutData, null, 2));
      console.log(`🏗️  Exported layout debug info to ${filename}`);
    } catch (error) {
      console.error(`❌ Failed to export layout debug to ${filename}:`, error);
    }
  }
}
