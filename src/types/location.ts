import { AddressType } from './addressing';

/**
 * Location wrapper for additional metadata
 * Converted from GaiaLib/Types/LocationWrapper.cs
 */
export class LocationWrapper {
  public location: number;
  public type: AddressType;

  constructor(location: number, type: AddressType) {
    this.location = location;
    this.type = type;
  }
} 