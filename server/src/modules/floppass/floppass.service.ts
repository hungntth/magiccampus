// Lật Bài Truyền Thuyết actions (Go application/floppass service.go / play.go / rank.go): level 30, the weekly play window, flip / kill
// boss / reborn / restart / refresh with the card-game wallet (goldBind, or gold when selectedGoldType is 4), the rank record and the
// weekly rank award. Order of every paid action: bag check -> debit -> state write (refund when lost) -> item grant -> rank record.
// Refusals are thrown as FlopRefusal (the RPC layer turns them into onSystemSay + a falsy reply).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  dayKey, FLOP, FLOP_KILL_TIERS, FLOP_TEXT, flopCanPlay, flopCanTakeAward, flopPassesOf, flopScore, flopWindow, type FlopCharInfo, type FlopConf,
  type FlopConfReply, type FlopInit, type FlopRankReply, type FlopRewardRow, type OnFlopDelBossArgs,
} from '@mc/shared';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { GrantService, type Grant } from '../rewards/grant.service';
import { FLOP_TEMPLATE_IDS, RANK_AWARDS, STAGE_POOLS, type FlopReward } from './floppass-config';
import {
  applyFlip, applyKill, applyReborn, applyRefresh, applyRestart, charInfo, flipError, killPrice, rebornPrice, restartPrice, stageReward,
  type FlopError, type FlopState,
} from './floppass-rules';
import { FlopStateService, type FlopDoc } from './floppass-state.service';

export class FlopRefusal extends Error {}

const ERROR_TEXT: Readonly<Record<FlopError, string>> = {
  dead: FLOP_TEXT.DEAD, alive: FLOP_TEXT.ALIVE, card: '', nokill: FLOP_TEXT.NO_KILL, // a bad card is silent, as Go
};
const BUSY = 'Không thể thực hiện, vui lòng thử lại.';
const ITEM_TABLE = 29;

export interface Paid {
  key: 'gold' | 'goldBind';
  cost: number;
  total: number;
}

const grantsOf = (rows: readonly FlopReward[]): Grant[] =>
  rows.map((r) => ({ kind: 'item', table: ITEM_TABLE, templateId: r.templateId, qty: r.count, bound: true }));

@Injectable()
export class FlopPassService {
  private itemCache: Map<number, { name: string; iconCode: string }> | null = null;

  constructor(
    private readonly state: FlopStateService,
    private readonly gameData: GameDataService,
    private readonly grants: GrantService,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
  ) {}

  private cycle(): number {
    return flopWindow(this.state.now()).cycle;
  }

  /** The character row facts every action needs; refuses below level 30. */
  private async eligible(cid: number): Promise<{ name: string; goldKey: 'gold' | 'goldBind' }> {
    const c = await this.chars.findById(cid, { level: 1, name: 1, selectedGoldType: 1 }).lean();
    if (!c || c.level < FLOP.MIN_LEVEL) throw new FlopRefusal(FLOP_TEXT.LEVEL);
    return { name: c.name, goldKey: c.selectedGoldType === 4 ? 'gold' : 'goldBind' };
  }

  private requirePlay(): void {
    if (!flopCanPlay(flopWindow(this.state.now()), this.state.now())) throw new FlopRefusal(FLOP_TEXT.CLOSED);
  }

  async init(session: Session): Promise<FlopInit> {
    await this.eligible(session.characterId!);
    return { cf: FLOP.CONF_FLAG, s: FLOP.SERVER_ID, v: this.cycle() };
  }

  async conf(session: Session): Promise<FlopConfReply> {
    const cid = session.characterId!;
    await this.eligible(cid);
    const st = await this.state.locked(cid, () => this.state.open(cid));
    return { conf: await this.confPayload(), ci: charInfo(st), v: this.cycle() };
  }

