// Moves a session to another map: leaves the current room, persists the arrival position, joins the destination room
// and builds the SceneLoginResponse (= onSceneEnter payload). Shared by gates (sceneChange), /go and transport NPCs.
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

  async enterScene(session: Session, mapId: number, x: number, y: number, dir: number): Promise<SceneLoginResponse> {
    const mapRow = this.gameData.getMap(mapId)!;
    this.trades.stopFor(session.characterId!, true); // a trade does not survive a map change
    this.scenes.join(session, mapId);
    const doc = await this.characters.getById(session.characterId!);
    doc.mapId = mapId;
    doc.posX = x;
    doc.posY = y;
    doc.dir = dir;
    const self = await this.vip.decorate(await this.petFollow.decorate(this.party.decorate(this.characters.toSceneCharacter(doc))));
    this.scenes.broadcast(mapId, 'onScenePlayerEntered', [self], session);
    return { mapId, map: this.gameData.toMapInfo(mapRow), self };
  }
}
