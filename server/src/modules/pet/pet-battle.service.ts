// Pets in battle (phase C): picks the fighting pet (state 1, life > 0) with its full-HP stats, and settles a battle for it
// (exp on a win, life drain always) as the ordered pushes sent at battlePlayEnd. Exp is also granted by finishQuest (full quest
// exp to the active pet, caller holds the character lock). Pet HP/MP are never persisted. Combat builds the Fighter itself.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isBattleSkill, PetLimits, PetState, petSoulOpenNum, type LearnedSkill } from '@mc/shared';
import type { BaseStats } from '../character/character-stats';
import { GameDataService } from '../gamedata/gamedata.service';
import { Character } from '../character/character.schema';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { toLearnedSkill } from '../skill/skill-rules';
import { PetBonusService } from './pet-bonus.service';
import type { PetStatContext } from './pet-stat-provider';
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
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly gameData: GameDataService,
    private readonly follow: PetFollowService,
    private readonly bonus: PetBonusService,
  ) {}

  /** The owner's battle pet (state 1, life > 0), or null. */
  async fighterOf(characterId: number): Promise<BattlePet | null> {
    const row = await this.pets.findOne({ characterId, state: PetState.BATTLE, life: { $gt: 0 } }).lean();
    const bp = row ? (await this.battlePetsOf(characterId, [row], 'battle')).get(row._id) ?? null : null;
    // Chân Hồn Thần Thú form art (Flash BattleCreatureView swaps a pet's resCode for its owner's prsUseId form).
    const look = bp ? await this.follow.lookOf(characterId) : null;
    return bp && look ? { ...bp, resCode: look.resCode } : bp;
  }

  /**
   * Battle views of the given pets of one character under a stat context (one bonus lookup for all of them); pets whose template is
   * missing are absent. No state / life filter: simulated PPVE / arena line-ups pick their own pets and count life as full.
   */
  async battlePetsOf(characterId: number, rows: readonly Pet[], ctx: PetStatContext): Promise<Map<number, BattlePet>> {
    const extras = await this.bonus.extrasFor(characterId, rows, ctx);
    const out = new Map<number, BattlePet>();
    for (const row of rows) {
      const tpl = this.gameData.petTemplate(row.tid);
      if (!tpl) continue;
      const skills = (row.skills ?? []).filter((s) => s > 0);
      const skillList = skills.flatMap((sid, i) => {
        const st = this.gameData.skill(sid);
        return st && isBattleSkill(st.type) ? [toLearnedSkill({ skillId: sid, level: 1, position: i + 1 }, st)] : [];
      });
      out.set(row._id, {
        petId: row._id, ownerCid: characterId, tid: row.tid, name: row.petName, level: row.level,
        stats: statsOfPet(row, tpl, extras.get(row._id)?.bonuses).stats,
        resCode: tpl.resCode, colorCode: tpl.colorCode, iconCode: tpl.iconCode, element: row.element, skills, skillList,
      });
    }
    return out;
  }

  /** Battle settle for one pet: `expGain` null = no exp (loss / owner not a survivor), life drain always. Serialized per owner. */
  settle(characterId: number, petId: number, expGain: number | null): Promise<Push[]> {
    return withCharLock(characterId, () => this.credit(characterId, petId, expGain ?? 0, true));
  }

  /** Grow potions (item use): exp without the life drain. The caller already holds the character lock. */
  grantExp(characterId: number, petId: number, gain: number): Promise<Push[]> {
    return this.credit(characterId, petId, gain, false);
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
    const owner = await this.chars.findById(characterId, { level: 1 }).lean();
    const res = applyPetExp(row.exp, row.level, gain, owner?.level ?? 1);
    const life = drain ? petLifeAfterBattle(row.life) : row.life;
    const attrPoints = row.attrPoints + res.pointsGained;
    const ringOpen = res.levelsGained > 0 ? petSoulOpenNum(res.level) : 0;
    await this.pets.updateOne(
      { _id: petId, characterId },
      { $set: { exp: res.exp, level: res.level, attrPoints, life }, ...(ringOpen > 0 ? { $max: { 'soul.openNum': ringOpen } } : {}) },
    );
    const pushes: Push[] = [];
    if (res.exp !== row.exp) pushes.push(push('onUpdatePet', petId, 'exp', res.exp));
    if (life !== row.life) pushes.push(push('onUpdatePet', petId, 'life', Math.min(life, PetLimits.maxLife)));
    if (res.levelsGained > 0) {
      pushes.push(push('onUpdatePet', petId, 'level', res.level));
      pushes.push(push('onUpdatePet', petId, 'attLastPoint', attrPoints));
      // Go SendPetSoulOpenAfterLevelUp: every level-up of a Lv.80+ pet re-sends the ring size (idempotent on the client).
      if (ringOpen > 0) pushes.push(push('onPetLevelUp', { openNum: Math.max(ringOpen, row.soul?.openNum ?? 0), pid: petId }));
    }
    if (pushes.length > 0) pushes.push(push('onRefreshPetProp', petId, propertyOfPet({ ...row, ...res, attrPoints, life }, tpl, (await this.bonus.extrasOf(characterId, row)).bonuses)));
    if (res.levelsGained > 0 && row.following) {
      await this.follow.broadcast(characterId).catch((e: unknown) => this.logger.warn(`pet follow refresh failed: ${(e as Error).message}`));
    }
    return pushes;
  }
}
