// Pet stat providers of the Sach Tien Hoa handbook and the Khe Uoc contract (registered by PetModule on PetStatRegistry). Both
// read the character document (activePetObject / contractPet) and apply to the BATTLE pet only (state 1; Go ClientState ==
// PetStateBattle) in the panel and normal battle contexts. PPVE fighters are chosen by the line-up, so every pet passed in
// there counts. The arena never gets either bonus. The contract additionally needs an evolved pet.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PetState } from '@mc/shared';
import { type Bonuses } from '../character/character-stats';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { contractBonuses } from './pet-contract-rules';
import { handbookBonuses } from './pet-handbook-rules';
import type { PetStatContext, PetStatProvider } from './pet-stat-provider';
import type { Pet } from './pet.schema';

const FEATURE_CONTEXTS: readonly PetStatContext[] = ['panel', 'battle', 'ppve'];

const inBattleSlot = (pet: Pet, ctx: PetStatContext): boolean => ctx === 'ppve' || pet.state === PetState.BATTLE;

/** The same bonuses for every eligible pet; pets that do not qualify are absent. */
function toEligible(pets: readonly Pet[], ctx: PetStatContext, bonuses: Bonuses, extra: (pet: Pet) => boolean = () => true): Map<number, Bonuses> {
  return new Map(pets.filter((p) => inBattleSlot(p, ctx) && extra(p)).map((p) => [p._id, bonuses]));
}

@Injectable()
export class PetHandbookStatProvider implements PetStatProvider {
  readonly key = 'handbook';
  readonly contexts = FEATURE_CONTEXTS;

  constructor(@InjectModel(Character.name) private readonly chars: Model<Character>, private readonly data: GameDataService) {}

  async bonuses(ownerId: number, pets: readonly Pet[], ctx: PetStatContext): Promise<Map<number, Bonuses>> {
    if (!pets.some((p) => inBattleSlot(p, ctx))) return new Map();
    const char = await this.chars.findById(ownerId, { activePetObject: 1 }).lean();
    return toEligible(pets, ctx, handbookBonuses(char?.activePetObject ?? {}, this.data.creatureHandbooks()));
  }
}

@Injectable()
export class PetContractStatProvider implements PetStatProvider {
  readonly key = 'contract';
  readonly contexts = FEATURE_CONTEXTS;

  constructor(@InjectModel(Character.name) private readonly chars: Model<Character>, private readonly data: GameDataService) {}

  async bonuses(ownerId: number, pets: readonly Pet[], ctx: PetStatContext): Promise<Map<number, Bonuses>> {
    const evolved = (p: Pet): boolean => p.envoInfo?.envo === true;
    if (!pets.some((p) => inBattleSlot(p, ctx) && evolved(p))) return new Map();
    const char = await this.chars.findById(ownerId, { contractPet: 1, classId: 1 }).lean();
    return toEligible(pets, ctx, contractBonuses(char?.contractPet ?? {}, char?.classId ?? 0, (lv) => this.data.petContract(lv)), evolved);
  }
}
