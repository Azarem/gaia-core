
export class DbAddressingMode {
    public name: string;
    public shorthand: string;
    public operands: string[];
    public size: number;
    public formatString?: string;
    public parseRegex?: string;
    public instructions: Record<string, number>;

    constructor(data: Partial<DbAddressingMode>) {
        if(!data.name) throw new Error('Addressing mode name is required');
        if(!data.shorthand) throw new Error('Addressing mode shorthand is required');
        if(!data.instructions) throw new Error('Addressing mode instructions are required');
        if(!data.size) throw new Error('Addressing mode size is required');

        this.name = data.name;
        this.shorthand = data.shorthand;
        this.operands = data.operands ?? [];
        this.size = data.size ?? 1;
        this.formatString = data.formatString ?? undefined;
        this.parseRegex = data.parseRegex ?? undefined;
        this.instructions = data.instructions;
    }
}
