// battlePlayEnd(): the per-participant end of a battle. Every member's client calls it after its own end marker; each gets only
// its own pushes: onAddChaQuest / onSetNpcState (kill credit), onBossOff (a loop boss whose kill completed, M9), onAddMoney, onUPP, onPlayerLevelUp, the owner's pet pushes (onUpdatePet exp / life / level,
// onRefreshPetProp), upLongBuff / delBuff (battle-count food buffs losing a charge), onAddItem + onAddCharactorSlot / onRedMsg (loot), onAddPet for caught pets (last), onSetCharState back to normal. The battle is dropped once every member has ended it or is gone.

import { Injectable, Logger } from '@nestjs/common';
import { BattleResult, CharState, type PlayerLevelUp, type SetCharState } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import { BuffService } from '../buff/buff.service';
import { sendPushes } from '../inventory/pushes';
import { LoopBossService } from '../loop/loop-boss.service';
import type { Session } from '../../gateway/session';
import { QuestService } from '../quest/quest.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { BattleManager } from './battle.manager';
import { BattleHooks } from './battle-hooks';
import { BattleSettleService } from './battle-settle.service';
import type { MemberResult } from './battle.types';
import { ENCOUNTER_COOLDOWN_MS } from './encounter';

/** onSetCharState to the character itself and to the rest of its map. */
export function pushCharState(scenes: SceneManager, session: Session, state: number): void {
  const msg: SetCharState = { cid: session.characterId!, state };
  session.callback('onSetCharState', msg);
  scenes.broadcast(session.mapId, 'onSetCharState', [msg], session);
}

@Injectable()
export class BattleEndService {
  private readonly logger = new Logger(BattleEndService.name);

  constructor(
    private readonly manager: BattleManager,
    private readonly settleService: BattleSettleService,
    private readonly scenes: SceneManager,
    private readonly stats: CharacterStatsService,
    private readonly quests: QuestService,
    private readonly bosses: LoopBossService,
    private readonly hooks: BattleHooks,
    private readonly buffs: BuffService,
  ) {}

  async end(session: Session): Promise<unknown> {
    const cid = session.characterId!;
    const battle = this.manager.ofCharacter(cid);
    const member = battle?.members.get(cid);
    let reply: unknown = null;
    if (battle && member) {
      // A premature call (battle still running) counts as fleeing for everyone: HP/MP are kept, nothing is rewarded.
      if (!battle.ended) await this.settleService.settle(battle, BattleResult.FLED);
      reply = this.hooks.reply(battle, cid);
      this.manager.detach(battle, cid);
      await this.pushResult(session, member.result);
    }
    session.battleId = null;
    session.encounterUntil = Date.now() + ENCOUNTER_COOLDOWN_MS;
    pushCharState(this.scenes, session, CharState.NORMAL);
    return reply;
  }

  private async pushResult(session: Session, r: MemberResult): Promise<void> {
    const cid = session.characterId!;
    await this.pushQuestKills(session, cid, r);
    if (r.report.money > 0) session.callback('onAddMoney', cid, 'moneyBind', r.report.money, r.moneyTotal);
    await this.consumeBuffCharges(session, cid); // before the stat refresh: an expired food buff leaves the stats
    const update = await this.stats.refreshPayload(cid);
    session.callback('onUPP', update);
    if (r.levelUp) {
      const lv: PlayerLevelUp = { id: cid, level: update.level ?? 0, exp: update.exp ?? 0, lp: update.attrPoints ?? 0 };
      session.callback('onPlayerLevelUp', lv);
    }
    sendPushes(session, r.petPushes);
    if (r.loot) {
      for (const notice of r.loot.notices) session.callback('onAddItem', notice);
      for (const item of r.loot.changed) session.callback('onAddCharactorSlot', item);
      sendPushes(session, r.loot.pushes ?? []);
      if (r.loot.bagFull) session.callback('onRedMsg', 'Túi đồ đã đầy');
    }
    sendPushes(session, r.catchPushes); // caught pets arrive after everything else
  }

  /** Legacy ConsumeBattleCharges at battlePlayEnd: battle-count buffs lose one charge (upLongBuff), the last one deletes the row (delBuff). */
  private async consumeBuffCharges(session: Session, cid: number): Promise<void> {
    try {
      const { updated, removed } = await this.buffs.consumeBattleCharges(cid);
      for (const b of updated) session.callback('upLongBuff', b);
      for (const id of removed) session.callback('delBuff', id);
    } catch (e) {
      this.logger.error(`battle buff charges failed for character ${cid}: ${(e as Error).message}`);
    }
  }

  /** Kill credit: the changed quests (remaining counts), then the marker of each finish NPC standing on this map. */
  private async pushQuestKills(session: Session, cid: number, r: MemberResult): Promise<void> {
    const credit = r.quest;
    if (!credit) return;
    for (const q of credit.quests) session.callback('onAddChaQuest', q);
    sendPushes(session, await this.bosses.defeated(cid, credit.quests.map((q) => q.qid)));
    const npcIds = [...new Set(credit.finishNpcs)].filter((id) => this.quests.npcOnMap(id, session.mapId));
    if (npcIds.length === 0) return;
    for (const [npcId, state] of await this.quests.npcStates(cid, npcIds)) session.callback('onSetNpcState', npcId, state);
  }
}
