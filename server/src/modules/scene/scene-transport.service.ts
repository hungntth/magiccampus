// Moves a session to another map: leaves the current room, persists the arrival position, joins the destination room
// and builds the SceneLoginResponse (= onSceneEnter payload). Shared by gates (sceneChange), /go and transport NPCs.

import { Injectable } from '@nestjs/common';
import type { SceneLoginResponse } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { SceneManager } from '../../gateway/scene.manager';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';

@Injectable()
export class SceneTransportService {
  constructor(
    private readonly scenes: SceneManager,
    private readonly characters: CharacterService,
    private readonly gameData: GameDataService,
  ) {}

  /** Caller must have checked that `mapId` exists. */
  async moveToMap(session: Session, mapId: number, x: number, y: number): Promise<SceneLoginResponse> {
    if (session.mapId) this.scenes.broadcast(session.mapId, 'onScenePlayerLeft', [session.characterId], session);
    await this.characters.updatePosition(session.characterId!, mapId, x, y, 0);
    return this.enterScene(session, mapId, x, y, 0);
  }

  async enterScene(session: Session, mapId: number, x: number, y: number, dir: number): Promise<SceneLoginResponse> {
    const mapRow = this.gameData.getMap(mapId)!;
    this.scenes.join(session, mapId);
    const doc = await this.characters.getById(session.characterId!);
    doc.mapId = mapId;
    doc.posX = x;
    doc.posY = y;
    doc.dir = dir;
    const self = this.characters.toSceneCharacter(doc);
    this.scenes.broadcast(mapId, 'onScenePlayerEntered', [self], session);
    return { mapId, map: this.gameData.toMapInfo(mapRow), self };
  }
}
