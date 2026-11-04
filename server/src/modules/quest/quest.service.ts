// Quest logic + persistence: NPC quest lists/markers, take / finish / cancel, active quest DTOs, kill credit and the
// login questLog. Collect objectives are counted from the bag and consumed on finish. Rewards: exp (auto level-up < 20),
// money and data_tbl_quest_award items / equipment (quest-reward.service.ts); accept grants start_grant_item.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MAX_QUEST_NUM, MoneyType, QuestState } from '@mc/shared';
import type { ChaQuest, MoneyKey, QuestRequire, QuestView } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import type { QuestTemplate } from '../gamedata/quest-data';
import { withCharLock } from '../inventory/char-lock';
import type { Push } from '../inventory/pushes';
import { allMet, creditKills, initialObjectives, questKillOf } from './quest-progress';
import { QuestProgressService } from './quest-progress.service';
import { QuestRewardService } from './quest-reward.service';
import { CharacterQuest, QuestHistory, type QuestObjective } from './quest.schema';
import {
  acceptBlocker, applyExp, isSupported, npcQuestStates, npcStateOf,
  type ActiveQuestInfo, type ExpResult, type QuestChar,
} from './quest.rules';

interface ActiveRow {
  questId: number;
  takeDate: Date;
  objectives: QuestObjective[];
}

/** Per-request snapshot of one character's quest state. */
export interface QuestCtx {
  char: QuestChar;
  active: Map<number, ActiveRow>;
  done: Set<number>;
}

export interface FinishOutcome {
  tpl: QuestTemplate;
  qn: number;
  exp: ExpResult;
  money: { key: CreditedMoney; amount: number; total: number } | null;
  pushes: Push[]; // bag changes from consuming the collected items (sent before the rewards)
  rewardPushes: Push[]; // onAddItem + onAddCharactorSlot for the award items (sent after exp / money)
}

export interface TakeOutcome {
  quest: ChaQuest;
  pushes: Push[]; // onAddItem + onAddCharactorSlot for the accept-time item (sent after onAddChaQuest)
}

/** Quests whose kill counters moved in a battle: the onAddChaQuest payloads and the finish NPCs of the now finishable ones. */
export interface KillCredit {
  quests: ChaQuest[];
  finishNpcs: number[];
}

type CreditedMoney = Extract<MoneyKey, 'moneyBind' | 'money' | 'gold'>;

const MONEY_FIELD: Record<number, CreditedMoney> = {
  [MoneyType.MONEY_BIND]: 'moneyBind',
  [MoneyType.MONEY]: 'money',
  // No goldBind field on Character yet: bound gold rewards are credited as gold.
  [MoneyType.GOLD_BIND]: 'gold',
  [MoneyType.GOLD]: 'gold',
};

const isDupKey = (e: unknown): boolean => (e as { code?: number } | null)?.code === 11000;

@Injectable()
export class QuestService {
  constructor(
    @InjectModel(CharacterQuest.name) private readonly quests: Model<CharacterQuest>,
    @InjectModel(QuestHistory.name) private readonly history: Model<QuestHistory>,
    @InjectModel(Character.name) private readonly characters: Model<Character>,
    private readonly gameData: GameDataService,
    private readonly progress: QuestProgressService,
    private readonly rewards: QuestRewardService,
  ) {}

  async loadCtx(characterId: number): Promise<QuestCtx> {
    const [doc, rows, hist] = await Promise.all([
      this.characters.findById(characterId, { level: 1, gender: 1, classId: 1 }).lean(),
      this.quests.find({ characterId }).lean(),
      this.history.find({ characterId }, { questId: 1 }).lean(),
    ]);
    if (!doc) throw RpcException.notFound('character not found');
    const synced = await this.progress.syncRows(characterId, rows);
    return {
      char: { level: doc.level, gender: doc.gender, classId: doc.classId },
      active: new Map(synced.map((r) => [r.questId, { questId: r.questId, takeDate: r.takeDate, objectives: r.objectives }])),
      done: new Set(hist.map((h) => h.questId)),
    };
  }

