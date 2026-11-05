// Mê Trận wallet and rewards: gold spending (real Vàng only, conditional $inc before anything is granted), the finish / fight / quiz
// payouts (exp = BASIC_GET_EXP[level] x rate + TBL_PLAN package rows through GrantService; medal rows are skipped, decision 12),
// the lottery / shop item grants, HP reads / writes and the diary task. H5 has no rebirth: the Công Trạng branch does not exist.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { basicExp } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { DiaryEvents } from '../activity/diary-events.service';
import { Character } from '../character/character.schema';
import { InstanceDataService } from '../gamedata/instance-data';
import { GrantService, type Grant } from '../rewards/grant.service';
import { rollPlan } from '../rewards/plan-roller';
import { CharacterStatsService } from '../stats/character-stats.service';
import { BATTLE_EXP_RATE, FINAL_AWARD_PLAN, FINISH_EXP_RATE, MAZE } from './maze-config';

@Injectable()
export class MazeRewards {
  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly grants: GrantService,
    private readonly instance: InstanceDataService,
    private readonly stats: CharacterStatsService,
    private readonly diary: DiaryEvents,
  ) {}

  rng: () => number = Math.random;

  /** Spends `cost` Vàng (never Kim phiếu) with a guarded $inc and pushes onUPP{gold}. False when the wallet is short. */
  async spendGold(session: Session, cost: number): Promise<boolean> {
    const cid = session.characterId!;
    const saved = await this.chars.findOneAndUpdate({ _id: cid, gold: { $gte: cost } }, { $inc: { gold: -cost } }, { new: true, projection: { gold: 1 } }).lean();
    if (!saved) return false;
    session.callback('onUPP', { gold: saved.gold });
    return true;
  }

  async level(cid: number): Promise<number> {
    return (await this.chars.findById(cid, { level: 1 }).lean())?.level ?? 1;
  }

  /** Current and max HP (final stats). */
  async vitals(cid: number): Promise<{ hp: number; maxHp: number }> {
    const st = await this.stats.compute(cid);
    return { hp: st.doc.currentHp, maxHp: Math.max(1, st.maxHp) };
  }

  /** Persists HP (and ends a dead state: the maze has no death penalty). */
  async setHp(cid: number, hp: number): Promise<void> {
    await this.chars.updateOne({ _id: cid }, { $set: { currentHp: hp }, $unset: { deathAt: 1 } });
  }

  private async expGrant(cid: number, rate: number): Promise<Grant[]> {
    const exp = Math.round(basicExp(await this.level(cid)) * rate);
    return exp > 0 ? [{ kind: 'exp', amount: exp }] : [];
  }

  private plan(st: string): Grant[] {
    return this.grants.fromPlan(rollPlan(this.instance.planRows(st), this.rng));
  }

  /** Grants exp / package (a full bag drops the item, as Go) and pushes through GrantService. */
  private async give(session: Session, grants: readonly Grant[]): Promise<void> {
    if (grants.length > 0) await this.grants.grant(session, grants);
  }

  /** End cell: exp x finish rate + the chest-level package, diary task 36. */
  async finish(session: Session, chestLevel: number): Promise<void> {
    const cid = session.characterId!;
    const pkg = FINAL_AWARD_PLAN[chestLevel];
    await this.give(session, [...(await this.expGrant(cid, FINISH_EXP_RATE[chestLevel] ?? 0)), ...(pkg ? this.plan(pkg) : [])]);
    this.diary.record(cid, MAZE.DIARY_TASK, 1);
  }

  /** Won fight: exp x 1 / 1.5 / 2 / 3 + package 3-1265 (3-1264 for the boss). */
  async battleWin(session: Session, event: number): Promise<void> {
    const cid = session.characterId!;
    await this.give(session, [...(await this.expGrant(cid, BATTLE_EXP_RATE[event] ?? 1)), ...this.plan(event === 14 ? MAZE.BOSS_PLAN : MAZE.FIGHT_PLAN)]);
  }

  /** Finished quiz: exp = BASIC_GET_EXP x right answers, + package 3-1265 when all five were right. */
  async quiz(session: Session, rightNum: number, total: number): Promise<void> {
    if (rightNum <= 0) return;
    await this.give(session, [...(await this.expGrant(session.characterId!, rightNum)), ...(rightNum >= total ? this.plan(MAZE.FIGHT_PLAN) : [])]);
  }

  /** One bound item (lottery card / shop purchase). */
  async item(session: Session, templateId: number, qty: number, bound: boolean): Promise<void> {
    await this.give(session, [{ kind: 'item', table: 29, templateId, qty, bound }]);
  }
}
