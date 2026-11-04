// DiaryEvents: the hook other modules call to count a diary task (`record(cid, taskId, amount)`, `raiseTo(cid, taskId, target)`).
// Fire-and-forget like AchievementEvents: serialised per character, failures are logged never thrown, and the owner gets
// `updateDiaryData(id, val, act)` when online. State is today's character_daily document (UTC+7 day key).

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { dayKey, type UpdateDiaryDataArgs } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import { ActivityDataService } from './activity-data.service';
import { applyTask, missing } from './diary-rules';
import { CharacterDaily } from './daily.schema';

@Injectable()
export class DiaryEvents {
  private readonly logger = new Logger(DiaryEvents.name);
  private readonly chains = new Map<number, Promise<void>>();
  /** Clock, replaceable in tests. */
  now = (): number => Date.now();

  constructor(
    @InjectModel(CharacterDaily.name) private readonly days: Model<CharacterDaily>,
    private readonly data: ActivityDataService,
    private readonly scenes: SceneManager,
  ) {}

  record(characterId: number, taskId: number, amount = 1): void {
    void this.recordAsync(characterId, taskId, amount);
  }

  /** Same as record() but resolves once processed. */
  recordAsync(characterId: number, taskId: number, amount = 1): Promise<void> {
    return this.enqueue(characterId, async () => {
      const row = await this.data.diaryRow(taskId);
      if (!row) return;
      const day = dayKey(this.now());
      const doc = await this.days.findOne({ characterId, day }, { tasks: 1 }).lean();
      const out = applyTask(row, doc?.tasks?.[String(taskId)] ?? 0, amount);
      if (out.counted === 0) return;
      await this.write(characterId, day, taskId, out.counted, out.points);
    });
  }

  /** Raises a task's count to `target` (e.g. 30-minute online ticks derived from the day's online time). */
  raiseTo(characterId: number, taskId: number, target: number): Promise<void> {
    return this.enqueue(characterId, async () => {
      const row = await this.data.diaryRow(taskId);
      if (!row) return;
      const day = dayKey(this.now());
      const doc = await this.days.findOne({ characterId, day }, { tasks: 1 }).lean();
      const need = missing(row, doc?.tasks?.[String(taskId)] ?? 0, target);
      if (need === 0) return;
      const out = applyTask(row, doc?.tasks?.[String(taskId)] ?? 0, need);
      await this.write(characterId, day, taskId, out.counted, out.points);
    });
  }

  /** Runs after everything queued so far for the character. */
  whenIdle(characterId: number): Promise<void> {
    return this.chains.get(characterId) ?? Promise.resolve();
  }

  private async write(characterId: number, day: string, taskId: number, counted: number, points: number): Promise<void> {
    const doc = await this.incDay(characterId, day, { [`tasks.${taskId}`]: counted, vitality: points });
    const session = this.scenes.findByCharacter(characterId);
    if (!session || !doc) return;
    const args: UpdateDiaryDataArgs = { id: String(taskId), val: doc.tasks?.[String(taskId)] ?? counted, act: doc.vitality ?? points };
    session.callback('updateDiaryData', args.id, args.val, args.act);
  }

  /** $inc on today's document of a character (created on first use); shared with the online ticker and the chest claim. */
  async incDay(characterId: number, day: string, inc: Record<string, number>): Promise<CharacterDaily | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.days.findOneAndUpdate({ characterId, day }, { $inc: inc }, { upsert: true, new: true }).lean();
      } catch (e) {
        if (attempt >= 1 || (e as { code?: number }).code !== 11000) throw e; // lost the upsert race: retry once as an update
      }
    }
  }

  private enqueue(characterId: number, job: () => Promise<void>): Promise<void> {
    const run = (this.chains.get(characterId) ?? Promise.resolve()).then(job).catch((e: unknown) => {
      this.logger.warn(`diary event for ${characterId}: ${(e as Error).message}`);
    });
    this.chains.set(characterId, run);
    void run.then(() => {
      if (this.chains.get(characterId) === run) this.chains.delete(characterId);
    });
    return run;
  }
}
