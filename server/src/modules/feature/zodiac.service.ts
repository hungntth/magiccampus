// Zodiac stars (Tinh Cung): panel, begin / finish / cancel, speed-up with a star shard, addition with Hoa Tinh Tú and the shard exchange.
// Timers are stored as END timestamps (ms) and compared with the injected clock, so a restart or an offline gap changes nothing.
// Spend first (unbound gold, silver, items), persist, refund what is refundable when the write fails.

import { Injectable } from '@nestjs/common';
import {
  ItemKind, STAR, starSpeedItemId, type StarAdditionPush, type StarExchangeResult, type StarsData, type StarsPanel, type StarSpeedUpResult,
} from '@mc/shared';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import type { Rng } from '../forge/craft-rules';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { FeatureCommonService, refuse } from './feature-common.service';
import { FEATURE_KEYS } from './feature-state';
import {
  cancelStar, finishStar, parseStars, planAddition, planBegin, planExchange, rollAddition, speedUpStar, starViews, toStarsData,
  totalStarLevel, type StarLookup, type StarState,
} from './zodiac-rules';

@Injectable()
export class ZodiacService {
  /** Replaceable in tests. */
  now: () => number = Date.now;
  rng: Rng = Math.random;

  constructor(
    private readonly store: FeatureStoreService,
    private readonly characters: CharacterService,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly common: FeatureCommonService,
  ) {}

  get look(): StarLookup {
    return { byId: (id) => this.gameData.starTemplate(id), at: (t, l) => this.gameData.starTemplateAt(t, l) };
  }

  private async load(cid: number): Promise<StarState> {
    return parseStars(await this.store.get(cid, FEATURE_KEYS.zodiac, {}));
  }

  private save(cid: number, s: StarState): Promise<void> {
    return this.store.put(cid, FEATURE_KEYS.zodiac, { stars: s });
  }

  /** Login snapshot (starsData); finishDate stays server time. */
  async data(cid: number): Promise<StarsData> {
    return toStarsData(await this.load(cid), this.look);
  }

  /** H5 getStarsData: the map, the server clock (finishDate is server time) and the panel view. */
  async panel(cid: number): Promise<StarsPanel> {
    const s = await this.load(cid);
    return { stars: toStarsData(s, this.look), now: this.now(), total: totalStarLevel(s), view: starViews(s, this.look) };
  }

