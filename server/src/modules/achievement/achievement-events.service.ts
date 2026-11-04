// AchievementEvents: the hook other modules call (`record(characterId, kind, input)`). Fire-and-forget and cheap: kinds without a
// tracked requirement return at once, events are serialised per character, and any failure is logged, never thrown into the caller.
// Persists with dotted $set / $inc on the character's AchievementState and pushes onUpdateAchieve(type, id, obj) when online.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { SceneManager } from '../../gateway/scene.manager';
import { GameDataService } from '../gamedata/gamedata.service';
import type { AchieveKind } from './achievement-parse';
import {
  applyEvent, buildIndex, emptyState, toAchieveRow, toRequireRow, type AchState, type AchievementIndex, type EventInput,
} from './achievement-rules';
import { AchievementState } from './achievement.schema';

@Injectable()
export class AchievementEvents {
  private readonly logger = new Logger(AchievementEvents.name);
  private index: AchievementIndex | null = null;
  private readonly chains = new Map<number, Promise<void>>();

  constructor(
    @InjectModel(AchievementState.name) private readonly states: Model<AchievementState>,
    private readonly gameData: GameDataService,
    private readonly scenes: SceneManager,
  ) {}

  /** Requirement index over the static tables, built on first use (the tables are immutable at runtime). */
  getIndex(): AchievementIndex {
    if (!this.index) {
      this.index = buildIndex(
        this.gameData.achievementRows().map(toAchieveRow),
        this.gameData.achievementRequireRows().map(toRequireRow),
        (name) => this.gameData.creatureIdsByName(name),
      );
    }
    return this.index;
  }

  /** Hook for feature modules: never throws, never awaited. */
  record(characterId: number, kind: AchieveKind, input: EventInput = {}): void {
    void this.recordAsync(characterId, kind, input);
  }

  /** Same as record() but resolves once the event is processed (login backfill, tests). */
  recordAsync(characterId: number, kind: AchieveKind, input: EventInput = {}): Promise<void> {
    try {
      if (!this.interested(kind, input)) return Promise.resolve();
      return this.enqueue(characterId, () => this.process(characterId, kind, input));
    } catch (e) {
      this.logger.warn(`achievement ${kind} for ${characterId}: ${(e as Error).message}`);
      return Promise.resolve();
    }
  }

  /** Counts the login once per calendar day for the login-day achievements. */
  recordLogin(characterId: number, day: string): Promise<void> {
    return this.enqueue(characterId, async () => {
      const doc = await this.states.findById(characterId, { lastLoginDay: 1 }).lean();
      if (doc?.lastLoginDay === day) return;
      await this.states.updateOne({ _id: characterId }, { $set: { lastLoginDay: day } }, { upsert: true });
      await this.process(characterId, 'loginDays', { amount: 1 });
    });
  }

  async stateOf(characterId: number): Promise<AchState> {
    const doc = await this.states.findById(characterId).lean();
    return doc
      ? { achieveLog: doc.achieveLog ?? {}, achieveReqLog: doc.achieveReqLog ?? {}, takeLog: doc.takeLog ?? {}, achPoint: doc.achPoint ?? 0 }
      : emptyState();
  }

  /** Runs after everything queued so far for the character (a claim reads a settled state). */
  whenIdle(characterId: number): Promise<void> {
    return this.chains.get(characterId) ?? Promise.resolve();
  }

  private interested(kind: AchieveKind, input: EventInput): boolean {
    const idx = this.getIndex();
    if (kind === 'creatureKill') return (input.creatureIds ?? []).some((id) => idx.byCreature.has(id));
    return idx.byKind.has(kind);
  }

  private enqueue(characterId: number, fn: () => Promise<void>): Promise<void> {
    const prev = this.chains.get(characterId) ?? Promise.resolve();
    const next = prev.then(fn).catch((e: unknown) => this.logger.warn(`achievement event for ${characterId} failed: ${(e as Error).message}`));
    this.chains.set(characterId, next);
    void next.then(() => {
      if (this.chains.get(characterId) === next) this.chains.delete(characterId);
    });
    return next;
  }

  private async process(characterId: number, kind: AchieveKind, input: EventInput): Promise<void> {
    const state = await this.stateOf(characterId);
    const now = Date.now();
    const res = applyEvent(this.getIndex(), state, kind, input, now);
    if (res.reqs.length === 0) return;
    const $set: Record<string, unknown> = {};
    for (const r of res.reqs) $set[`achieveReqLog.${r.reqId}`] = { done: r.done, progress: r.progress };
    for (const c of res.completed) $set[`achieveLog.${c.aid}`] = c.at;
    const points = res.achPoint - state.achPoint;
    await this.states.updateOne({ _id: characterId }, { $set, ...(points > 0 ? { $inc: { achPoint: points } } : {}) }, { upsert: true });
    const online = this.scenes.findByCharacter(characterId);
    if (!online) return;
    for (const r of res.reqs) online.callback('onUpdateAchieve', 2, r.reqId, { progress: r.progress, done: r.done });
    for (const c of res.completed) online.callback('onUpdateAchieve', 1, c.aid, { done: c.at });
  }
}
