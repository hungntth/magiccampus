// Moves a session to another map: leaves the current room, persists the arrival position, joins the destination room
// and builds the SceneLoginResponse (= onSceneEnter payload). Shared by gates (sceneChange), /go and transport NPCs.
// M10: map-change listeners (SceneHooks) run right after the reply is sent.
// Scene payloads carry the following pet (showPetObj). A party leader's move takes the non-AFK, non-fighting members standing with it along (each gets its own onSceneEnter).

import { Injectable } from '@nestjs/common';
import type { SceneLoginResponse } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { SceneManager } from '../../gateway/scene.manager';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { PartyService } from '../party/party.service';
import { PetFollowService } from '../pet/pet-follow.service';
import { TradeService } from '../trade/trade.service';
import { PmStateService } from '../vip/pm-state.service';
import { AppearanceService } from '../appearance/appearance.service';
import { SceneHooks } from './scene-hooks.service';

@Injectable()
export class SceneTransportService {
  constructor(
    private readonly scenes: SceneManager,
    private readonly characters: CharacterService,
    private readonly gameData: GameDataService,
    private readonly party: PartyService,
    private readonly trades: TradeService,
    private readonly petFollow: PetFollowService,
    private readonly vip: PmStateService,
    private readonly hooks: SceneHooks,
    private readonly appearance: AppearanceService,
  ) {}

  /** Caller must have checked that `mapId` exists. `follow` is false for the follower hops themselves. */
  async moveToMap(session: Session, mapId: number, x: number, y: number, follow = true): Promise<SceneLoginResponse> {
    const followers = follow ? this.party.followersOn(session) : [];
    if (session.mapId) this.scenes.broadcast(session.mapId, 'onScenePlayerLeft', [session.characterId], session);
    await this.characters.updatePosition(session.characterId!, mapId, x, y, 0);
    const resp = await this.enterScene(session, mapId, x, y, 0);
    for (const f of followers) {
      if (f.battleId !== null) continue; // a battle may have started while the leader was moving
      f.callback('onSceneEnter', await this.moveToMap(f, mapId, x, y, false));
    }
    await this.party.refreshOf(session.characterId!); // member map ids changed (no-op without a party)
    return resp;
  }

  /**
   * Go FollowLeaderOnMap: after the leader moved to (x, y) inside its map, the non-AFK, non-fighting members standing on that
   * map follow (same sequence as a map change: leave broadcast, position write, re-join, own onSceneEnter). Returns their ids.
   */
  async followLeaderOnMap(leader: Session, x: number, y: number): Promise<number[]> {
    const moved: number[] = [];
    for (const f of this.party.followersOn(leader)) {
      if (f.battleId !== null) continue;
      f.callback('onSceneEnter', await this.moveToMap(f, leader.mapId, x, y, false));
      moved.push(f.characterId!);
    }
    if (moved.length > 0) await this.party.refreshOf(leader.characterId!);
    return moved;
  }

  /**
   * M10 maze: joins the character's own copy room (key `copyId`) on template map `mapId` at (x, y). The position is NOT persisted
   * (Go UpdatePosition drops copy-map writes), so a relog lands at the return point. Re-entering the same copy is the room reload.
   */
  async enterCopy(session: Session, mapId: number, copyId: number, x: number, y: number): Promise<SceneLoginResponse> {
    const mapRow = this.gameData.getMap(mapId)!;
    const fromMap = session.mapId;
    if (session.mapId && session.copyId === 0) this.scenes.broadcast(session.mapId, 'onScenePlayerLeft', [session.characterId], session);
    this.scenes.join(session, mapId, copyId);
    setImmediate(() => void this.hooks.mapChanged(session, fromMap, mapId));
    const doc = await this.characters.getById(session.characterId!);
    const self = await this.appearance.decorate(await this.vip.decorate(await this.petFollow.decorate(this.party.decorate({ ...this.characters.toSceneCharacter(doc), posX: x, posY: y }))), mapId);
    return { mapId, map: this.gameData.toMapInfo(mapRow), self };
  }

  async enterScene(session: Session, mapId: number, x: number, y: number, dir: number): Promise<SceneLoginResponse> {
    const mapRow = this.gameData.getMap(mapId)!;
    this.trades.stopFor(session.characterId!, true); // a trade does not survive a map change
    const fromMap = session.mapId;
    this.scenes.join(session, mapId);
    setImmediate(() => void this.hooks.mapChanged(session, fromMap, mapId)); // after the caller has sent onSceneEnter / the reply
    const doc = await this.characters.getById(session.characterId!);
    doc.mapId = mapId;
    doc.posX = x;
    doc.posY = y;
    doc.dir = dir;
    const self = await this.appearance.decorate(await this.vip.decorate(await this.petFollow.decorate(this.party.decorate(this.characters.toSceneCharacter(doc)))), mapId);
    this.scenes.broadcast(mapId, 'onScenePlayerEntered', [self], session);
    return { mapId, map: this.gameData.toMapInfo(mapRow), self };
  }
}
