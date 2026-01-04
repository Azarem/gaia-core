// import { BinType, DbRootUtils, type ICompressionProvider } from '@gaialabs/shared';
// import type { DbRoot } from '@gaialabs/shared';

// /**
//  * Reads and extracts files from ROM
//  * Converted from GaiaLib/Rom/Extraction/FileReader.cs
//  */
// export class FileReader {
//   public static readonly PALETTE_MIN_SIZE = 0x200;

//   private readonly _romData: Uint8Array;
//   private readonly _dbRoot: DbRoot;
//   private readonly _compression: ICompressionProvider;

//   constructor(romData: Uint8Array, dbRoot: DbRoot, provider: ICompressionProvider) {
//     this._romData = romData;
//     this._dbRoot = dbRoot;
//     this._compression = provider;
//   }

//   /**
//    * Extracts all files from the ROM to the given output path
//    */
//   public async extract(outPath: string): Promise<void> {
//     const isNode = typeof window === 'undefined';
//     const fs = isNode ? await import('fs') : null;

//     // Process each file in the repository
//     for (const file of this._dbRoot.files) {
//       let start = file.start;

//       // Get the path options for the resource type from DbRoot configuration
//       const res = DbRootUtils.getPath(this._dbRoot, file.type);

//       let filePath = outPath;

//       // If resource has a folder, append it to the output path and create the directory
//       if (res.folder) {
//         filePath = `${outPath}/${res.folder}`;
//         if (isNode) {
//           fs!.mkdirSync(filePath, { recursive: true });
//         }
//       }

//       // Append file name and extension to the output path
//       filePath = `${filePath}/${file.name}.${res.extension}`;

//       // If the file already exists, skip it
//       if (isNode && fs!.existsSync(filePath)) {
//         continue;
//       }

//       // Store file header information for post-processing
//       let header: Uint8Array | null = null;
//       if (file.type === BinType.Tilemap) {
//         // Tilemap files have a header of 2 bytes
//         header = new Uint8Array([this._romData[start++], this._romData[start++]]);
//       } else if (file.type === BinType.Meta17) {
//         // Meta17 files have a header of 4 bytes
//         header = new Uint8Array([
//           this._romData[start++],
//           this._romData[start++],
//           this._romData[start++],
//           this._romData[start++]
//         ]);
//       }

//       // Get the length of the raw file
//       let length = file.end - start;

//       // Extract the file data
//       let fileData: Uint8Array;

//       // If the file is compressed, expand it
//       if (file.compressed === true) {
//         // Expand the compressed data
//         const data = this._compression.expand(this._romData, start, length);
//         fileData = this.processFileData(data, 0, data.length, header, file.type);
//       } else {
//         // When "Compressed" is not null (and implied false), this means there is a zero compression header. Skip it
//         if (file.compressed !== null) {
//           start += 2;
//           length -= 2;
//         }

//         // Copy the uncompressed data from the ROM
//         fileData = this.processFileData(this._romData, start, length, header, file.type);
//       }

//       // Write the file (in Node.js environment)
//       if (isNode) {
//         fs!.writeFileSync(filePath, fileData);
//       }
//     }
//   }

//   private processFileData(
//     data: Uint8Array, 
//     position: number, 
//     length: number, 
//     header: Uint8Array | null, 
//     type: BinType
//   ): Uint8Array {
//     let totalLength = length;
//     let headerLength = 0;

//     // Add header length if it exists
//     if (header) {
//       headerLength = header.length;
//       totalLength += headerLength;
//     }

//     // Expand palette to 16 sets so it is compatible with yy-chr
//     if (type === BinType.Palette) {
//       const remain = FileReader.PALETTE_MIN_SIZE - length;
//       if (remain > 0) {
//         totalLength += remain;
//       }
//     }

//     // Create the output buffer
//     const result = new Uint8Array(totalLength);
//     let offset = 0;

//     // Write the header if it exists
//     if (header) {
//       result.set(header, offset);
//       offset += headerLength;
//     }

//     // Write the data
//     result.set(data.slice(position, position + length), offset);
//     offset += length;

//     // Expand palette to 16 sets so it is compatible with yy-chr
//     if (type === BinType.Palette) {
//       const remain = FileReader.PALETTE_MIN_SIZE - length;
//       if (remain > 0) {
//         // Fill with zeros
//         result.fill(0, offset, offset + remain);
//       }
//     }

//     return result;
//   }

// }