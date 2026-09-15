export class TypedNumber {
  value: number;
  size: number;
  isDelimiter?: boolean;

  constructor(value: number, size: number, isDelimiter?: boolean) {
    this.value = value;
    this.size = size;
    this.isDelimiter = isDelimiter;
  }
}

export class Byte extends TypedNumber {
  constructor(value: number, isDelimiter?: boolean) {
    super(value & 0xFF, 1, isDelimiter);
  }
}

export class Word extends TypedNumber {
  constructor(value: number, isDelimiter?: boolean) {
    super(value & 0xFFFF, 2, isDelimiter);
  }
}

export class Long extends TypedNumber {
  constructor(value: number) {
    super(value & 0xFFFFFF, 3);
  }
}