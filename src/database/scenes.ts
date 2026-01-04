import { DbAsset } from "./assets";

export class DbScene {
    public name: string;
    public id: number;
    public description?: string;
    public assets: DbAsset[];
    
    constructor(data: Partial<DbScene>) {
        this.name = data.name ?? '';
        this.id = data.id ?? 0;
        this.description = data.description ?? '';
        this.assets = data.assets ?? [];

        if(!this.name) throw new Error('Scene name is required');
        if(!this.id) throw new Error('Scene id is required');
    }
}