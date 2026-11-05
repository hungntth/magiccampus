// World boss entry (Go application/worldboss entry.go): canEnterWbMap refuses with onSystemSay in this order: neither lobby nor run,
// level, in a battle, pool empty (running only). Otherwise it saves the return point, leaves the group (solo event), teleports
// (onSceneEnter first: initWbView copies posMapId into Core.wbMapId), pushes initWbView + the online count and starts the first
// battle after 2 s (in the lobby it only tells the start time). takeWbAward grants the pending bags (a full bag keeps them) and leaves.

import { Injectable } from '@nestjs/common';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { systemSay } from '../npcscript/menu';
import { PartyManager } from '../party/party.manager';
import { PartyService } from '../party/party.service';
import { SceneTransportService } from '../scene/scene-transport.service';
import { WB, WB_TEXT_SERVER as T } from './wb-config';
import { WbBattleService } from './wb-battle.service';
import { WbExitService } from './wb-exit.service';
import { WbPayoutService } from './wb-payout.service';
import { WbPush } from './wb-push.service';
import { WbState, newParticipant } from './wb-state.service';
import { wbClockLabel } from './wb-schedule';

@Injectable()
export class WbEntryService {
  constructor(
    private readonly state: WbState,
    private readonly push: WbPush,
    private readonly payout: WbPayoutService,
    private readonly exit: WbExitService,
    private readonly battles: WbBattleService,
    private readonly characters: CharacterService,
    private readonly transport: SceneTransportService,
    private readonly parties: PartyManager,
    private readonly party: PartyService,
  ) {}

  /** canEnterWbMap: the player joins the event map (every refusal is an onSystemSay, the RPC itself answers null). */
  async enter(session: Session): Promise<void> {
    const cid = session.characterId!;
    const e = this.state.event;
    const doc = await this.characters.getById(cid);
    if (!this.state.running && !this.state.lobby) {
      systemSay(session, T.NOT_STARTED);
      if (doc.mapId === WB.MAP_ID && session.battleId === null) await this.exit.leave(cid, false); // clicking the icon outside an event gets you out
      return;
    }
    if (doc.level < WB.MIN_LEVEL) return systemSay(session, T.LEVEL(WB.MIN_LEVEL));
    if (session.battleId !== null) return systemSay(session, T.IN_BATTLE);
    if (this.state.running && e.hp <= 0) return systemSay(session, T.KILLED);
    const p = e.participants.get(cid) ?? newParticipant(cid, doc.name, doc.classId, doc.level);
    e.participants.set(cid, p);
    p.name = doc.name;
    p.classId = doc.classId;
    p.level = doc.level;
    if (doc.mapId !== WB.MAP_ID) p.ret = { map: doc.mapId, x: doc.posX, y: doc.posY };
    p.inMap = true;
    p.dead = false;
    try {
      if (this.parties.partyOf(cid)) await this.party.leave(session); // Go groupLeave: the event is solo
      session.callback('onSceneEnter', await this.transport.moveToMap(session, WB.MAP_ID, WB.ENTRY_X, WB.ENTRY_Y));
    } catch {
      p.inMap = false;
      return systemSay(session, T.ENTER_FAILED);
    }
    await this.push.initView(cid);
    this.push.broadcastOnline();
    if (this.state.lobby) return systemSay(session, T.LOBBY_WAIT(wbClockLabel(e.fightAt)));
    this.battles.scheduleStart(cid, WB.FIRST_BATTLE_MS);
  }

  /** wbLeaveMap: ignored while in a battle. */
  leaveMap(session: Session): Promise<void> {
    return this.exit.leave(session.characterId!, false);
  }

  /** takeWbAward: grants the pending bags, then leaves like wbLeaveMap; a full bag keeps them and says so. */
  async takeAward(session: Session): Promise<void> {
    const cid = session.characterId!;
    const p = this.state.event.participants.get(cid);
    if (p && p.pending.length > 0) {
      const items = p.pending;
      p.pending = []; // taken out before it is granted: overlapping claims cannot pay twice
      if (!(await this.payout.deliver(session, items))) {
        p.pending = [...items, ...p.pending];
        return systemSay(session, T.BAG_FULL);
      }
    }
    await this.payout.claimOwed(session);
    await this.exit.leave(cid, false);
  }

  setAuto(session: Session, auto: boolean): void {
    const p = this.state.event.participants.get(session.characterId!);
    if (p) p.auto = auto;
  }

}
