
export class DbOverride {
  location: number;
  register: string;
  value: number;

  constructor(values: Partial<DbOverride>) {
    if(typeof values.value !== 'number') throw new Error('Value is required');
    if(typeof values.location !== 'number') throw new Error('Location is required');
    if(!values.register) throw new Error('Register is required');

    this.location = values.location;
    this.register = values.register;
    this.value = values.value;

  }
} 