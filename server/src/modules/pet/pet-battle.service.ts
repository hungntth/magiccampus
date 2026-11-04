// Pets in battle (phase C): picks the fighting pet (state 1, life > 0) with its full-HP stats, and settles a battle for it
// (exp on a win, life drain always) as the ordered pushes sent at battlePlayEnd. Exp is also granted by finishQuest (full quest
// exp to the active pet, caller holds the character lock). Pet HP/MP are never persisted. Combat builds the Fighter itself.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isBattleSkill, PetLimits, PetState, type LearnedSkill } from '@mc/shared';
import type { BaseStats } from '../character/character-stats';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { toLearnedSkill } from '../skill/skill-rules';
import { PetBonusService } from './pet-bonus.service';
import { PetFollowService } from './pet-follow.service';
import { Pet } from './pet.schema';
import { applyPetExp } from './pet-level';
import { petLifeAfterBattle } from './pet-rules';
import { propertyOfPet, statsOfPet } from './pet-view';

/** What a battle needs to know about the owner's fighting pet. */
export interface BattlePet {
  petId: number;
  ownerCid: number;
  tid: number;
  name: string;
  level: number;
  stats: BaseStats;
  resCode: string;
  colorCode: string;
  iconCode: string;
  element: number;
  skills: number[]; // learned skill ids (> 0) of the pet's slots
  skillList: LearnedSkill[]; // the battle-usable ones as wire DTOs (level 1), for the pet command menu
}

@Injectable()
export class PetBattleService {
  private readonly logger = new Logger(PetBattleService.name);

  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly gameData: GameDataService,
    private readonly follow: PetFollowService,
    private readonly bonus: PetBonusService,
  ) {}

  /** The owner's battle pet (state 1, life > 0), or null. */
  async fighterOf(characterId: number): Promise<BattlePet | null> {
    const row = await this.pets.findOne({ characterId, state: PetState.BATTLE, life: { $gt: 0 } }).lean();
    const tpl = row ? this.gameData.petTemplate(row.tid) : undefined;
    if (!row || !tpl) return null;
    const extras = await this.bonus.extrasOf(characterId, row);
    const skills = (row.skills ?? []).filter((s) => s > 0);
    const skillList = skills.flatMap((sid, i) => {
      const st = this.gameData.skill(sid);
      return st && isBattleSkill(st.type) ? [toLearnedSkill({ skillId: sid, level: 1, position: i + 1 }, st)] : [];
    });
    return {
      petId: row._id, ownerCid: characterId, tid: row.tid, name: row.petName, level: row.level, stats: statsOfPet(row, tpl, extras.bonuses).stats,
      resCode: tpl.resCode, colorCode: tpl.colorCode, iconCode: tpl.iconCode, element: row.element,
      skills, skillList,
    };
  }

  /** Battle settle for one pet: `expGain` null = no exp (loss / owner not a survivor), life drain always. Serialized per owner. */
  settle(characterId: number, petId: number, expGain: number | null): Promise<Push[]> {
    return withCharLock(characterId, () => this.credit(characterId, petId, expGain ?? 0, true));
  }

  /** finishQuest: the active pet gets the full quest exp. The caller already holds the character lock. */
  async grantQuestExp(characterId: number, exp: number): Promise<Push[]> {
    if (!(exp > 0)) return [];
    const row = await this.pets.findOne({ characterId, state: PetState.BATTLE }, { _id: 1 }).lean();
    return row ? this.credit(characterId, row._id, exp, false) : [];
  }

  /** Persists exp / level / points (and the life drain) in one write; returns onUpdatePet exp, life, level?, onRefreshPetProp. */
  private async credit(characterId: number, petId: number, gain: number, drain: boolean): Promise<Push[]> {
    const row = await this.pets.findOne({ _id: petId, characterId }).lean();
    const tpl = row ? this.gameData.petTemplate(row.tid) : undefined;
    if (!row || !tpl) return [];
    const res = applyPetExp(row.exp, row.level, gain);
    const life = drain ? petLifeAfterBattle(row.life) : row.life;
    const attrPoints = row.attrPoints + res.pointsGained;
    await this.pets.updateOne({ _id: petId, characterId }, { $set: { exp: res.exp, level: res.level, attrPoints, life } });
    const pushes: Push[] = [];
    if (res.exp !== row.exp) pushes.push(push('onUpdatePet', petId, 'exp', res.exp));
    if (life !== row.life) pushes.push(push('onUpdatePet', petId, 'life', Math.min(life, PetLimits.maxLife)));
    if (res.levelsGained > 0) {
      pushes.push(push('onUpdatePet', petId, 'level', res.level));
      pushes.push(push('onUpdatePet', petId, 'attLastPoint', attrPoints));
    }
    if (pushes.length > 0) pushes.push(push('onRefreshPetProp', petId, propertyOfPet({ ...row, ...res, attrPoints, life }, tpl, (await this.bonus.extrasOf(characterId, row)).bonuses)));
    if (res.levelsGained > 0 && row.following) {
      await this.follow.broadcast(characterId).catch((e: unknown) => this.logger.warn(`pet follow refresh failed: ${(e as Error).message}`));
    }
    return pushes;
  }
}
