export class TypedNumber {
  value: number;
  size: number;

  constructor(value: number, size: number) {
    this.value = value;
    this.size = size;
  }
}

export class Byte extends TypedNumber {
  constructor(value: number) {
    super(value & 0xFF, 1);
  }
}

export class Word extends TypedNumber {
  constructor(value: number) {
    super(value & 0xFFFF, 2);
  }
}

export class Long extends TypedNumber {
  constructor(value: number) {
    super(value & 0xFFFFFF, 3);
  }
}