  /** Quest id -> state for the quests an NPC shows (offers + turn-ins). */
  statesForNpc(ctx: QuestCtx, npcId: number): Map<number, number> {
    const activeIds = new Set(ctx.active.keys());
    const offerable = this.gameData
      .questsByStartNpc(npcId)
      .filter((t) => isSupported(t, this.gameData.questRequire(t.id)))
      .filter((t) => acceptBlocker(ctx.char, t, activeIds, ctx.done, this.gameData.questPre(t.id)) === null);
    const active: ActiveQuestInfo[] = [];
    for (const row of ctx.active.values()) {
      const tpl = this.gameData.getQuest(row.questId);
      if (tpl) active.push({ tpl, met: allMet(row.objectives) });
    }
    return npcQuestStates(npcId, offerable, active);
  }

  /** Head-marker state for each NPC id (one Mongo round trip for the character's state). */
  async npcStates(characterId: number, npcIds: readonly number[]): Promise<Map<number, number>> {
    const ctx = await this.loadCtx(characterId);
    return new Map(npcIds.map((id) => [id, npcStateOf(this.statesForNpc(ctx, id))]));
  }

  async listForNpc(characterId: number, npcId: number): Promise<{ state: number; list: Record<string, QuestView> }> {
    const ctx = await this.loadCtx(characterId);
    const states = this.statesForNpc(ctx, npcId);
    const list: Record<string, QuestView> = {};
    for (const [qid, state] of states) {
      const tpl = this.gameData.getQuest(qid);
      if (tpl) list[String(qid)] = await this.toView(tpl, state, ctx.active.get(qid)?.objectives);
    }
    return { state: npcStateOf(states), list };
  }

  async take(characterId: number, questId: number, npcId: number, mapId: number): Promise<TakeOutcome> {
    const tpl = this.gameData.getQuest(questId);
    if (!tpl) throw RpcException.notFound('Nhiệm vụ không tồn tại');
    const require = this.gameData.questRequire(questId);
    if (!isSupported(tpl, require)) throw RpcException.forbidden('Nhiệm vụ này chưa được hỗ trợ');
    if (npcId !== tpl.startNpc || !this.npcOnMap(npcId, mapId)) throw RpcException.forbidden('Không thể nhận nhiệm vụ ở đây');
    const ctx = await this.loadCtx(characterId);
    if (ctx.active.size >= MAX_QUEST_NUM) throw RpcException.forbidden(`Chỉ được nhận tối đa ${MAX_QUEST_NUM} nhiệm vụ`);
    const blocker = acceptBlocker(ctx.char, tpl, new Set(ctx.active.keys()), ctx.done, this.gameData.questPre(questId));
    if (blocker) throw RpcException.forbidden(blocker);
    // Grant items start met, kills at 0; collect objectives are counted from the bag whenever they are read.
    const objectives = initialObjectives(tpl, require);
    const takeDate = new Date();
    try {
      await this.quests.create({ characterId, questId, takeDate, objectives });
    } catch (e) {
      if (isDupKey(e)) throw RpcException.forbidden('Đã nhận nhiệm vụ này');
      throw e;
    }
    const pushes = await this.rewards.grantStart(characterId, tpl);
    const synced = await this.progress.syncObjectives(characterId, tpl, objectives);
    return { quest: await this.toChaQuest(tpl, { questId, takeDate, objectives: synced }), pushes };
  }

  /** Serialized per character: the collected items are consumed first, then the active row is deleted, then the reward. */
  finish(characterId: number, questId: number, npcId: number, mapId: number, selectId: number): Promise<FinishOutcome> {
    return withCharLock(characterId, () => this.finishLocked(characterId, questId, npcId, mapId, selectId));
  }

