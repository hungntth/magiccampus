// Death and revive (legacy combat/recovery.go + scene/movement.go toSafe), H5 rules: only a dead (HP 0) character outside
// a battle can revive, and only once (conditional write). Free variants only: in place with full HP/MP, or at the map's
// safe point with half HP/MP. Results are pushed as onUPP (+ onSceneEnter for the move).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { ReliveSwitchResult } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { SceneTransportService } from '../scene/scene-transport.service';
import { CharacterStatsService } from '../stats/character-stats.service';

const FALLBACK_SAFE = { x: 100, y: 100 };

@Injectable()
export class ReviveService {
  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly stats: CharacterStatsService,
    private readonly gameData: GameDataService,
    private readonly transport: SceneTransportService,
  ) {}

  /** reliveSwitch(): 2 = show the free revive dialog (dead, not fighting), 0 = nothing to do. */
  async reliveSwitch(session: Session): Promise<ReliveSwitchResult> {
    if (session.battleId !== null) return 0;
    const doc = await this.chars.findById(session.characterId!, { currentHp: 1 }).lean();
    return doc && doc.currentHp <= 0 ? 2 : 0;
  }

  /** freeRelive(1): revive in place with full HP/MP. Returns false when the character is not dead. */
  async reviveHere(session: Session): Promise<boolean> {
    if (session.battleId !== null) return false;
    const st = await this.stats.compute(session.characterId!);
    return this.restore(session, st.maxHp, st.maxMp);
  }

  /** freeRelive(2) / toSafe(): half HP/MP at the map's safe point (same map, scene reloaded via onSceneEnter). */
  async reviveAtSafePoint(session: Session): Promise<boolean> {
    if (session.battleId !== null) return false;
    const st = await this.stats.compute(session.characterId!);
    const ok = await this.restore(session, Math.max(1, Math.floor(st.maxHp / 2)), Math.floor(st.maxMp / 2));
    if (!ok) return false;
    const map = this.gameData.getMap(session.mapId);
    const x = Number(map?.safe_x ?? FALLBACK_SAFE.x) || FALLBACK_SAFE.x;
    const y = Number(map?.safe_y ?? FALLBACK_SAFE.y) || FALLBACK_SAFE.y;
    session.callback('onSceneEnter', await this.transport.moveToMap(session, session.mapId, x, y));
    return true;
  }

  /** Conditional write (only while HP <= 0) then the onUPP push; a second call finds the character alive and does nothing. */
  private async restore(session: Session, hp: number, mp: number): Promise<boolean> {
    const res = await this.chars.updateOne(
      { _id: session.characterId!, currentHp: { $lte: 0 } },
      { $set: { currentHp: hp, currentMp: mp } },
    );
    if (res.modifiedCount !== 1) return false;
    session.callback('onUPP', { currentHp: hp, currentMp: mp });
    return true;
  }
}
