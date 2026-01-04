
export class DbOverride {
  location: number;
  register: string;
  value: number;

  constructor(values: Partial<DbOverride>) {
    this.location = values.location ?? 0;
    this.register = values.register ?? '';
    this.value = values.value ?? undefined;

    if(!this.location) throw new Error('Location is required');
    if(!this.register) throw new Error('Register is required');
    if(this.value === undefined) throw new Error('Value is required');
  }
} 