// Pet stat provider of the Chien Thu Ho Ve guard (all contexts: panel, battle, arena, PPVE). Only pets in slots 0..4 receive stats:
// the centre pet (formula over the four guards) and each Chien Thu pet (its own row); sub-pets only raise the multipliers.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { petGrowColor } from '@mc/shared';
import { Model } from 'mongoose';
import type { Bonuses } from '../character/character-stats';
import { GameDataService } from '../gamedata/gamedata.service';
import { creatureClassIds } from '../pet/pet-owned';
import { PET_STAT_CONTEXTS, type PetStatContext, type PetStatProvider } from '../pet/pet-stat-provider';
import { Pet } from '../pet/pet.schema';
import { guardBonusOfSlot, guardSlotOf, guardedPetIds, isGuardable, type GuardColorOf } from './guard-rules';
import { PetGuardService } from './pet-guard.service';

@Injectable()
export class PetGuardStatProvider implements PetStatProvider {
  readonly key = 'guard';
  readonly contexts: readonly PetStatContext[] = PET_STAT_CONTEXTS;

  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly guards: PetGuardService,
    private readonly data: GameDataService,
  ) {}

  async bonuses(ownerId: number, pets: readonly Pet[]): Promise<Map<number, Bonuses>> {
    const out = new Map<number, Bonuses>();
    const state = await this.guards.state(ownerId);
    const slots = pets.map((p) => [p, guardSlotOf(state, p._id)] as const).filter(([, sid]) => sid >= 0);
    if (slots.length === 0) return out;
    const colours = await this.colours(ownerId, [...guardedPetIds(state)]);
    const colorOf: GuardColorOf = (id) => colours.get(id) ?? -1;
    for (const [pet, sid] of slots) {
      const bonus = guardBonusOfSlot(state, sid, (lev, s) => this.data.petGuard(lev, s), colorOf);
      if (bonus) out.set(pet._id, bonus);
    }
    return out;
  }

  /** Colour 0..4 of every guard pet that is a valid guard pet (class 10, use level >= 50); the others are absent (= empty slot). */
  private async colours(ownerId: number, ids: readonly number[]): Promise<Map<number, number>> {
    const rows = await this.pets.find({ _id: { $in: ids }, characterId: ownerId }, { tid: 1, growRate: 1 }).lean();
    const out = new Map<number, number>();
    for (const r of rows) {
      const tpl = this.data.petTemplate(r.tid);
      if (tpl && isGuardable(creatureClassIds(tpl), tpl.useLevel)) out.set(r._id, petGrowColor(r.growRate));
    }
    return out;
  }
}
