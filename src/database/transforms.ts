
export class DbTransform {
  key: string; 
  value: string;

  constructor(data: Partial<DbTransform>) {
    this.key = data.key ?? '';
    this.value = data.value ?? '';

    if(!this.key) throw new Error('Key is required');
  }
} 