  private async items(): Promise<Map<number, { name: string; iconCode: string }>> {
    if (this.itemCache) return this.itemCache;
    const found = await this.gameData.templatesByIds(ITEM_TABLE, [...FLOP_TEMPLATE_IDS]);
    const out = new Map<number, { name: string; iconCode: string }>();
    for (const id of FLOP_TEMPLATE_IDS) {
      const row = found.get(id);
      out.set(id, { name: String(row?.name ?? `#${id}`), iconCode: row?.icon_code ? String(row.icon_code) : '0' });
    }
    return (this.itemCache = out);
  }

  private async confPayload(): Promise<FlopConf> {
    const info = await this.items();
    const rows = (pool: readonly FlopReward[]): Record<string, FlopRewardRow> =>
      Object.fromEntries(pool.map((r, i) => [String(i), { iid: r.templateId, n: r.count, ...info.get(r.templateId) }]));
    const w = flopWindow(this.state.now());
    return {
      pr: FLOP.FLIP_COST, r: FLOP.REFRESH_COST, rb: FLOP.REBORN_COST,
      db: Object.fromEntries(Object.entries(FLOP_KILL_TIERS).map(([n, t]) => [n, { s: t.stage, p: t.price }])),
      pi: Object.fromEntries(Object.entries(STAGE_POOLS).map(([stage, pool]) => [stage, rows(pool)])),
      ri: Object.fromEntries(Object.entries(RANK_AWARDS).map(([rank, pool]) => [String(Number(rank) + FLOP.RANK_KEY_BASE), rows(pool)])),
      start: w.start, end: w.end,
    };
  }

  /** flopCard: pays the flip, resolves the card. `info` goes out with onPassCard(info, card, bossNum). */
  flip(session: Session, card: number): Promise<{ info: FlopCharInfo; paid: Paid; bossNum: number }> {
    const cid = session.characterId!;
    return this.state.locked(cid, async () => {
      const who = await this.eligible(cid);
      this.requirePlay();
      const st = await this.state.open(cid);
      const bad = flipError(st, card);
      if (bad) throw new FlopRefusal(ERROR_TEXT[bad]);
      const reward = st.bosses.includes(card) ? undefined : stageReward(st, st.i);
      const items = reward ? grantsOf([reward]) : [];
      if (items.length > 0 && !(await this.grants.fits(cid, items))) throw new FlopRefusal(FLOP_TEXT.BAG_FULL);
      const paid = await this.pay(session, who.goldKey, FLOP.FLIP_COST);
      const out = applyFlip(st, card, this.state.rng);
      await this.commit(cid, st, paid);
      this.push(session, paid);
      if (out.passed) {
        await this.grants.grant(session, items);
        const secs = (this.state.now() - flopWindow(this.state.now()).start) / 1000;
        await this.state.record(st.cycle, cid, who.name, flopScore(st.p, secs));
      }
      return { info: charInfo(st), paid: paid!, bossNum: out.bossNum };
    });
  }

  /** flopDelBoss: the n-th kill costs its tier price; returns onFlopDelBossClient's arguments. */
  kill(session: Session): Promise<OnFlopDelBossArgs> {
    return this.paidAction(session, true, (st) => killPrice(st), (st) => void applyKill(st, this.state.rng)).then(({ st }) => {
      const info = charInfo(st);
      return [info.ci.db, info.ci.dbd];
    });
  }

  async reborn(session: Session): Promise<FlopCharInfo> {
    return charInfo((await this.paidAction(session, true, (st) => rebornPrice(st), (st) => applyReborn(st, this.state.rng))).st);
  }

  async restart(session: Session): Promise<FlopCharInfo> {
    const today = dayKey(this.state.now());
    return charInfo((await this.paidAction(session, true, (st) => restartPrice(st, today), (st) => applyRestart(st, this.state.rng))).st);
  }

  /** freshCharFlopPassItemByClient: re-rolls the reward pick of every stage for 20. */
  async refresh(session: Session): Promise<FlopCharInfo> {
    return charInfo((await this.paidAction(session, true, () => FLOP.REFRESH_COST, (st) => applyRefresh(st, this.state.rng))).st);
  }

