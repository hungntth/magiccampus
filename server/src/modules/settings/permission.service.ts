// Player permission gates of the "Hệ thống" panel (M9 phase G, H5 decision 13: Go stored them, H5 enforces them): ag (team
// invites), achat (private chat), at (trade). Read from Character.interfaceData, cached per character and refreshed by us().

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { settingOn, type PermissionKey } from '@mc/shared';
import { Character } from '../character/character.schema';

type Flags = Partial<Record<PermissionKey, number | boolean>>;
const KEYS: readonly PermissionKey[] = ['ag', 'achat', 'at'];

@Injectable()
export class PermissionService {
  private readonly cache = new Map<number, Flags>();

  constructor(@InjectModel(Character.name) private readonly chars: Model<Character>) {}

  async allows(characterId: number, key: PermissionKey): Promise<boolean> {
    let flags = this.cache.get(characterId);
    if (!flags) {
      const doc = await this.chars.findById(characterId, { interfaceData: 1 }).lean();
      const data = doc?.interfaceData ?? {};
      flags = {};
      for (const k of KEYS) if (data[k] !== undefined) flags[k] = data[k];
      this.cache.set(characterId, flags);
    }
    return settingOn(flags, key);
  }

  /** us() saved these keys: keep the cache in step. */
  saved(characterId: number, fields: Readonly<Record<string, number | boolean>>): void {
    const flags = this.cache.get(characterId);
    if (!flags) return;
    for (const k of KEYS) if (fields[k] !== undefined) flags[k] = fields[k];
  }
}