  /** beginStarLvUp(nextTemplateId): unbound gold up front, then the end timestamp. */
  begin(session: Session, nextTplId: number): Promise<StarsData> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const level = (await this.characters.getById(cid)).level;
      const plan = planBegin(await this.load(cid), this.look, level, nextTplId, this.now());
      if (!plan.ok) return refuse(plan.note);
      let left: number | null = null;
      if (plan.cost > 0) {
        left = await this.characters.spendMoney(cid, 'gold', plan.cost);
        if (left === null) return refuse('Vàng không đủ');
      }
      try {
        await this.save(cid, plan.state);
      } catch (e) {
        if (plan.cost > 0) await this.characters.addMoney(cid, 'gold', plan.cost);
        throw e;
      }
      if (left !== null) session.callback('onUPP', { gold: left });
      await this.common.push(session); // a lazily completed level-up changed the stats
      return toStarsData(plan.state, this.look);
    });
  }

  finish(session: Session, type: number): Promise<StarsData> {
    return this.step(session, (s) => finishStar(s, type, this.now()), true);
  }

  cancel(session: Session, type: number): Promise<StarsData> {
    return this.step(session, (s) => cancelStar(s, type), false);
  }

  private step(session: Session, rule: (s: StarState) => ReturnType<typeof cancelStar>, statsChanged: boolean): Promise<StarsData> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const r = rule(await this.load(cid));
      if (!r.ok) return refuse(r.note);
      await this.save(cid, r.state);
      if (statsChanged) await this.common.push(session);
      return toStarsData(r.state, this.look);
    });
  }

  /** speedUpStarLvUp(type): consumes ONE Tinh Toái of that star (3315 + type); the end moves behind now. */
  speedUp(session: Session, type: number): Promise<StarSpeedUpResult> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const r = speedUpStar(await this.load(cid), type, this.now());
      if (!r.ok) return refuse(r.note);
      const itemId = starSpeedItemId(type);
      if (((await this.inventory.countByTemplate(cid, [itemId])).get(itemId) ?? 0) < 1) return refuse('Không đủ Tinh Toái để tăng tốc');
      const spent = await this.inventory.removeByTemplate(cid, itemId, 1);
      try {
        await this.save(cid, r.state);
      } catch (e) {
        await this.giveBack(cid, itemId, 1, false);
        throw e;
      }
      for (const item of spent.updated) session.callback('onAddCharactorSlot', item);
      for (const gone of spent.deleted) session.callback('onDelCharactorSlot', gone.id, gone.sid);
      return { d: toStarsData(r.state, this.look), n: 1 };
    });
  }

  /** addStarAddition(type, qty): silver first, then the Hoa Tinh Tú, one roll; the result is pushed (onAddStarAddition). */
  addition(session: Session, type: number, qty: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const state = await this.load(cid);
      const plan = planAddition(state, type, qty);
      if (!plan.ok) return refuse(plan.note);
      const itemId = STAR.ADDITION_ITEM_ID;
      if (((await this.inventory.countByTemplate(cid, [itemId])).get(itemId) ?? 0) < qty) return refuse('Không đủ Hoa Tinh Tú');
      const key = (await this.characters.paymentPrefs(cid)).money;
      let silverLeft: number | null = null;
      if (plan.silver > 0) {
        silverLeft = await this.characters.spendMoney(cid, key, plan.silver);
        if (silverLeft === null) return refuse('Bạc không đủ');
      }
      let spent;
      try {
        spent = await this.inventory.removeByTemplate(cid, itemId, qty);
      } catch (e) {
        if (plan.silver > 0) await this.characters.addMoney(cid, key, plan.silver);
        throw e;
      }
      const roll = rollAddition(state, type, plan.rate, this.rng);
      if (roll.success) {
        try {
          await this.save(cid, roll.state);
        } catch (e) {
          if (plan.silver > 0) await this.characters.addMoney(cid, key, plan.silver);
          await this.giveBack(cid, itemId, qty, false);
          throw e;
        }
      }
      for (const item of spent.updated) session.callback('onAddCharactorSlot', item);
      for (const gone of spent.deleted) session.callback('onDelCharactorSlot', gone.id, gone.sid);
      if (silverLeft !== null) session.callback('onUPP', { [key]: silverLeft });
      const slot = toStarsData(roll.state, this.look)[String(type)];
      const push: StarAdditionPush = { t: type, f: roll.success, n: qty, d: slot ?? null };
      session.callback('onAddStarAddition', push);
      if (roll.success) await this.common.push(session);
      return null;
    });
  }

  /** pmStarExchage(itemId, targetTemplateId, num): star shards swap 1:1 and the result is bound ("đổi xong sẽ thành khóa"). */
  exchange(session: Session, itemId: number, targetTid: number, num: number): Promise<StarExchangeResult> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const [src] = await this.inventory.byIds(cid, [itemId]);
      if (!src) return refuse('Không tìm thấy Tinh Toái');
      const plan = planExchange(src.tid, targetTid, num, src.stackNum);
      if (!plan.ok) return refuse(plan.note);
      const tpl = await this.gameData.template(29, targetTid);
      if (!tpl) return refuse('Không tìm thấy Tinh Toái cần đổi');
      const taken = await this.inventory.consumeStack(cid, itemId, num);
      if (!taken) return refuse('Không đủ Tinh Toái');
      if (taken.left > 0) {
        for (const item of await this.inventory.byIds(cid, [itemId])) session.callback('onAddCharactorSlot', item);
      } else {
        session.callback('onDelCharactorSlot', itemId, taken.sid);
      }
      let changed;
      try {
        changed = await this.inventory.add(cid, { templateId: targetTid, itemType: ItemKind.ITEM, bound: true, color: 0, amount: num, maxStack: maxStack(tpl) });
      } catch (e) {
        await this.giveBack(cid, src.tid, num, src.binded);
        throw e;
      }
      for (const item of changed) session.callback('onAddCharactorSlot', item);
      return { flag: true, finalNum: num, finalNme: String(tpl.name ?? `#${targetTid}`), slotId: changed[0]?.id ?? itemId };
    });
  }

  /** Best-effort restore of consumed items after a failed write. */
  private async giveBack(cid: number, templateId: number, amount: number, bound: boolean): Promise<void> {
    const tpl = await this.gameData.template(29, templateId);
    if (!tpl) return;
    await this.inventory.add(cid, { templateId, itemType: ItemKind.ITEM, bound, color: 0, amount, maxStack: maxStack(tpl) }).catch(() => undefined);
  }
}