  /** Shared shape of kill / reborn / restart / refresh: price (or an error), debit, apply, write (refund on a lost write). */
  private paidAction(
    session: Session, needPlay: boolean, price: (st: FlopState) => number | FlopError, apply: (st: FlopState) => void,
  ): Promise<{ st: FlopDoc; paid?: Paid }> {
    const cid = session.characterId!;
    return this.state.locked(cid, async () => {
      const who = await this.eligible(cid);
      if (needPlay) this.requirePlay();
      const st = await this.state.open(cid);
      const cost = price(st);
      if (typeof cost === 'string') throw new FlopRefusal(ERROR_TEXT[cost]);
      const paid = cost > 0 ? await this.pay(session, who.goldKey, cost) : undefined;
      apply(st);
      await this.commit(cid, st, paid);
      this.push(session, paid);
      return { st, paid };
    });
  }

  async rank(session: Session): Promise<FlopRankReply> {
    await this.eligible(session.characterId!);
    const w = flopWindow(this.state.now());
    const rows = await this.state.top(w.cycle, FLOP.RANK_SIZE);
    return {
      v: w.cycle, f: flopCanTakeAward(w, this.state.now()),
      info: rows.map((r) => ({ s: FLOP.SERVER_ID, n: r.name, p: flopPassesOf(r.score), c: r.cid })),
    };
  }

  /** takeFlopRankAward: the top 10 once per cycle inside the award window; bag check, `award` saved, then the items. */
  takeAward(session: Session): Promise<void> {
    const cid = session.characterId!;
    return this.state.locked(cid, async () => {
      await this.eligible(cid);
      const w = flopWindow(this.state.now());
      if (!flopCanTakeAward(w, this.state.now())) throw new FlopRefusal(FLOP_TEXT.AWARD_CLOSED);
      const rows = await this.state.top(w.cycle, FLOP.RANK_SIZE);
      const idx = rows.findIndex((r) => r.cid === cid && flopPassesOf(r.score) > 0);
      const award = idx >= 0 ? RANK_AWARDS[idx + 1] : undefined;
      if (!award) throw new FlopRefusal(FLOP_TEXT.NOT_RANKED);
      const st = await this.state.open(cid);
      if (st.award) throw new FlopRefusal(FLOP_TEXT.AWARD_TAKEN);
      const items = grantsOf(award);
      if (!(await this.grants.fits(cid, items))) throw new FlopRefusal(FLOP_TEXT.BAG_FULL);
      st.award = true;
      if (!(await this.state.save(cid, st))) throw new FlopRefusal(BUSY);
      await this.grants.grant(session, items);
    });
  }

  /** Writes the state; a lost write refunds the debit and refuses. */
  private async commit(cid: number, st: FlopDoc, paid: Paid | undefined): Promise<void> {
    if (await this.state.save(cid, st)) return;
    if (paid) await this.chars.updateOne({ _id: cid }, { $inc: { [paid.key]: paid.cost } });
    throw new FlopRefusal(BUSY);
  }

  /** Guarded $inc on the card-game wallet (spend before credit); onUPP follows once the state is written. */
  private async pay(session: Session, key: 'gold' | 'goldBind', cost: number): Promise<Paid> {
    const doc = await this.chars.findOneAndUpdate(
      { _id: session.characterId!, [key]: { $gte: cost } }, { $inc: { [key]: -cost } }, { new: true, projection: { [key]: 1 } },
    ).lean();
    if (!doc) throw new FlopRefusal(FLOP_TEXT.NO_GOLD);
    return { key, cost, total: doc[key] ?? 0 };
  }

  private push(session: Session, paid: Paid | undefined): void {
    if (paid) session.callback('onUPP', { [paid.key]: paid.total });
  }
}
