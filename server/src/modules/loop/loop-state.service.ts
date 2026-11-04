// Loop state persistence + round granting (core of the loop module, importable by the quest module without a cycle).
// A round is an ordinary character_quests row, so trackers, kill credit, collect sync and finishQuest all work unchanged.
// Callers serialise per character (withCharLock). `advance` is called by QuestService.finish right after the finished round's
// row is deleted and before its reward is credited (spend before credit).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { LoopStateDTO } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { DiaryEvents } from '../activity/diary-events.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { initialObjectives } from '../quest/quest-progress';
import { CharacterQuest, type QuestObjective } from '../quest/quest.schema';
import { LoopDataService } from './loop-data.service';
import { advanceLoop, diaryTasksFor, pickRound, type LoopDef, type LoopState } from './loop-rules';
import { CharacterQuestLoop } from './loop.schema';

export interface GrantedRound {
  questId: number;
  takeDate: Date;
  objectives: QuestObjective[];
}

export interface LoopAdvanced {
  def: LoopDef;
  ft: number;
  done: boolean;
  next: GrantedRound | null;
}

const toState = (d: { ft?: number; takeDateMs?: number; active?: boolean; activeQuestId?: number }): LoopState => ({
  ft: d.ft ?? 0, takeDateMs: d.takeDateMs ?? 0, active: d.active ?? false, activeQuestId: d.activeQuestId ?? 0,
});

@Injectable()
export class LoopStateService {
  /** Randomness, replaceable in tests. */
  rng: () => number = Math.random;

  constructor(
    @InjectModel(CharacterQuestLoop.name) private readonly loops: Model<CharacterQuestLoop>,
    @InjectModel(CharacterQuest.name) private readonly quests: Model<CharacterQuest>,
    private readonly data: LoopDataService,
    private readonly gameData: GameDataService,
    private readonly diary: DiaryEvents,
  ) {}

  async state(characterId: number, loopId: number): Promise<LoopState | null> {
    const doc = await this.loops.findOne({ characterId, loopId }).lean();
    return doc ? toState(doc) : null;
  }

  /** Flash `player.loopList` for the active loops (`initQuestManager.l`). */
  async activeDtos(characterId: number): Promise<Record<string, LoopStateDTO>> {
    const out: Record<string, LoopStateDTO> = {};
    for (const d of await this.loops.find({ characterId, active: true }).lean()) out[String(d.loopId)] = this.dto(d.loopId, toState(d));
    return out;
  }

  dto(loopId: number, s: LoopState): LoopStateDTO {
    return { id: loopId, qid: loopId, takeDate: s.takeDateMs, ft: s.ft, finished: 0 };
  }

  /** Starts (or restarts) a cycle: ft 0, take time now, `questId` the first round. */
  async start(characterId: number, loopId: number, questId: number, nowMs: number): Promise<LoopState> {
    const doc = await this.loops
      .findOneAndUpdate(
        { characterId, loopId },
        { $set: { ft: 0, takeDateMs: nowMs, active: true, activeQuestId: questId } },
        { upsert: true, new: true },
      )
      .lean();
    return toState(doc);
  }

  /** Compensation when a take fails after the state was written: puts the previous state back (null = never taken). */
  async restore(characterId: number, loopId: number, prev: LoopState | null): Promise<void> {
    if (!prev) await this.loops.deleteOne({ characterId, loopId });
    else await this.loops.updateOne({ characterId, loopId }, { $set: prev });
  }

  /** Creates the round's quest row, replacing a stale one (Go grantLoopChild). */
  async grantRound(characterId: number, questId: number): Promise<GrantedRound> {
    const tpl = this.gameData.getQuest(questId);
    if (!tpl) throw RpcException.notFound('Nhiệm vụ không tồn tại');
    await this.quests.deleteOne({ characterId, questId });
    const objectives = initialObjectives(tpl, this.gameData.questRequire(questId));
    const takeDate = new Date();
    await this.quests.create({ characterId, questId, takeDate, objectives });
    return { questId, takeDate, objectives };
  }

  /** The loop whose active round is `questId`, or a refusal (finishing a round outside its loop state is not allowed). */
  async requireActiveRound(characterId: number, loopId: number, questId: number): Promise<LoopState> {
    const s = await this.state(characterId, loopId);
    if (!s?.active || s.activeQuestId !== questId) throw RpcException.forbidden('Vòng nhiệm vụ không hợp lệ');
    return s;
  }

  /** Finished a round: ft + 1, then the next round (granted) or the end of the cycle; diary hooks fire. */
  async advance(characterId: number, loopId: number, doneQuestId: number, level: number): Promise<LoopAdvanced> {
    const def = await this.data.def(loopId);
    if (!def) throw RpcException.notFound('Vòng nhiệm vụ không tồn tại');
    const s = await this.requireActiveRound(characterId, loopId, doneQuestId);
    const nextId = s.ft + 1 < def.num ? pickRound(await this.data.pool(loopId), level, doneQuestId, this.rng) : null;
    const adv = advanceLoop(def, s.ft, nextId);
    const set = adv.done
      ? { ft: adv.ft, active: false, activeQuestId: 0 }
      : { ft: adv.ft, activeQuestId: adv.nextQuestId ?? 0 };
    const res = await this.loops.updateOne(
      { characterId, loopId, active: true, activeQuestId: doneQuestId, ft: s.ft },
      adv.done ? { $set: set, $inc: { cycles: adv.ft >= def.num ? 1 : 0 } } : { $set: set },
    );
    if (res.modifiedCount !== 1) throw RpcException.forbidden('Vòng nhiệm vụ không hợp lệ');
    for (const task of diaryTasksFor(loopId, adv.ft)) this.diary.record(characterId, task, 1);
    const next = adv.nextQuestId === null ? null : await this.grantRound(characterId, adv.nextQuestId);
    return { def, ft: adv.ft, done: adv.done, next };
  }

  /** Gives the loop up: the active round row goes away, the state goes inactive (take time kept). Returns the dropped round. */
  async cancel(characterId: number, loopId: number): Promise<number> {
    const s = await this.state(characterId, loopId);
    if (!s?.active) throw RpcException.forbidden('Không thể xóa vòng vừa nhận!');
    const res = await this.loops.updateOne(
      { characterId, loopId, active: true },
      { $set: { active: false, activeQuestId: 0 } },
    );
    if (res.modifiedCount !== 1) throw RpcException.forbidden('Không thể xóa vòng vừa nhận!');
    await this.quests.deleteOne({ characterId, questId: s.activeQuestId });
    return s.activeQuestId;
  }

  /** Recreates the active round's quest row when it is missing; returns the round id (null when the loop is not active). */
  async repair(characterId: number, loopId: number): Promise<{ questId: number; created: boolean } | null> {
    const s = await this.state(characterId, loopId);
    if (!s?.active || s.activeQuestId <= 0) return null;
    const exists = await this.quests.exists({ characterId, questId: s.activeQuestId });
    if (!exists) await this.grantRound(characterId, s.activeQuestId);
    return { questId: s.activeQuestId, created: !exists };
  }

  /** Does the character hold a quest of this loop's pool? (the repair-button condition). */
  async hasRoundQuest(characterId: number, loopId: number): Promise<boolean> {
    const s = await this.state(characterId, loopId);
    return !!s?.active && !!(await this.quests.exists({ characterId, questId: s.activeQuestId }));
  }
}
