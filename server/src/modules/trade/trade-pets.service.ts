// Pet side of a trade (M11 phase D): reads the pets of an offer, checks the transfer rule and the receivers' pet rooms, builds the
// display wrappers for onTargetLock / onAddPet, and implements the conditional pet moves of the swap saga (PetMoveStore). Pets keep
// their id and only change `characterId`; every write is one conditional updateOne, so a lost race can never duplicate a pet.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PetState, type PetWrapper } from '@mc/shared';
import { Pet } from '../pet/pet.schema';
import { PetService } from '../pet/pet.service';
import type { PetTransferFacts } from '../pet/pet-transfer';
import { TRADE_NOTE, hasTradePetRoom, validatePets } from './trade-rules';
import type { PetMove, PetMoveStore } from './trade-swap';

export interface PetSide {
  cid: number;
  pets: readonly number[];
}

@Injectable()
export class TradePetService implements PetMoveStore {
  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly petService: PetService,
  ) {}

  /** Transfer facts of the character's own pets among `ids` (foreign / missing ids are simply absent from the map). */
  async factsOf(cid: number, ids: readonly number[]): Promise<Map<number, PetTransferFacts>> {
    if (ids.length === 0) return new Map();
    const rows = await this.pets.find({ _id: { $in: [...ids] }, characterId: cid }).lean();
    return new Map(rows.map((r) => [r._id, { binded: r.binded, state: r.state, following: r.following, equ: r.equ ?? [] }]));
  }

  /** Display wrappers of the character's pets among `ids`, in `ids` order. */
  async wrappers(cid: number, ids: readonly number[]): Promise<PetWrapper[]> {
    const out: PetWrapper[] = [];
    for (const id of ids) {
      const w = await this.petService.wrapOne(cid, id);
      if (w) out.push(w);
    }
    return out;
  }

  /** Pets owned and pet bag size of a character. */
  async room(cid: number): Promise<{ count: number; max: number }> {
    const [count, max] = await Promise.all([this.pets.countDocuments({ characterId: cid }), this.petService.petMaxNum(cid)]);
    return { count, max };
  }

  /** Authoritative check on the live rows (run under both char locks): ownership, transfer rule, both pet rooms. Refusal or null. */
  async check(a: PetSide, b: PetSide): Promise<string | null> {
    if (a.pets.length === 0 && b.pets.length === 0) return null;
    for (const side of [a, b]) {
      const refusal = validatePets(side.pets, await this.factsOf(side.cid, side.pets));
      if (refusal) return refusal;
    }
    for (const [giver, taker] of [[a, b], [b, a]] as const) {
      if (giver.pets.length === 0) continue;
      const { count, max } = await this.room(taker.cid);
      if (!hasTradePetRoom(count, max, giver.pets.length, taker.pets.length)) return TRADE_NOTE.PET_FULL;
    }
    return null;
  }

  async give(m: PetMove): Promise<boolean> {
    const r = await this.pets.updateOne(
      {
        _id: m.id, characterId: m.from, binded: 0, state: PetState.REST, following: { $ne: true },
        escrowRef: { $exists: false }, equ: { $not: { $elemMatch: { $gt: 0 } } },
      },
      { $set: { characterId: m.to, following: false } },
    );
    return r.modifiedCount === 1;
  }

  async giveBack(m: PetMove): Promise<boolean> {
    const r = await this.pets.updateOne({ _id: m.id, characterId: m.to }, { $set: { characterId: m.from, following: false } });
    return r.modifiedCount === 1;
  }
}
