// Persistence of the per-character stone bag (collection character_pet_stones). Callers hold the character lock.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { cloneBag, type StoneBag } from './pet-stone-rules';
import { CharacterPetStone } from './pet-stone.schema';

@Injectable()
export class PetStoneStore {
  constructor(@InjectModel(CharacterPetStone.name) private readonly states: Model<CharacterPetStone>) {}

  /** The bag as an independent copy (a missing document is created empty). */
  async load(characterId: number): Promise<StoneBag> {
    const row = await this.states.findOneAndUpdate({ characterId }, { $setOnInsert: { bag: {} } }, { new: true, upsert: true }).lean();
    return cloneBag(row.bag ?? {});
  }

  async save(characterId: number, bag: StoneBag): Promise<void> {
    await this.states.updateOne({ characterId }, { $set: { bag } });
  }
}
