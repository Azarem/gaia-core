
export class DbHeader {
    public bank: number;
    public address: number;
    public condition?: string;
    public parts: DbHeaderPart[];

    constructor(data: Partial<DbHeader>) {
        if(typeof data.address !== 'number') throw new Error('Address is required');
        if(!data.parts || !data.parts.length) throw new Error('Parts are required');

        this.bank = data.bank ?? 0;
        this.address = data.address;
        this.condition = data.condition ?? undefined;
        this.parts = data.parts.map(p => new DbHeaderPart(p));
    }
}

export class DbHeaderPart {
    public name: string;
    public size: number;
    public type: string;
    public value?: any;

    constructor(data: Partial<DbHeaderPart>) {
        if(!data.name) throw new Error('Name is required');

        this.name = data.name;
        this.size = data.size ?? 0;
        this.type = data.type ?? '';
        this.value = data.value ?? undefined;
    }
}