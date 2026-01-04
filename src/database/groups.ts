import { DbScene } from "./scenes";

export class DbGroup {
    public name: string;
    public prefix: string;
    public description?: string;
    public scenes: Record<string, DbScene>;

    constructor(data: Partial<DbGroup>) {
        this.name = data.name ?? '';
        this.prefix = data.prefix ?? '';
        this.description = data.description ?? '';
        this.scenes = data.scenes ?? {};
    }
}