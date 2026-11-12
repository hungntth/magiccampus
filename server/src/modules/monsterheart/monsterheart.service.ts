// Monster heart service (M13 phase E2): set / remove, open holes, fusion, dissolve, container upgrade, and the grant paths of the Ma Tâm opener.
// State = feature `monster_heart`. Every RPC mutation runs under withCharLock: validate (pure plan) -> conditional spend (gold / Ma Năng / Tâm Tinh
// Thạch / Kim Cương) -> save -> credit -> pushes; a failed save refunds the spend. The opener path (`grantLocked`) runs inside useItem's own lock.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ItemKind, MONSTER_HEART, MONSTER_HEART_TEXT as T, SlotType, buildCombineGroups, type CombineGroup, type MonsterHeartCatalog,
  type MonsterHeartState,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { CharacterService } from '../character/character.service';
import { ForgeItemsService } from '../forge/forge-items.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CharacterItem } from '../inventory/character-item.schema';
import { CurrencyService } from '../progression/currency.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import type { PushSink } from '../rewards/push-sink';
import { CharacterStatsService } from '../stats/character-stats.service';
import { isError, planBoxUpgrade, planOpen, planRemove, planResolve, planSet, planUpgrade, type HeartLook, type OpenCost, type PlanError } from './monsterheart-rules';
import {
  MONSTER_HEART_FEATURE_KEY, addToBag, encodeMonsterHeart, openFreeHoles, parseMonsterHeart,
} from './monsterheart-state';

function must<T>(plan: T | PlanError): T {
  if (isError(plan)) throw RpcException.forbidden(plan.error);
  return plan;
}

