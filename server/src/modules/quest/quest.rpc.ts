// Quest RPCs: takeQuest, finishQuest, cancelQuest, initQuestManager.
// Pushes (self): onAddChaQuest, onCancelQuest, onSetNpcState, onAddMoney, onUPP, onPlayerLevelUp.

import { Injectable } from '@nestjs/common';
import type {
  CancelQuestResult, FinishQuestReply, InitQuestManagerReply, PlayerLevelUp, PlayerUpdate,
} from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { QuestService } from './quest.service';

function intArg(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class QuestRpc {
  constructor(
    private readonly quests: QuestService,
    private readonly gameData: GameDataService,
    private readonly stats: CharacterStatsService,
  ) {}

  @Rpc('takeQuest', { requireCharacter: true })
  async takeQuest(session: Session, args: unknown[]): Promise<null> {
    const questId = intArg(args[0], 'questId');
    const npcId = intArg(args[1], 'npcId');
    const quest = await this.quests.take(session.characterId!, questId, npcId, session.mapId);
    session.callback('onAddChaQuest', quest);
    await this.pushNpcStates(session, [npcId, quest.data.startNpc, quest.data.finishNpc]);
    return null;
  }

  @Rpc('finishQuest', { requireCharacter: true })
  async finishQuest(session: Session, args: unknown[]): Promise<FinishQuestReply> {
    // Flash sends {i, s, n}; the Go server also accepted a bare quest id.
    const raw = args[0];
    let questId: number;
    let npcId = -1;
    if (raw !== null && typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      questId = intArg(o.i, 'i');
      if (o.n !== undefined) npcId = intArg(o.n, 'n');
    } else {
      questId = intArg(raw, 'questId');
    }
    const out = await this.quests.finish(session.characterId!, questId, npcId, session.mapId);
    const id = session.characterId!;
    const update: PlayerUpdate = { level: out.exp.level, exp: out.exp.exp, attrPoints: out.exp.attrPoints };
    if (out.money) {
      session.callback('onAddMoney', id, out.money.key, out.money.amount, out.money.total);
      update[out.money.key] = out.money.total;
    }
    // A level-up changes every derived stat (base attributes +1), so it sends the full stat-refresh payload.
    session.callback('onUPP', out.exp.leveled ? { ...update, ...(await this.stats.refreshPayload(id)) } : update);
    if (out.exp.leveled) {
      const lv: PlayerLevelUp = { id, level: out.exp.level, exp: out.exp.exp, lp: out.exp.attrPoints };
      session.callback('onPlayerLevelUp', lv);
    }
    await this.pushNpcStates(session, this.gameData.npcsOnMap(session.mapId).map((r) => Number(r.id)));
    return { flag: true, qid: questId, qn: out.qn };
  }

  @Rpc('cancelQuest', { requireCharacter: true })
  async cancelQuest(session: Session, args: unknown[]): Promise<CancelQuestResult> {
    const questId = intArg(args[0], 'questId');
    const out = await this.quests.cancel(session.characterId!, questId);
    const result: CancelQuestResult = { flag: out.flag, qid: questId, qn: out.qn };
    if (out.info) result.info = out.info;
    session.callback('onCancelQuest', result);
    if (out.flag && out.tpl) await this.pushNpcStates(session, [out.tpl.startNpc, out.tpl.finishNpc]);
    return result;
  }

  @Rpc('initQuestManager', { requireCharacter: true })
  async initQuestManager(session: Session): Promise<InitQuestManagerReply> {
    const q: InitQuestManagerReply['q'] = {};
    for (const quest of await this.quests.active(session.characterId!)) q[String(quest.qid)] = quest;
    return { q };
  }

  /** onSetNpcState(npcId, state) for each distinct NPC that stands on the player's map. */
  private async pushNpcStates(session: Session, npcIds: number[]): Promise<void> {
    const ids = [...new Set(npcIds)].filter((id) => id > 0 && this.quests.npcOnMap(id, session.mapId));
    if (ids.length === 0) return;
    const states = await this.quests.npcStates(session.characterId!, ids);
    for (const [npcId, state] of states) session.callback('onSetNpcState', npcId, state);
  }
}
