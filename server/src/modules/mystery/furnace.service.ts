// Lò luyện thần bí (Go handlers/mysteryexchange): MysteryExchangeItem smelts whole general-bag stacks for `recycling` type-1 value x stack, MysteryExchangeScore converts
// the score currencies 2..17 at the `recycling` row of that type; both pay `mysteryCrystal` (215). The secondary password argument is accepted and ignored (plan decision 10).
// Items an NPC shop sells for silver only are refused (2026-11-01 exploit). Spend (items / balances, conditional) first, credit the crystals last, refund on a failed credit.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FURNACE_MAX_ENTRIES, FURNACE_MEDAL_EXP_TYPE, FURNACE_SCORES, FURNACE_TEXT, ItemKind, MAX_CURRENCY, SlotType, type CurrencyKey, type FurnaceInfo, type FurnaceItemRow,
  type FurnaceReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { ForgeItemsService } from '../forge/forge-items.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import { sendPushes } from '../inventory/pushes';
import { MEDAL_FEATURE_KEY, encodeMedal, parseMedal } from '../medal/medal-state';
import { CurrencyService } from '../progression/currency.service';
import { FeatureStoreService } from '../progression/feature-store.service';

const refuse = (note: string): never => {
  throw RpcException.forbidden(note);
};

/** Parses a `{key: value}` dict of at most FURNACE_MAX_ENTRIES integer pairs; null on anything else. */
export function parseDict(raw: unknown, valueOf: (v: unknown) => number | null): [number, number][] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const keys = Object.keys(raw as object);
  if (keys.length > FURNACE_MAX_ENTRIES) return null;
  const out: [number, number][] = [];
  for (const k of keys) {
    const [key, value] = [Number(k), valueOf((raw as Record<string, unknown>)[k])];
    if (!Number.isInteger(key) || key < 0 || value === null) return null;
    out.push([key, value]);
  }
  return out;
}

