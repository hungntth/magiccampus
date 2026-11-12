// Tủ Đồ service (M13 phase B): daily check, activation (with the gold auto-buy), receiving the fashion / flyer item, Đổi bộ exchange,
// the fake look and the catalog read. Every mutation runs under withCharLock: validate (pure rules) -> spend (conditional) -> save ->
// refund on a failed write -> pushes. Draws / chips / transform are in DressDrawService.

import { Injectable } from '@nestjs/common';
import {
  DRESS_SERVER_TEXT as T, DRESS_TYPE, type DressCatalog, type DressInfo,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { AppearanceService } from '../appearance/appearance.service';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { GrantService } from '../rewards/grant.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { planActivate, planExchange } from './dress-rules';
import { publicInfo, type DressState } from './dress-state';
import { DressStateService } from './dress-state.service';

const refuse = (note: string): never => {
  throw RpcException.forbidden(note);
};

/** Bound equipment colour code of a minted fashion / flyer (Go display.go: -1 -> 0, else min(color, 4) + 1). */
export const mintColor = (dressColor: number): number => (dressColor < 0 ? 0 : Math.min(dressColor, 4) + 1);

@Injectable()
export class DressService {
  private catalogCache: DressCatalog | null = null;

  constructor(
    private readonly state: DressStateService,
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
    private readonly stats: CharacterStatsService,
    private readonly grants: GrantService,
    private readonly appearance: AppearanceService,
  ) {}

  /** H5 getDressCatalog: the dress and recipe rows the panel needs (the Flash client read TBL_DRESS / TBL_RECIPE locally). */
  async catalog(): Promise<DressCatalog> {
    if (this.catalogCache) return this.catalogCache;
    const dresses = this.gameData.dressRows();
    const tpl = await this.gameData.templatesByIds(19, [...new Set(dresses.map((d) => d.equiptId))]);
    this.catalogCache = {
      dresses: dresses.map((d) => ({
        id: d.id, type: d.type, name: d.name, color: d.color, position: d.position, recipeId: d.recipeId, equiptId: d.equiptId,
        iconCode: String(tpl.get(d.equiptId)?.icon_code ?? 0), num1: d.num1, num2: d.num2, props: d.props, isOpen: d.isOpen,
      })),
      recipes: this.gameData.recipeRows().map((r) => ({
        id: r.id, type: r.type, kind: r.kind, name: r.name, desc: r.desc, color: r.color, iconCode: r.iconCode, money: r.money,
        position: r.position, isOpen: r.isOpen,
      })),
    };
    return this.catalogCache;
  }

  /** checkSameDay: daily reset of the free-draw counter (saved only when it changed). */
  checkSameDay(characterId: number): Promise<DressInfo> {
    return withCharLock(characterId, async () => {
      const s = await this.state.load(characterId);
      await this.state.save(characterId, s);
      return publicInfo(s);
    });
  }

  /** activeDress(dressId, autoBuy) / ensureBuyActive(dressId) (autoBuy true). */
  activate(session: Session, dressId: number, autoBuy: boolean): Promise<DressInfo> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const s = await this.state.load(cid);
      const plan = planActivate(s, this.gameData.dressRow(dressId), autoBuy);
      if (!plan.ok) return refuse(plan.note);
      let gold: number | null = null;
      if (plan.gold > 0) {
        gold = await this.characters.spendMoney(cid, 'gold', plan.gold);
        if (gold === null) return refuse(T.NO_GOLD);
      }
      try {
        await this.state.save(cid, plan.state);
      } catch (e) {
        if (plan.gold > 0) await this.characters.addMoney(cid, 'gold', plan.gold);
        throw e;
      }
      if (gold !== null) {
        session.callback('onSystemMidMsgOrNote', T.SPENT_GOLD(plan.gold));
        session.callback('onUPP', { gold });
      }
      for (const u of await this.stats.gearChangeUpdates(cid)) session.callback('onUPP', u);
      return publicInfo(plan.state);
    });
  }

  /** recieveGoods(dressId): mints the bound equipment of an activated dress (repeatable, as Go). */
  receive(session: Session, dressId: number): Promise<DressInfo> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const s = await this.state.load(cid);
      const def = this.gameData.dressRow(dressId);
      if (!def) return refuse(T.UNKNOWN_DRESS);
      if ((s.book[String(dressId)] ?? 0) < 1) return refuse(T.NOT_ACTIVE);
      const grant = [{ kind: 'item' as const, table: 19, templateId: def.equiptId, qty: 1, bound: true, color: mintColor(def.color) }];
      if (!(await this.grants.fits(cid, grant))) return refuse(T.BAG_FULL);
      if (!(await this.grants.grant(session, grant))) return refuse(T.GAIN_FAILED);
      return publicInfo(s);
    });
  }

  /** exchangeRecipe(recipeId): a set for Điểm thưởng (score spent first). */
  exchange(session: Session, recipeId: number): Promise<DressInfo> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = planExchange(await this.state.load(cid), this.gameData.recipeRow(recipeId));
      if (!plan.ok) return refuse(plan.note);
      await this.state.save(cid, plan.state);
      session.callback('onSystemMidMsgOrNote', T.SPENT_SCORE(plan.cost));
      return publicInfo(plan.state);
    });
  }

  /** setFakeDress / unsetFakeDress / setFakeFlyerDress / unsetFakeFlyerDress; the look sync follows the save. */
  setFake(session: Session, dressId: number, type: number, on: boolean): Promise<DressInfo> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const s = await this.state.load(cid);
      const field = type === DRESS_TYPE.FASHION ? 'fakeDressId' : 'fakeFlyDressId';
      let next: DressState;
      if (on) {
        const def = this.gameData.dressRow(dressId);
        if (!def) return refuse(T.UNKNOWN_DRESS);
        if (def.type !== type) return refuse(T.WRONG_TYPE);
        if ((s.book[String(dressId)] ?? 0) < 1) return refuse(T.NOT_ACTIVE);
        next = { ...s, [field]: dressId };
      } else {
        next = { ...s, [field]: 0 };
      }
      await this.state.save(cid, next);
      if (type === DRESS_TYPE.FASHION) await this.appearance.syncDress(cid);
      else await this.appearance.pushFlyer(cid);
      return publicInfo(next);
    });
  }
}