  private async finishLocked(
    characterId: number, questId: number, npcId: number, mapId: number, selectId: number,
  ): Promise<FinishOutcome> {
    const tpl = this.gameData.getQuest(questId);
    if (!tpl) throw RpcException.notFound('Nhiệm vụ không tồn tại');
    const row = await this.quests.findOne({ characterId, questId }).lean();
    if (!row) throw RpcException.forbidden('Chưa nhận nhiệm vụ này');
    const objectives = await this.progress.syncObjectives(characterId, tpl, row.objectives);
    if (!allMet(objectives)) throw RpcException.forbidden('Chưa hoàn thành yêu cầu nhiệm vụ');
    if (tpl.finishNpc > 0 && (npcId !== tpl.finishNpc || !this.npcOnMap(npcId, mapId))) {
      throw RpcException.forbidden('Không thể trả nhiệm vụ ở đây');
    }
    const doc = await this.characters.findById(characterId);
    if (!doc) throw RpcException.notFound('character not found');
    // Reward room is checked before anything is spent (Flash QuestPanel.checkBag, QUESTPANEL_S[13]).
    const awards = await this.rewards.plan(tpl, doc.classId, selectId);
    if (!(await this.rewards.canFit(characterId, awards))) throw RpcException.forbidden('Túi không đủ chỗ trống!');
    // Go CompleteQuest: the collected items are taken out of the bag before the quest is completed and rewarded.
    const pushes = await this.progress.consumeCollected(characterId, tpl, objectives);
    const del = await this.quests.deleteOne({ _id: row._id });
    if (del.deletedCount !== 1) throw RpcException.forbidden('Chưa nhận nhiệm vụ này');
    await this.history.create({ characterId, questId }).catch((e: unknown) => {
      if (!isDupKey(e)) throw e;
    });

    const exp = applyExp({ level: doc.level, exp: doc.exp, attrPoints: doc.attrPoints }, tpl.awardExp);
    doc.level = exp.level;
    doc.exp = exp.exp;
    doc.attrPoints = exp.attrPoints;
    if (exp.statGain > 0) {
      doc.strength += exp.statGain;
      doc.agility += exp.statGain;
      doc.stamina += exp.statGain;
      doc.intelligence += exp.statGain;
      doc.energy += exp.statGain;
    }
    let money: FinishOutcome['money'] = null;
    const field = MONEY_FIELD[tpl.moneyType];
    if (field && tpl.moneyNum > 0) {
      doc[field] = (doc[field] ?? 0) + tpl.moneyNum;
      money = { key: field, amount: tpl.moneyNum, total: doc[field] };
    }
    await doc.save();
    const granted = await this.rewards.grant(characterId, awards);
    const petPushes = await this.rewards.grantPets(characterId, tpl, doc.classId, selectId); // after the item awards
    const petExp = await this.rewards.grantPetExp(characterId, tpl.awardExp); // the active pet gets the full quest exp
    const qn = await this.quests.countDocuments({ characterId });
    return { tpl, qn, exp, money, pushes, rewardPushes: [...granted.pushes, ...petPushes, ...petExp] };
  }

  async cancel(characterId: number, questId: number): Promise<{ flag: boolean; qn: number; info?: string; tpl?: QuestTemplate }> {
    const tpl = this.gameData.getQuest(questId);
    const qn = await this.quests.countDocuments({ characterId });
    if (!tpl) return { flag: false, qn, info: 'Nhiệm vụ không tồn tại' };
    if (tpl.type === 1) return { flag: false, qn, info: 'Không thể hủy nhiệm vụ này', tpl };
    const del = await this.quests.deleteOne({ characterId, questId });
    if (del.deletedCount !== 1) return { flag: false, qn, info: 'Chưa nhận nhiệm vụ này', tpl };
    return { flag: true, qn: qn - 1, tpl };
  }

  async active(characterId: number): Promise<ChaQuest[]> {
    const rows = await this.progress.syncRows(characterId, await this.quests.find({ characterId }).sort({ takeDate: -1 }).lean());
    const out: ChaQuest[] = [];
    for (const r of rows) {
      const tpl = this.gameData.getQuest(r.questId);
      if (tpl) out.push(await this.toChaQuest(tpl, r));
    }
    return out;
  }

