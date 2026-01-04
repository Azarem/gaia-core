
export class OpCode {
    public code: number;
    public mnem: string;
    public mode: string;

    constructor(code: number, mnem: string, mode: string) {
        this.code = code;
        this.mnem = mnem;
        this.mode = mode;
    }
}
