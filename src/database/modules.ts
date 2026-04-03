import { DbAddressingMode, DbStringType, CopDef, DbConfig, DbLabel, DbStruct, DbBlock, DbGroup, DbTransform, DbFile, DbFileType, DbHeader } from ".";
import { ChunkFile } from "../types";


export interface DbGameRomModule {
    mnemonics: Record<number, string>
    overrides: Record<number, Record<string, number>>
    rewrites: Record<string, number>
    blocks: Record<string, Record<string, Partial<DbBlock>>>
    files: Record<string, Record<string, Record<string, Partial<DbFile>>>>
    config: DbConfig
    labels: Record<number, string>
    structs: Record<string, DbStruct>
    copdef: Record<string, Partial<CopDef>>
    strings: Record<string, Partial<DbStringType>>
    transforms: Record<string, Partial<DbTransform>[]>
    addrModes: Record<string, Partial<DbAddressingMode>>
    headers: Partial<DbHeader>[]
    groups: Record<string, Partial<DbGroup>>
    fileTypes: Record<string, Partial<DbFileType>>
}

export interface DbBaseRomModule extends DbGameRomModule {
    baseRomFiles: ChunkFile[]
}