@Injectable()
export class FurnaceService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly currencies: CurrencyService,
    private readonly store: FeatureStoreService,
    private readonly forgeItems: ForgeItemsService,
  ) {}

  private async medalExp(cid: number): Promise<number> {
    return parseMedal(await this.store.get(cid, MEDAL_FEATURE_KEY, {})).exp;
  }

  /** Crystals per unit of a general-bag item, 0 when the furnace refuses it (no row, or sold for silver by an NPC shop). */
  private async unitValue(tid: number, color: number): Promise<number> {
    const value = this.gameData.recyclingItem(tid, color) ?? 0;
    return value > 0 && !(await this.gameData.silverShopSet()).has(tid) ? value : 0;
  }

  /** H5 getFurnaceInfo: crystals, the score rows with owned amounts and the recyclable general-bag stacks. */
  async info(cid: number): Promise<FurnaceInfo> {
    const balances = await this.currencies.balances(cid);
    const exp = await this.medalExp(cid);
    const scores = FURNACE_SCORES.map((s) => ({
      type: s.type, score: s.score, name: s.name, owned: s.type === FURNACE_MEDAL_EXP_TYPE ? exp : (balances[s.score as CurrencyKey] ?? 0), value: this.gameData.recyclingScore(s.type) ?? 0,
    }));
    const rows = await this.items.find({ characterId: cid, slotType: SlotType.BAG, itemType: ItemKind.ITEM }).sort({ slotIndex: 1 }).lean();
    const tpls = await this.gameData.templatesByIds(29, [...new Set(rows.map((r) => r.templateId))]);
    const items: FurnaceItemRow[] = [];
    for (const r of rows) {
      const value = await this.unitValue(r.templateId, r.colorCode);
      if (value <= 0) continue;
      const tpl = tpls.get(r.templateId);
      items.push({ id: r._id, tid: r.templateId, color: r.colorCode, num: r.stackCount, value, name: String(tpl?.name ?? `#${r.templateId}`).trim(), iconCode: String(tpl?.icon_code ?? 0) });
    }
    return { crystal: balances.mysteryCrystal ?? 0, scores, items };
  }

  /** MysteryExchangeItem({instanceId: true}, md5pass) -> {num, mysteryCrystal}. */
  exchangeItems(session: Session, raw: unknown): Promise<FurnaceReply> {
    const entries = parseDict(raw, (v) => (v ? 1 : 0));
    if (!entries) throw RpcException.invalidArgs('itemDict');
    const ids = entries.filter(([, on]) => on === 1).map(([id]) => id).filter((id) => id > 0);
    if (ids.length === 0) throw RpcException.invalidArgs('itemDict');
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const rows = await this.items.find({ _id: { $in: ids }, characterId: cid, slotType: SlotType.BAG, itemType: ItemKind.ITEM }).lean();
      if (rows.length !== new Set(ids).size) return refuse(FURNACE_TEXT.STALE);
      let gain = 0;
      for (const r of rows) {
        const value = await this.unitValue(r.templateId, r.colorCode);
        if (value <= 0) {
          session.callback('onRedMsg', FURNACE_TEXT.NOT_RECYCLABLE);
          return refuse(FURNACE_TEXT.NOT_RECYCLABLE);
        }
        gain += value * r.stackCount;
      }
      if ((await this.currencies.balance(cid, 'mysteryCrystal')) + gain > MAX_CURRENCY) return refuse(FURNACE_TEXT.CAP);
      const spent = await this.forgeItems.consume(cid, rows.map((r) => ({ id: r._id, count: r.stackCount })));
      const num = await this.currencies.credit(cid, 'mysteryCrystal', gain);
      sendPushes(session, spent.pushes);
      await this.currencies.push(session);
      session.callback('onSystemMidMsgOrNote', FURNACE_TEXT.GOT(gain));
      return { num, mysteryCrystal: num };
    });
  }

  /** MysteryExchangeScore({type: count}, md5pass) -> {num}. The stock client sends key "0" with count 0 for empty rows: skipped. */
  exchangeScores(session: Session, raw: unknown): Promise<FurnaceReply> {
    const asCount = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n <= 2_147_483_647 ? n : null;
    };
    const entries = parseDict(raw, asCount);
    if (!entries) throw RpcException.invalidArgs('scoreDict');
    const wanted = new Map<number, number>();
    for (const [type, count] of entries) {
      if (count === 0) continue;
      if (!FURNACE_SCORES.some((s) => s.type === type)) throw RpcException.invalidArgs('scoreDict');
      wanted.set(type, count);
    }
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      if (wanted.size === 0) return { num: await this.currencies.balance(cid, 'mysteryCrystal') };
      let gain = 0;
      const spends: { type: number; key: CurrencyKey | null; count: number }[] = [];
      for (const [type, count] of wanted) {
        const value = this.gameData.recyclingScore(type) ?? 0;
        if (value <= 0) return refuse(FURNACE_TEXT.NOT_ENOUGH);
        const def = FURNACE_SCORES.find((s) => s.type === type)!;
        const owned = type === FURNACE_MEDAL_EXP_TYPE ? await this.medalExp(cid) : await this.currencies.balance(cid, def.score as CurrencyKey);
        if (count > owned) return refuse(FURNACE_TEXT.NOT_ENOUGH);
        gain += value * count;
        spends.push({ type, key: type === FURNACE_MEDAL_EXP_TYPE ? null : (def.score as CurrencyKey), count });
      }
      if ((await this.currencies.balance(cid, 'mysteryCrystal')) + gain > MAX_CURRENCY) return refuse(FURNACE_TEXT.CAP);
      const done: typeof spends = [];
      const refund = async (): Promise<void> => {
        for (const s of done) await this.give(cid, s);
      };
      try {
        for (const s of spends) {
          if (!(await this.take(cid, s))) {
            await refund();
            return refuse(FURNACE_TEXT.NOT_ENOUGH);
          }
          done.push(s);
        }
        const num = await this.currencies.credit(cid, 'mysteryCrystal', gain);
        const medal = spends.find((s) => s.key === null);
        if (medal) session.callback('onUPP', { medalExp: await this.medalExp(cid) });
        await this.currencies.push(session);
        session.callback('onSystemMidMsgOrNote', FURNACE_TEXT.GOT(gain));
        return { num };
      } catch (e) {
        if (e instanceof RpcException) throw e;
        await refund();
        throw e;
      }
    });
  }

  /** Conditional spend of one score (medal exp lives in the medal feature state). */
  private async take(cid: number, s: { key: CurrencyKey | null; count: number }): Promise<boolean> {
    if (s.key) return (await this.currencies.spend(cid, s.key, s.count)) !== null;
    const state = parseMedal(await this.store.get(cid, MEDAL_FEATURE_KEY, {}));
    if (state.exp < s.count) return false;
    state.exp -= s.count;
    await this.store.put(cid, MEDAL_FEATURE_KEY, encodeMedal(state));
    return true;
  }

  private async give(cid: number, s: { key: CurrencyKey | null; count: number }): Promise<void> {
    if (s.key) {
      await this.currencies.credit(cid, s.key, s.count);
      return;
    }
    const state = parseMedal(await this.store.get(cid, MEDAL_FEATURE_KEY, {}));
    state.exp += s.count;
    await this.store.put(cid, MEDAL_FEATURE_KEY, encodeMedal(state));
  }
}
