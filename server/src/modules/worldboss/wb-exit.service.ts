// World boss exits (Go application/worldboss exit.go + entry.go leave): wbLeaveMap / takeWbAward leave through `leave` (HUD clear,
// back to the return point), any other map change clears the HUD (SceneHooks map-change listener: gates, scrolls, NPC teleports,
// GM moves), a disconnect stores the return position, the evacuation after the claim grace empties the map, the stray sweep sends
// anyone standing on the event map who is not a participant back out. After a finished run, gifts still pending are mailed (M11).

import { Injectable, Logger } from '@nestjs/common';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { SceneTransportService } from '../scene/scene-transport.service';
import { WB } from './wb-config';
import { WbPayoutService } from './wb-payout.service';
import { WbPush } from './wb-push.service';
import { WbState, type ReturnPoint, type WbParticipant } from './wb-state.service';

@Injectable()
export class WbExitService {
  private readonly logger = new Logger(WbExitService.name);

  constructor(
    private readonly state: WbState,
    private readonly push: WbPush,
    private readonly payout: WbPayoutService,
    private readonly scenes: SceneManager,
    private readonly transport: SceneTransportService,
    private readonly characters: CharacterService,
    private readonly gameData: GameDataService,
  ) {}

  /** Saved return point, else the fallback map's safe point (the event map is never a return point). */
  returnPoint(p: WbParticipant | undefined): ReturnPoint {
    const r = p?.ret;
    if (r && r.map > 0 && r.map !== WB.MAP_ID && this.gameData.getMap(r.map)) return r;
    const row = this.gameData.getMap(WB.FALLBACK_MAP);
    return { map: WB.FALLBACK_MAP, x: Number(row?.safe_x ?? 0), y: Number(row?.safe_y ?? 0) };
  }

  /** Pending gifts of a finished run are kept as owed bags (nothing is lost by leaving without claiming). */
  async oweIfOver(p: WbParticipant | undefined): Promise<void> {
    if (!p || this.state.running || p.pending.length === 0) return;
    const items = p.pending;
    p.pending = [];
    await this.payout.owe(p.cid, items, { classRank: p.classRank, worldRank: p.worldRank }, this.state.event.runSeq);
  }

  /** wbLeaveMap / takeWbAward / lobby close / evacuation: ignored while in a battle unless `force`. */
  async leave(cid: number, force = false): Promise<void> {
    const p = this.state.event.participants.get(cid);
    if (p && p.inBattle && !force) return;
    if (p) {
      p.inMap = false;
      p.resultPending = false;
      p.playPending = false;
    }
    await this.oweIfOver(p);
    const session = this.scenes.findByCharacter(cid);
    this.push.broadcastOnline();
    if (!session) return;
    session.callback('onClearWbView', false);
    await this.moveBack(session, this.returnPoint(p));
  }

  private async moveBack(session: Session, to: ReturnPoint): Promise<void> {
    try {
      session.callback('onSceneEnter', await this.transport.moveToMap(session, to.map, to.x, to.y));
    } catch (e) {
      this.logger.warn(`world boss: teleport back of ${session.characterId} failed: ${(e as Error).message}`);
    }
  }

  /** SceneHooks map-change listener: leaving the event map by any other route clears the HUD that would keep ticking. */
  async onMapChanged(session: Session, _from: number, to: number): Promise<void> {
    const cid = session.characterId;
    if (cid === null || to === WB.MAP_ID) return;
    const p = this.state.event.participants.get(cid);
    if (!p || !p.inMap) return;
    p.inMap = false;
    p.resultPending = false;
    p.playPending = false;
    session.callback('onClearWbView', false);
    this.push.broadcastOnline();
    await this.oweIfOver(p);
  }

  /** Disconnect / back to the character list: the DB position becomes the return point (no stray on the event map). */
  async onGone(session: Session): Promise<void> {
    const cid = session.characterId;
    if (cid === null) return;
    const p = this.state.event.participants.get(cid);
    if (!p || !p.inMap) return;
    p.inMap = false;
    p.inBattle = false;
    p.battleId = '';
    p.resultPending = false;
    p.playPending = false;
    const r = this.returnPoint(p);
    await this.characters.updatePosition(cid, r.map, r.x, r.y, 0).catch((e: Error) => this.logger.warn(`world boss: return position of ${cid} failed: ${e.message}`));
    this.push.broadcastOnline();
    await this.oweIfOver(p);
  }

  /** After the claim grace: everyone still on the map keeps their gifts as owed bags and is sent back (stale runs are ignored). */
  async evacuate(runSeq: number): Promise<void> {
    const e = this.state.event;
    if (e.runSeq !== runSeq || this.state.running) return;
    const ids = this.push.inMapIds();
    for (const cid of ids) await this.leave(cid, true);
    if (ids.length > 0) this.logger.log(`world boss: evacuated ${ids.length} player(s) after the claim grace`);
  }

  /** Anyone on the event map who is not an in-map participant (restart mid-event, stray teleport) and not fighting goes back out. */
  async sweepStrays(): Promise<void> {
    for (const s of this.scenes.members(WB.MAP_ID)) {
      const cid = s.characterId;
      if (cid === null || s.battleId !== null || s.copyId !== 0) continue;
      if (this.state.event.participants.get(cid)?.inMap) continue;
      s.callback('onClearWbView', false);
      await this.moveBack(s, this.returnPoint(undefined));
    }
  }
}
