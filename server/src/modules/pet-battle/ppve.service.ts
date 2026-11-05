// PPVE panel operations (Go application/pet/ppve_panel.go, ppve_levelup.go): initPPVEPanel, savePPVEConf, the gold try, the free / gold KP
// exchanges and the Khac Van level-up. Every operation runs under the character lock, validates before it charges, charges before it
// credits (gold is spent first, refunded if the state save throws) and answers the ordered pushes; a refusal is one note and no change.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PPVE_KP_GOLD_COST, PPVE_KP_GOLD_YIELD, type PlayerUpdate } from '@mc/shared';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { Pet } from '../pet/pet.schema';
import { PpveStateService } from './ppve-state.service';
import {
  applyCarveLevelUp, configInputRefusal, configSlots, extraTryGold, freeExchangeFloor, freeExchangeKp, lineupRefusal, normalizeConfig,
  planCarveLevelUp, PPVE_TEXT,
} from './ppve-rules';

const note = (text: string): Push => push('onSystemMidMsgOrNote', text);

@Injectable()
export class PpveService {
  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly store: PpveStateService,
    private readonly data: GameDataService,
    private readonly characters: CharacterService,
  ) {}

  /** initPPVEPanel: the daily reset is persisted when it changed, then the panel. */
  init(characterId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const { state, reset } = await this.store.load(characterId);
      if (reset) await this.store.save(characterId, state);
      return [this.store.panelPush(state)];
    });
  }

  /** savePPVEConf: at most 5 owned, bound pets of different templates; echoes the saved config (arg 3 of the panel push). */
  saveConfig(characterId: number, raw: unknown): Promise<Push[]> {
    const tooMany = configInputRefusal(raw);
    if (tooMany) return Promise.resolve([note(tooMany)]);
    return withCharLock(characterId, async () => {
      const config = normalizeConfig(raw);
      const slots = configSlots(config);
      const rows = await this.pets.find({ _id: { $in: slots.map((s) => s.pid) }, characterId }, { tid: 1, binded: 1 }).lean();
      const why = lineupRefusal(rows.map((r) => ({ id: r._id, tid: r.tid, binded: r.binded })), slots);
      if (why) return [note(why)];
      const saved = Object.fromEntries(slots.map((s) => [String(s.pos), s]));
      const { state } = await this.store.load(characterId);
      state.ppveConfig = saved;
      await this.store.save(characterId, state);
      return [this.store.panelPush(state, saved)];
    });
  }

  /** increaseChallengeTimeByGold: plain gold 10 / 20 / 50 by goldTime, +1 free try. */
  buyTry(characterId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const { state } = await this.store.load(characterId);
      const cost = extraTryGold(state.goldTime);
      const paid = await this.characters.spendMoney(characterId, 'gold', cost);
      if (paid === null) return [note(PPVE_TEXT.noGold)];
      state.goldTime++;
      state.goldClgTime++;
      state.freeTime++;
      await this.saveOrRefund(characterId, state, cost);
      return [...this.goldPushes(characterId, cost, paid), this.store.panelPush(state)];
    });
  }

  /** exchangeKP: the daily free exchange pays the carve_award `free_exchagne` KP of the NEXT floor. */
  exchangeKp(characterId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const { state } = await this.store.load(characterId);
      if (state.awardTime <= 0) return [note(PPVE_TEXT.noFreeExchange)];
      const gained = freeExchangeKp(this.data.carveAward(freeExchangeFloor(state.ppvefloor)));
      state.awardTime--;
      state.kp += gained;
      await this.store.save(characterId, state);
      return [this.store.panelPush(state), note(PPVE_TEXT.kpGained(gained))];
    });
  }

  /** exchangeKPByGold: 25 plain gold -> 50 KP. */
  exchangeKpByGold(characterId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const { state } = await this.store.load(characterId);
      const paid = await this.characters.spendMoney(characterId, 'gold', PPVE_KP_GOLD_COST);
      if (paid === null) return [note(PPVE_TEXT.noGold)];
      state.gold4awardTimeDaily++;
      state.kp += PPVE_KP_GOLD_YIELD;
      await this.saveOrRefund(characterId, state, PPVE_KP_GOLD_COST);
      return [...this.goldPushes(characterId, PPVE_KP_GOLD_COST, paid), this.store.panelPush(state), note(PPVE_TEXT.kpGained(PPVE_KP_GOLD_YIELD))];
    });
  }

  /** ppLevelUpPetIcon({partIndex, iconIndex}): the next node id priced at its own row, locked by the best floor, level 20 max. */
  levelUpIcon(characterId: number, part: number, icon: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const { state } = await this.store.load(characterId);
      const plan = planCarveLevelUp(state, part, icon, (id) => this.data.carve(id));
      if (!plan.ok) return [note(plan.text)];
      const masterUp = applyCarveLevelUp(state, plan);
      await this.store.save(characterId, state);
      return [this.store.panelPush(state), note(PPVE_TEXT.carveLevelUp(plan.level, plan.cost) + (masterUp ? PPVE_TEXT.masterUp(state.mlv) : ''))];
    });
  }

  private async saveOrRefund(characterId: number, state: Parameters<PpveStateService['save']>[1], gold: number): Promise<void> {
    try {
      await this.store.save(characterId, state);
    } catch (e) {
      await this.characters.addMoney(characterId, 'gold', gold); // the state did not save: give the gold back
      throw e;
    }
  }

  private goldPushes(characterId: number, spent: number, total: number): Push[] {
    const update: PlayerUpdate = { gold: total };
    return [push('onAddMoney', characterId, 'gold', -spent, total), push('onUPP', update)];
  }
}
