// Awakening (Giác Ngộ / Thức Tỉnh): the level-up gacha (awakening / ensureBuyAwaken), the info view and the talent points. Cost order:
// silver (selected money type), then gold for auto-bought items, then the items; a later failure refunds the earlier charges
// (spend before you credit). Go-invented rules live in awaken-rules.ts (pity, auto-buy price); item 4913 is looked up in the bag.

import { Injectable } from '@nestjs/common';
import { AWAKEN, type AwakenInfo, type AwakenPointReply, type AwakenReply } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import type { Rng } from '../forge/craft-rules';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import {
  addSkillPoint, awakenGate, awakenHit, awakenMiss, awakenRoll, awakenTotals, planAwakenCost, reduceSkillPoint,
  type PointResult,
} from './awaken-rules';
import { FeatureCommonService, refuse } from './feature-common.service';
import { FEATURE_KEYS, parseAwaken, type AwakenState } from './feature-state';

@Injectable()
export class AwakenService {
  /** Replaceable in tests. */
  rng: Rng = Math.random;

  constructor(
    private readonly store: FeatureStoreService,
    private readonly characters: CharacterService,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly common: FeatureCommonService,
  ) {}

  private async load(cid: number): Promise<AwakenState> {
    return parseAwaken(await this.store.get(cid, FEATURE_KEYS.awaken, {}));
  }

  private save(cid: number, s: AwakenState): Promise<void> {
    return this.store.put(cid, FEATURE_KEYS.awaken, { ...s });
  }

  private async itemsHave(cid: number): Promise<number> {
    return (await this.inventory.countByTemplate(cid, [AWAKEN.ITEM_ID])).get(AWAKEN.ITEM_ID) ?? 0;
  }

  /** H5 getAwakenInfo: state, the next row's cost / rate, the cumulative totals and the talent list. */
  async info(cid: number): Promise<AwakenInfo> {
    const s = await this.load(cid);
    const next = s.level >= AWAKEN.EDGE ? undefined : this.gameData.awakenRow(s.level + 1);
    return {
      awakenLevel: s.level, awakenAdd: s.awakenAdd, awakenPoint: s.point, awakenPointUsed: s.pointUsed, awakenPointDict: s.pointDict,
      next: next ? { level: next.level, name: next.name, reqLevel: next.reqLevel, itemNum: next.itemNum, money: next.money, rate: next.rate, points: next.points, props: next.props } : null,
      itemHave: await this.itemsHave(cid),
      total: awakenTotals(s.level, (l) => this.gameData.awakenRow(l)),
      skills: this.gameData.awakenSkillRows().map((k) => ({ id: k.id, code: k.code, name: k.name, desc: k.desc, cost: k.cost, max: k.max, req: k.req, reqClass: k.reqClass })),
    };
  }

  /** awakening(autoBuy) / ensureBuyAwaken (= autoBuy true). */
  attempt(session: Session, autoBuy: boolean): Promise<AwakenReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const level = (await this.characters.getById(cid)).level;
      const state = await this.load(cid);
      const row = this.gameData.awakenRow(state.level + 1);
      const note = awakenGate(level, state, row);
      if (note || !row) return refuse(note ?? 'Thiếu dữ liệu cấp giác ngộ');
      const have = await this.itemsHave(cid);
      const plan = planAwakenCost(row, have, autoBuy);
      if (plan.kind === 'needGold') return { needGold: plan.gold };

      const refunds: Parameters<CharacterService['addMoney']>[] = [];
      const undo = async (): Promise<void> => {
        for (const r of refunds) await this.characters.addMoney(...r);
      };
      const silverKey = (await this.characters.paymentPrefs(cid)).money;
      const updates: Record<string, number> = {};
      if (row.money > 0) {
        const left = await this.characters.spendMoney(cid, silverKey, row.money);
        if (left === null) return refuse('Bạc không đủ');
        refunds.push([cid, silverKey, row.money]);
        updates[silverKey] = left;
      }
      if (plan.gold > 0) {
        const left = await this.characters.spendMoney(cid, 'gold', plan.gold);
        if (left === null) {
          await undo();
          return refuse('Vàng không đủ để mua vật phẩm');
        }
        refunds.push([cid, 'gold', plan.gold]);
        updates.gold = left;
      }
      if (plan.takeItems > 0) {
        try {
          const spent = await this.inventory.removeByTemplate(cid, AWAKEN.ITEM_ID, plan.takeItems);
          for (const item of spent.updated) session.callback('onAddCharactorSlot', item);
          for (const gone of spent.deleted) session.callback('onDelCharactorSlot', gone.id, gone.sid);
        } catch (e) {
          await undo();
          throw e;
        }
      }
      if (Object.keys(updates).length > 0) session.callback('onUPP', updates);

      if (awakenRoll(this.rng, row.rate, state.awakenAdd)) {
        const next = awakenHit(state, row);
        await this.save(cid, next);
        await this.common.push(session);
        return { success: true, awakenLevel: next.level, awakenPoint: next.point, awakenAdd: 0 };
      }
      const next = awakenMiss(state);
      await this.save(cid, next);
      return { success: false, itemNum: Math.max(0, have - plan.takeItems), awakenAdd: next.awakenAdd };
    });
  }

  /** addAwakenPoint / reduceAwakenPoint(skillId). */
  point(session: Session, skillId: number, add: boolean): Promise<AwakenPointReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const skill = this.gameData.awakenSkillRow(skillId);
      if (!skill) return refuse('Kỹ năng không hợp lệ');
      const state = await this.load(cid);
      const r: PointResult = add ? addSkillPoint(state, skill) : reduceSkillPoint(state, skill);
      if (!r.ok) return refuse(r.note);
      await this.save(cid, r.state);
      return { awakenPoint: r.state.point, awakenPointUsed: r.state.pointUsed, awakenDict: r.state.pointDict };
    });
  }
}