  /**
   * Kill credit for a won battle (Go OnMonsterKilled, one call per dead creature): the first incomplete matching kill
   * objective of each active quest gains +1. Persisted here; the caller pushes the returned quests after battlePlayEnd.
   */
  async onCreatureKilled(characterId: number, creatureIds: readonly number[]): Promise<KillCredit> {
    if (creatureIds.length === 0) return { quests: [], finishNpcs: [] };
    const rows = await this.quests.find({ characterId }).lean();
    const moved: ActiveRow[] = [];
    for (const r of rows) {
      const credit = creditKills(r.objectives, creatureIds);
      if (!credit.changed) continue;
      await this.quests.updateOne({ _id: r._id }, { $set: { objectives: credit.objectives } });
      moved.push({ questId: r.questId, takeDate: r.takeDate, objectives: credit.objectives });
    }
    const out: KillCredit = { quests: [], finishNpcs: [] };
    for (const row of await this.progress.syncRows(characterId, moved)) {
      const tpl = this.gameData.getQuest(row.questId);
      if (!tpl) continue;
      out.quests.push(await this.toChaQuest(tpl, row));
      if (allMet(row.objectives) && tpl.finishNpc > 0) out.finishNpcs.push(tpl.finishNpc);
    }
    return out;
  }

  /** Login fields: questLog "|id|id|" ("|" when none) and qn (active count). */
  async loginInfo(characterId: number): Promise<{ questLog: string; qn: number }> {
    const [hist, qn] = await Promise.all([
      this.history.find({ characterId }, { questId: 1 }).sort({ completedAt: 1 }).lean(),
      this.quests.countDocuments({ characterId }),
    ]);
    return { questLog: `|${hist.map((h) => `${h.questId}|`).join('')}`, qn };
  }

  /** `objectives` = the active row (for questKill); omitted for a quest not taken yet (every kill still remaining). */
  async toView(tpl: QuestTemplate, state: number, objectives?: readonly QuestObjective[]): Promise<QuestView> {
    const rows = this.gameData.questRequire(tpl.id);
    const require: QuestRequire[] = await Promise.all(
      rows.map(async (r) => ({
        kind: r.kind, type: r.type, itemId: r.itemId, num: r.num, q: r.q, name: await this.requireName(r.kind, r.type, r.itemId),
      })),
    );
    const start = this.gameData.getNpc(tpl.startNpc);
    const finish = this.gameData.getNpc(tpl.finishNpc);
    const finishMap = finish ? this.gameData.getMap(Number(finish.pos_map_id)) : undefined;
    const startMap = start ? this.gameData.getMap(Number(start.pos_map_id)) : undefined;
    return {
      qid: tpl.id,
      state,
      data: {
        id: tpl.id, name: tpl.name, info: tpl.info, type: tpl.type, startText: tpl.startText,
        completeText: tpl.completeText, awardExp: tpl.awardExp, moneyNum: tpl.moneyNum, moneyType: tpl.moneyType,
        startNpc: tpl.startNpc, finishNpc: tpl.finishNpc, minLevel: tpl.minLevel, color: tpl.color, at: tpl.at,
      },
      require,
      award: await this.rewards.views(tpl.id),
      questKill: questKillOf(objectives ?? initialObjectives(tpl, rows)),
      sName: String(start?.name ?? ''),
      sMid: Number(start?.pos_map_id ?? 0),
      sMap: String(startMap?.name ?? ''),
      fName: String(finish?.name ?? ''),
      pos: finish
        ? {
            map: Number(finish.pos_map_id ?? 0),
            x: Number(finish.pos_x ?? 0),
            y: Number(finish.pos_y ?? 0),
            name: String(finishMap?.name ?? ''),
          }
        : null,
    };
  }

  private async toChaQuest(tpl: QuestTemplate, row: ActiveRow): Promise<ChaQuest> {
    const state = allMet(row.objectives) ? QuestState.CAN_FINISH : QuestState.TAKEN;
    return { ...(await this.toView(tpl, state, row.objectives)), takeDate: row.takeDate.getTime() };
  }

  private requireName(kind: number, type: number, id: number): Promise<string> | string {
    if (kind === 1) return this.gameData.templateName(type, id);
    return kind === 2 || kind === 3 ? (this.gameData.creature(id)?.name ?? `#${id}`) : `#${id}`;
  }

  npcOnMap(npcId: number, mapId: number): boolean {
    const npc = this.gameData.getNpc(npcId);
    return !!npc && Number(npc.pos_map_id) === mapId;
  }
}
