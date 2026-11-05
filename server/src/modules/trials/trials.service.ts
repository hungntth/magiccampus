// Vùng Đất Rèn Luyện service (Go application/trials service.go): panel payload, entry verdicts / run start, the run's battle lifecycle
// (begin / cancel / finish), leaving and the two claims, all over the trials sub-object of character_towers (TowersStateService rev CAS).
// Spend before credit: a claim is persisted first, the items are granted after the bag check.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  TRIALS, TRIALS_FIRST_AWARD, TRIALS_TEXT, TRIALS_WEEK_AWARD, trialsFloor, type TrialsAward, type TrialsCharPatch, type TrialsPanel, type TrialsRewardRow,
} from '@mc/shared';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { GrantService, type Grant } from '../rewards/grant.service';
import { TowersStateService } from '../towers/towers-state.service';
import type { TrialsReturn, TrialsRun } from '../towers/towers.schema';
import {
  beginRun, finishBattle, firstKillVerdict, openTrials, panelPayload, startVerdict, toTrialsState, weeklyVerdict, type StartVerdict, type TrialsOpen,
  type TrialsOutcome,
} from './trials-rules';

export type StartResult = { ok: true; run: TrialsRun; used: number; resumed: boolean } | { ok: false; why: string };

/** Refusal text of a verdict / claim reason. */
export function failText(why: string): string {
  switch (why) {
    case 'level': return TRIALS_TEXT.LEVEL;
    case 'locked': case 'floor': return TRIALS_TEXT.LOCKED;
    case 'entries': return TRIALS_TEXT.NO_ENTRIES;
    case 'active': return TRIALS_TEXT.RUN_ACTIVE;
    case 'notCleared': return TRIALS_TEXT.NOT_CLEARED;
    case 'claimed': return TRIALS_TEXT.CLAIMED;
    case 'nothing': return TRIALS_TEXT.NOTHING_WEEK;
    case 'bag': return TRIALS_TEXT.BAG_FULL;
    default: return TRIALS_TEXT.BUSY;
  }
}

/** Reward rows as bound item grants (item table 29). */
export const trialsGrants = (rows: readonly TrialsAward[]): Grant[] =>
  rows.map((r) => ({ kind: 'item', table: TRIALS.ITEM_TABLE, templateId: r.iid, qty: r.n, bound: true }));

interface Edit<T> {
  value: T;
  write: boolean;
}

@Injectable()
export class TrialsService {
  /** Clock, replaceable in tests. */
  now: () => number = Date.now;
  private names: Map<number, { name: string; iconCode: string }> | null = null;

  constructor(
    private readonly towers: TowersStateService,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly grants: GrantService,
    private readonly gameData: GameDataService,
  ) {}

  async open(cid: number): Promise<TrialsOpen> {
    return openTrials((await this.towers.open(cid)).trials, this.now());
  }

  /** One read-modify-write of the normalised state; undefined when the write lost its races. */
  private async edit<T>(cid: number, fn: (o: TrialsOpen, now: number) => Edit<T>): Promise<T | undefined> {
    const box: { r?: Edit<T> } = {};
    const saved = await this.towers.mutate(cid, (doc) => {
      const now = this.now();
      const o = openTrials(doc.trials, now);
      box.r = fn(o, now);
      if (!box.r.write) return false;
      doc.trials = toTrialsState(o);
      return true;
    });
    if (!box.r || (box.r.write && !saved)) return undefined;
    return box.r.value;
  }

  private async level(cid: number): Promise<number> {
    return (await this.chars.findById(cid, { level: 1 }).lean())?.level ?? 0;
  }

  /** trialsPanelInit. */
  async panel(cid: number): Promise<TrialsPanel> {
    return { ...panelPayload(await this.open(cid), this.now()), rw: await this.rewardTables() };
  }

  /** Why `cid` cannot enter `floor` now (CanStart), or null. A resumable run passes. */
  async refusal(cid: number, floor: number): Promise<string | null> {
    const v: StartVerdict = startVerdict(await this.open(cid), await this.level(cid), floor);
    return v.ok ? null : failText(v.why);
  }

  /** Go Start: verdict, then one entry and the run (a resumable run is returned untouched). */
  async start(cid: number, floor: number, ret: TrialsReturn): Promise<StartResult> {
    const level = await this.level(cid);
    const r = await this.edit<StartResult>(cid, (o, now) => {
      const v = startVerdict(o, level, floor);
      if (!v.ok) return { value: { ok: false, why: v.why }, write: false };
      if (v.resume) return { value: { ok: true, run: { ...o.run! }, used: o.n, resumed: true }, write: false };
      const run = beginRun(o, floor, now, ret);
      return { value: { ok: true, run: { ...run }, used: o.n, resumed: false }, write: true };
    });
    return r ?? { ok: false, why: 'busy' };
  }

  /** Gives the entry back after a failed move. */
  async abort(cid: number): Promise<void> {
    await this.edit(cid, (o) => {
      if (!o.run || o.run.ib) return { value: null, write: false };
      delete o.run;
      if (o.n > 0) o.n -= 1;
      return { value: null, write: true };
    });
  }

  async activeRun(cid: number): Promise<TrialsRun | undefined> {
    return (await this.open(cid)).run;
  }

