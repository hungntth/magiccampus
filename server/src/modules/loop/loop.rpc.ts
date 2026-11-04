// Loop quest RPCs (all fire-and-forget in Flash): takeLoop(lid, npcId), cancelLoop(lid), loopRepaire(lid) [Flash spelling].
// Pushes (self): onTakeLoop {flag, d}, onAddChaQuest (the round), onCancelQuest + onCancelLoopQuest {flag, id}, onSetNpcState;
// a refused take also sends onSystemMidMsgOrNote with the reason. Round completion is announced by finishQuest
// (onFinishLoopQuest {id, ft}, in quest.rpc.ts).

import { Injectable } from '@nestjs/common';
import type { CancelLoopQuestPush, TakeLoopPush } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { sendPushes } from '../inventory/pushes';
import { QuestService } from '../quest/quest.service';
import { LoopService } from './loop.service';

function intArg(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class LoopRpc {
  constructor(
    private readonly loops: LoopService,
    private readonly quests: QuestService,
  ) {}

  @Rpc('takeLoop', { requireCharacter: true, forbidInBattle: true })
  async takeLoop(session: Session, args: unknown[]): Promise<null> {
    const lid = intArg(args[0], 'lid');
    const npcId = intArg(args[1], 'npcId');
    const id = session.characterId!;
    try {
      const out = await this.loops.take(id, lid, npcId, session.mapId);
      const ok: TakeLoopPush = { flag: true, d: out.dto };
      session.callback('onTakeLoop', ok);
      session.callback('onAddChaQuest', out.quest);
      sendPushes(session, await this.loops.startPushes(id, out.quest.qid));
      await this.pushNpcStates(session, out.npcIds);
    } catch (e) {
      const no: TakeLoopPush = { flag: false };
      session.callback('onTakeLoop', no);
      if (e instanceof RpcException) session.callback('onSystemMidMsgOrNote', e.message);
      throw e;
    }
    return null;
  }

  @Rpc('cancelLoop', { requireCharacter: true, forbidInBattle: true })
  async cancelLoop(session: Session, args: unknown[]): Promise<null> {
    const lid = intArg(args[0], 'lid');
    try {
      const out = await this.loops.cancel(session.characterId!, lid);
      session.callback('onCancelQuest', { flag: true, qid: out.qid, qn: out.qn });
      const done: CancelLoopQuestPush = { flag: true, id: lid };
      session.callback('onCancelLoopQuest', done);
      await this.pushNpcStates(session, out.npcIds);
    } catch (e) {
      const no: CancelLoopQuestPush = { flag: false, id: lid };
      session.callback('onCancelLoopQuest', no);
      throw e;
    }
    return null;
  }

  @Rpc('loopRepaire', { requireCharacter: true, forbidInBattle: true })
  async loopRepaire(session: Session, args: unknown[]): Promise<null> {
    const lid = intArg(args[0], 'lid');
    session.callback('onAddChaQuest', await this.loops.repair(session.characterId!, lid));
    return null;
  }

  /** onSetNpcState(npcId, state) for each distinct NPC of the list that stands on the player's map. */
  private async pushNpcStates(session: Session, npcIds: number[]): Promise<void> {
    const ids = [...new Set(npcIds)].filter((id) => id > 0 && this.quests.npcOnMap(id, session.mapId));
    if (ids.length === 0) return;
    for (const [npcId, state] of await this.quests.npcStates(session.characterId!, ids)) {
      session.callback('onSetNpcState', npcId, state);
    }
  }
}
