import type { DbPart } from './parts';
import { DbTransform } from './transforms';

/**
 * Database block definition
 * Converted from GaiaLib/Database/DbBlock.cs
 */
export class DbBlock {
  public name: string;
  public movable: boolean;
  public group?: string;
  public scene?: string;
  public parts: DbPart[];
  public transforms?: DbTransform[];
  public postProcess?: string;
  public order?: number;
  //public id?: string;

  constructor(data: Partial<DbBlock>) {
    this.name = data.name ?? '';
    this.movable = data.movable ?? false;
    this.group = data.group ?? undefined;
    this.scene = data.scene ?? undefined;
    this.parts = (data.parts ?? []).sort((a, b) => {
      const orderA = a.order ?? a.start ?? 0;
      const orderB = b.order ?? b.start ?? 0;
      return orderA - orderB;
    });
    this.transforms = data.transforms ?? [];
    this.postProcess = data.postProcess ?? undefined;
    this.order = data.order ?? undefined;
    //this.id = data.id ?? undefined;


    if(!this.name) throw new Error('Name is required');
  }
}