@Injectable()
export class MonsterHeartService {
  private readonly logger = new Logger(MonsterHeartService.name);
  private groups: Map<number, CombineGroup> | null = null;
  private catalogCache: MonsterHeartCatalog | null = null;

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly store: FeatureStoreService,
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
    private readonly currencies: CurrencyService,
    private readonly forgeItems: ForgeItemsService,
    private readonly stats: CharacterStatsService,
  ) {}

  look(): HeartLook {
    const g = this.gameData;
    this.groups ??= buildCombineGroups(g.heartCombines());
    return { heart: (id) => g.heart(id), combine: (id) => g.heartCombine(id), contain: (id) => g.heartContain(id), point: (id) => g.heartPoint(id), groups: this.groups };
  }

  async load(cid: number): Promise<MonsterHeartState> {
    const state = parseMonsterHeart(await this.store.get(cid, MONSTER_HEART_FEATURE_KEY, {}));
    openFreeHoles(state, (id) => this.gameData.heartPoint(id));
    return state;
  }

  save(cid: number, state: MonsterHeartState): Promise<void> {
    return this.store.put(cid, MONSTER_HEART_FEATURE_KEY, encodeMonsterHeart(state));
  }

  /** H5 getMonsterHeartCatalog: compact rows (heart names deduplicated). */
  catalog(): MonsterHeartCatalog {
    if (this.catalogCache) return this.catalogCache;
    const names: string[] = [];
    const index = new Map<string, number>();
    const hearts = this.gameData.hearts().map((h): MonsterHeartCatalog['hearts'][number] => {
      let nm = index.get(h.name);
      if (nm === undefined) index.set(h.name, (nm = names.push(h.name) - 1));
      return [h.id, h.type, h.color, h.exp, h.talent, h.propType, h.propNum, nm, h.icon];
    });
    this.catalogCache = { names, hearts, combines: this.gameData.heartCombines(), points: this.gameData.heartPoints(), contains: this.gameData.heartContains() };
    return this.catalogCache;
  }

  private async pushStats(session: Session): Promise<void> {
    for (const u of await this.stats.gearChangeUpdates(session.characterId!)) session.callback('onUPP', u);
  }

  private pushBag(out: PushSink, state: MonsterHeartState, type: number): void {
    out.callback('updateMonsterHeartBagByType', state.bag, type);
  }

  private panel(out: PushSink, state: MonsterHeartState): void {
    out.callback('updateMonsterHeartPanel', { bag: state.bag, data: state.data });
  }

  /** initMonsterHeartData. */
  init(cid: number): Promise<MonsterHeartState> {
    return withCharLock(cid, () => this.load(cid));
  }

  /** monsterHeartSet(heartId, hole, box, type) / monsterHeartReMove(hole, box): panel push, then the stat refresh. */
  place(session: Session, heartId: number | null, hole: number, box: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const state = await this.load(cid);
      const plan = must(heartId === null ? planRemove(state, hole, box, this.look()) : planSet(state, heartId, hole, box, this.look()));
      await this.save(cid, plan.state);
      this.panel(session, plan.state);
      await this.pushStats(session);
      return null;
    });
  }

  private async gold(cid: number): Promise<number> {
    return (await this.chars.findById(cid, { gold: 1 }).lean())?.gold ?? 0;
  }

  /** Spends gold (unbound) and returns the refund closure; throws NO_GOLD. */
  private async spendGold(session: Session, amount: number): Promise<() => Promise<void>> {
    const cid = session.characterId!;
    if (amount <= 0) return async () => undefined;
    const left = await this.characters.spendMoney(cid, 'gold', amount);
    if (left === null) throw RpcException.forbidden(T.NO_GOLD);
    session.callback('onUPP', { gold: left });
    return async () => {
      session.callback('onUPP', { gold: await this.characters.addMoney(cid, 'gold', amount) });
    };
  }

  /** openHoleMonsterHeart(box, hole): the point's gold. */
  openWithGold(session: Session, box: number, hole: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = must(planOpen(await this.load(cid), box, hole, false, this.look()));
      const refund = await this.spendGold(session, plan.cost.gold);
      try {
        await this.save(cid, plan.state);
      } catch (e) {
        await refund();
        throw e;
      }
      session.callback('updateMonsterHeartBox', plan.state.data);
      return null;
    });
  }

  /** openHoleMonsterHeartJingang(box, hole, itemKK): `num` Kim Cương of the point's colour (the item id argument is ignored, Go). */
  openWithDiamond(session: Session, box: number, hole: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = must(planOpen(await this.load(cid), box, hole, true, this.look()));
      const takes = await this.diamondTakes(cid, plan.cost);
      const consumed = await this.forgeItems.consume(cid, takes);
      try {
        await this.save(cid, plan.state);
      } catch (e) {
        this.logger.error(`Kim Cuong consumed but hole not saved (char ${cid} box ${box} hole ${hole})`);
        throw e;
      }
      for (const p of consumed.pushes) session.callback(p.m, ...p.a);
      session.callback('updateMonsterHeartBox', plan.state.data);
      return null;
    });
  }

  /** Stacks of Kim Cương (template 16, EXACT colour code) covering the cost, in slot order. */
  private async diamondTakes(cid: number, cost: OpenCost): Promise<{ id: number; count: number }[]> {
    const rows = await this.items.find({
      characterId: cid, slotType: SlotType.BAG, itemType: ItemKind.ITEM, templateId: MONSTER_HEART.DIAMOND_TEMPLATE, colorCode: cost.diamondColor,
    }).sort({ slotIndex: 1 }).lean();
    const takes: { id: number; count: number }[] = [];
    let need = cost.diamonds;
    for (const r of rows) {
      if (need <= 0) break;
      const count = Math.min(need, r.stackCount);
      takes.push({ id: r._id, count });
      need -= count;
    }
    if (need > 0) throw RpcException.forbidden(T.NO_DIAMOND);
    return takes;
  }

  /** upgradeMonsterHeartItem(isAll, giid, num, useStone, byGold). */
  upgrade(session: Session, heartId: number, num: number, opts: { isAll: boolean; useStone: boolean; byGold: boolean }, rng: () => number = Math.random): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const state = await this.load(cid);
      const wallet = { stones: await this.currencies.balance(cid, 'mhjingshi'), gold: await this.gold(cid) };
      const plan = must(planUpgrade(state, heartId, num, opts, wallet, this.look(), rng));
      if (plan.stonesUsed > 0 && (await this.currencies.spend(cid, 'mhjingshi', plan.stonesUsed)) === null) throw RpcException.forbidden(T.NO_STONE);
      let refundGold: (() => Promise<void>) | null = null;
      try {
        if (plan.goldUsed > 0) refundGold = await this.spendGold(session, plan.goldUsed);
        await this.save(cid, plan.state);
      } catch (e) {
        if (plan.stonesUsed > 0) await this.currencies.credit(cid, 'mhjingshi', plan.stonesUsed);
        await refundGold?.();
        throw e;
      }
      if (plan.stonesUsed > 0) await this.currencies.push(session);
      this.pushBag(session, plan.state, plan.type);
      session.callback('updateMonsterHeartAfterUp', opts.isAll, opts.isAll ? plan.successes : plan.successes > 0 ? 1 : 0);
      return null;
    });
  }

  /** resolveMonsterHeart(giid, num[, md5pass]): the hearts leave first, then the Ma Năng is credited. */
  resolve(session: Session, heartId: number, num: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = must(planResolve(await this.load(cid), heartId, num, this.look()));
      await this.save(cid, plan.state);
      await this.currencies.credit(cid, 'monsterHeart', plan.gain);
      this.pushBag(session, plan.state, plan.type);
      await this.currencies.push(session);
      return null;
    });
  }

  /** upgradeMonsterHeartBox(box): Ma Năng of the current row, or its gold when the Ma Năng is short. */
  upgradeBox(session: Session, box: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const state = await this.load(cid);
      const wallet = { maNang: await this.currencies.balance(cid, 'monsterHeart'), gold: await this.gold(cid) };
      const plan = must(planBoxUpgrade(state, box, wallet, this.look()));
      if (plan.maNang > 0 && (await this.currencies.spend(cid, 'monsterHeart', plan.maNang)) === null) throw RpcException.forbidden(T.NO_GOLD);
      let refundGold: (() => Promise<void>) | null = null;
      try {
        if (plan.gold > 0) refundGold = await this.spendGold(session, plan.gold);
        await this.save(cid, plan.state);
      } catch (e) {
        if (plan.maNang > 0) await this.currencies.credit(cid, 'monsterHeart', plan.maNang);
        await refundGold?.();
        throw e;
      }
      if (plan.maNang > 0) await this.currencies.push(session);
      session.callback('onUpgradeMonsterHeartBox', plan.state.data.heartBoxLev);
      await this.pushStats(session);
      return null;
    });
  }

  /**
   * Adds hearts to the bag WITHOUT taking the character lock (useItem and the temp-bag opener already hold it). Returns the types touched; pushes
   * updateMonsterHeartBagByType per type to `out`.
   */
  async grantLocked(cid: number, grants: ReadonlyMap<number, number>, out: PushSink): Promise<number[]> {
    const state = await this.load(cid);
    const types = new Set<number>();
    for (const [id, n] of grants) {
      const h = this.gameData.heart(id);
      if (!h || !addToBag(state, h.type, id, n)) throw RpcException.forbidden(T.NO_DATA);
      types.add(h.type);
    }
    await this.save(cid, state);
    for (const type of types) this.pushBag(out, state, type);
    return [...types];
  }
}