  /** Why a character standing on trials map `mapId` has no right to be there (null = a live run on that floor). */
  async ejectReason(cid: number, mapId: number): Promise<'expired' | 'norun' | null> {
    const raw = (await this.towers.open(cid)).trials;
    const now = this.now();
    const o = openTrials(raw, now);
    if (o.run && trialsFloor(o.run.f)?.map === mapId) return null;
    return raw.run && raw.run.f > 0 && raw.run.dl <= now ? 'expired' : 'norun';
  }

  /** Marks the run in battle on `floor`; null when there is no such run. */
  async beginBattle(cid: number, floor: number): Promise<TrialsRun | null> {
    const r = await this.edit<TrialsRun | null>(cid, (o) => {
      if (!o.run || o.run.f !== floor) return { value: null, write: false };
      o.run.ib = 1;
      return { value: { ...o.run }, write: true };
    });
    return r ?? null;
  }

  async cancelBattle(cid: number): Promise<void> {
    await this.edit(cid, (o) => {
      if (!o.run || !o.run.ib) return { value: null, write: false };
      o.run.ib = 0;
      return { value: null, write: true };
    });
  }

  /** The battle result applied to this character's run (the run after it, when it goes on). */
  async finish(cid: number, won: boolean): Promise<{ out: TrialsOutcome; run?: TrialsRun } | null> {
    const r = await this.edit<{ out: TrialsOutcome; run?: TrialsRun } | null>(cid, (o, now) => {
      const out = finishBattle(o, won, now);
      return out ? { value: { out, ...(o.run ? { run: { ...o.run } } : {}) }, write: true } : { value: null, write: false };
    });
    return r ?? null;
  }

  /** Closes the run and returns the stored return point. */
  async leave(cid: number): Promise<TrialsReturn> {
    const r = await this.edit<TrialsReturn>(cid, (o) => {
      const ret = o.ret && o.ret.m > 0 ? { ...o.ret } : { m: TRIALS.EXIT_MAP, x: 0, y: 0 };
      delete o.run;
      delete o.ret;
      return { value: ret, write: true };
    });
    return r ?? { m: TRIALS.EXIT_MAP, x: 0, y: 0 };
  }

  /** trialsFirstKillAwardTake: the patch to push, or the refusal text. */
  async claimFirstKill(session: Session, floor: number): Promise<{ patch: TrialsCharPatch } | { text: string }> {
    const cid = session.characterId!;
    const v = firstKillVerdict(await this.open(cid), floor);
    if (!v.ok) return { text: failText(v.why) };
    const items = trialsGrants(TRIALS_FIRST_AWARD[floor - 1]);
    if (!(await this.grants.fits(cid, items))) return { text: TRIALS_TEXT.BAG_FULL };
    const done = await this.edit<string | null>(cid, (o) => {
      const again = firstKillVerdict(o, floor);
      if (!again.ok) return { value: again.why, write: false };
      o.a[String(floor)] = 1;
      return { value: null, write: true };
    });
    if (done !== null) return { text: failText(done ?? 'busy') };
    await this.grants.grant(session, items);
    return { patch: { nf: floor, a: { [String(floor)]: 1 } } };
  }

  /** trialsAwardTake: the weekly award of the highest floor cleared this week, once per week. */
  async claimWeekly(session: Session): Promise<{ patch: TrialsCharPatch } | { text: string }> {
    const cid = session.characterId!;
    const v = weeklyVerdict(await this.open(cid), this.now());
    if (!v.ok) return { text: failText(v.why) };
    const items = trialsGrants(TRIALS_WEEK_AWARD[v.value.floor - 1]);
    if (!(await this.grants.fits(cid, items))) return { text: TRIALS_TEXT.BAG_FULL };
    const done = await this.edit<string | null>(cid, (o, now) => {
      const again = weeklyVerdict(o, now);
      if (!again.ok) return { value: again.why, write: false };
      o.at = again.value.stamp;
      return { value: null, write: true };
    });
    if (done !== null) return { text: failText(done ?? 'busy') };
    await this.grants.grant(session, items);
    return { patch: { at: v.value.stamp } };
  }

  /** Reward tables with item names / icons (cached; the client has no item table). */
  private async rewardTables(): Promise<{ first: TrialsRewardRow[][]; week: TrialsRewardRow[][] }> {
    if (!this.names) {
      const ids = [...new Set([...TRIALS_FIRST_AWARD, ...TRIALS_WEEK_AWARD].flatMap((rows) => rows.map((r) => r.iid)))];
      const found = await this.gameData.templatesByIds(TRIALS.ITEM_TABLE, ids);
      this.names = new Map(ids.map((id) => {
        const row = found.get(id);
        return [id, { name: String(row?.name ?? `#${id}`), iconCode: row?.icon_code ? String(row.icon_code) : '0' }];
      }));
    }
    const names = this.names;
    const rows = (table: readonly (readonly TrialsAward[])[]): TrialsRewardRow[][] =>
      table.map((list) => list.map((r) => ({ iid: r.iid, n: r.n, ...names.get(r.iid) })));
    return { first: rows(TRIALS_FIRST_AWARD), week: rows(TRIALS_WEEK_AWARD) };
  }
}
