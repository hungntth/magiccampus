// Mê Trận fights (events 11-14): a solo PvE battle against N copies of the event's maze creature (1389 / 1390 / 1392, boss 1391) built
// at the player's level (boss +2), tagged with BattleContext source 'maze' (end hook + battlePlayEnd reply live in MazeService).

import { Injectable } from '@nestjs/common';
import type { Session } from '../../gateway/session';
import { CombatService } from '../combat/combat.service';
import { creatureFighter } from '../combat/fighters';
import { LINEUP_SLOTS } from '../combat/npc-battle';
import { GameDataService } from '../gamedata/gamedata.service';

export const MAZE_BATTLE_SOURCE = 'maze';

@Injectable()
export class MazeBattleService {
  constructor(private readonly combat: CombatService, private readonly gameData: GameDataService) {}

  /** Starts the fight; false when it could not start (dead, unknown creature, a concurrent start won). */
  async start(session: Session, event: number, creatureId: number, count: number, level: number): Promise<boolean> {
    const tpl = this.gameData.creature(creatureId);
    if (!tpl) return false;
    const roster = await this.combat.roster(session);
    const st = roster.sts[0];
    if (!st || roster.sessions[0] !== session || st.doc.currentHp <= 0) return false;
    const boss = event === 14 ? 1 : 0;
    const enemies = Array.from({ length: Math.min(count, LINEUP_SLOTS.length) }, (_, i) => creatureFighter(LINEUP_SLOTS[i], tpl, level, boss));
    const pets = await this.combat.loadPets([session.characterId!]);
    const battle = this.combat.startGroup([session], [st], enemies, creatureId, pets, {
      source: MAZE_BATTLE_SOURCE, bossNid: creatureId, key: String(event), floor: event,
    });
    return battle !== null;
  }
}
