// battlePlayEnd(): the per-participant end of a battle. Every member's client calls it after its own end marker; each gets only
// its own pushes: onAddChaQuest / onSetNpcState (kill credit), onAddMoney, onUPP, onPlayerLevelUp, onAddItem + onAddCharactorSlot /
// onRedMsg (loot), onSetCharState back to normal. The battle is dropped once every member has ended it or is gone.

import { Injectable } from '@nestjs/common';
import { BattleResult, CharState, type PlayerLevelUp, type SetCharState } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { QuestService } from '../quest/quest.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { BattleManager } from './battle.manager';
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
  constructor(
    private readonly manager: BattleManager,
    private readonly settleService: BattleSettleService,
    private readonly scenes: SceneManager,
    private readonly stats: CharacterStatsService,
    private readonly quests: QuestService,
  ) {}

  async end(session: Session): Promise<void> {
    const cid = session.characterId!;
    const battle = this.manager.ofCharacter(cid);
    const member = battle?.members.get(cid);
    if (battle && member) {
      // A premature call (battle still running) counts as fleeing for everyone: HP/MP are kept, nothing is rewarded.
      if (!battle.ended) await this.settleService.settle(battle, BattleResult.FLED);
      this.manager.detach(battle, cid);
      await this.pushResult(session, member.result);
    }
    session.battleId = null;
    session.encounterUntil = Date.now() + ENCOUNTER_COOLDOWN_MS;
    pushCharState(this.scenes, session, CharState.NORMAL);
  }

  private async pushResult(session: Session, r: MemberResult): Promise<void> {
    const cid = session.characterId!;
    await this.pushQuestKills(session, cid, r);
    if (r.report.money > 0) session.callback('onAddMoney', cid, 'moneyBind', r.report.money, r.moneyTotal);
    const update = await this.stats.refreshPayload(cid);
    session.callback('onUPP', update);
    if (r.levelUp) {
      const lv: PlayerLevelUp = { id: cid, level: update.level ?? 0, exp: update.exp ?? 0, lp: update.attrPoints ?? 0 };
      session.callback('onPlayerLevelUp', lv);
    }
    if (r.loot) {
      for (const notice of r.loot.notices) session.callback('onAddItem', notice);
      for (const item of r.loot.changed) session.callback('onAddCharactorSlot', item);
      if (r.loot.bagFull) session.callback('onRedMsg', 'Túi đồ đã đầy');
    }
  }

  /** Kill credit: the changed quests (remaining counts), then the marker of each finish NPC standing on this map. */
  private async pushQuestKills(session: Session, cid: number, r: MemberResult): Promise<void> {
    const credit = r.quest;
    if (!credit) return;
    for (const q of credit.quests) session.callback('onAddChaQuest', q);
    const npcIds = [...new Set(credit.finishNpcs)].filter((id) => this.quests.npcOnMap(id, session.mapId));
    if (npcIds.length === 0) return;
    for (const [npcId, state] of await this.quests.npcStates(cid, npcIds)) session.callback('onSetNpcState', npcId, state);
  }
}
