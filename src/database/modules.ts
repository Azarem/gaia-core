import { DbAddressingMode, DbStringType, CopDef, DbConfig, DbStruct, DbBlock, DbGroup, DbTransform, DbFile, DbFileType, DbHeader } from ".";
import { PackageFileEntry } from "../static/types";

export interface DbGameRomModule {
    projectFiles?: PackageFileEntry[]
    baseRomFiles?: PackageFileEntry[]
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
    names?: Record<number, string>
    types?: Record<number, string>
    comments?: Record<number, string>
    blockNotes?: Record<string, string>
    partNotes?: Record<string, string>
}
