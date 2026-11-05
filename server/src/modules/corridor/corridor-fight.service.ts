// Hành Lang Vô Tận floor fights (Go handlers/corridor battle.go + the EndBattle corridor hook): "Lại đây! Ta sẽ đá ngươi khỏi đây" resolves
// the floor from the map + saved current floor, checks floor <= cleared + 1, expands the roster to the leader's party (members kept only
// when they could be credited for the floor), builds the fixed 10-enemy line-up at the highest roster level and starts the battle tagged
// {source 'corridor', floor, roundCap 150}. On a real win every non-left character is credited (maxCleared, first kill); a first kill grants
// the floor's gift bag (unpacked, decision 11) and the "Đánh bại X, vượt qua Hành Lang Vô Tận tầng n!" line. A loss or flee changes nothing.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BattleResult, CORRIDOR, corridorFirstKillBag, corridorFloorForMap } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { BattleHooks } from '../combat/battle-hooks';
import type { Battle, BattleMember } from '../combat/battle.types';
import { CombatService } from '../combat/combat.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { npcMsg, systemSay } from '../npcscript/menu';
import { GrantService } from '../rewards/grant.service';
import type { CharStats } from '../stats/character-stats.service';
import { floorLineup } from './corridor-config';
import { floorEnemies } from './corridor-lineup';
import { victoryText } from './corridor-rules';
import { CORRIDOR_TEXT } from './corridor-text';
import { CorridorService } from './corridor.service';

export const CORRIDOR_SOURCE = 'corridor';

@Injectable()
export class CorridorFightService implements OnModuleInit {
  private readonly logger = new Logger(CorridorFightService.name);

  constructor(
    private readonly combat: CombatService,
    private readonly battleHooks: BattleHooks,
    private readonly gameData: GameDataService,
    private readonly scenes: SceneManager,
    private readonly grants: GrantService,
    private readonly corridor: CorridorService,
  ) {}

  onModuleInit(): void {
    this.battleHooks.onEnd(CORRIDOR_SOURCE, (e) => this.onEnd(e.battle, e.result, e.members));
  }

  /** The floor the character stands on (map + saved current floor), 0 off the corridor. */
  async currentFloor(session: Session): Promise<number> {
    return corridorFloorForMap(session.mapId, (await this.corridor.state(session.characterId!)).curFloor);
  }

  /** The leader plus the party members who could be credited for the floor; null when the character cannot lead the fight (dead / not leader). */
  async eligible(session: Session, floor: number): Promise<{ sessions: Session[]; sts: CharStats[] } | null> {
    const roster = await this.combat.roster(session);
    if (roster.sessions[0] !== session || roster.sts[0].doc.currentHp <= 0) return null;
    const sessions = [session];
    const sts = [roster.sts[0]];
    for (let i = 1; i < roster.sessions.length; i++) {
      if ((await this.corridor.floorRefusal(roster.sessions[i].characterId!, floor)) === null) {
        sessions.push(roster.sessions[i]);
        sts.push(roster.sts[i]);
      }
    }
    return { sessions, sts };
  }

  /** hlvt_kick_out_<npc>: every refusal is an onNpcMsg / onSystemSay as Go. */
  async fight(session: Session, npcId: number): Promise<void> {
    const cid = session.characterId!;
    if (session.battleId !== null) return systemSay(session, CORRIDOR_TEXT.IN_BATTLE);
    const floor = await this.currentFloor(session);
    if (floor === 0) return npcMsg(session, npcId, CORRIDOR_TEXT.NOT_IN_CORRIDOR);
    const why = await this.corridor.floorRefusal(cid, floor);
    if (why) return npcMsg(session, npcId, why);
    const team = await this.eligible(session, floor);
    if (!team) return systemSay(session, CORRIDOR_TEXT.FIGHT_FAILED);
    const { sessions, sts } = team;
    const enemies = floorEnemies(floor, (id) => this.gameData.creature(id), Math.max(...sts.map((s) => s.doc.level)));
    if (enemies.length === 0) {
      this.logger.warn(`floor ${floor}: no enemy templates`);
      return systemSay(session, CORRIDOR_TEXT.FIGHT_FAILED);
    }
    const pets = await this.combat.loadPets(sessions.map((s) => s.characterId!));
    const ctx = { source: CORRIDOR_SOURCE, floor, roundCap: CORRIDOR.ROUND_CAP };
    const battle = this.combat.startGroup(sessions, sts, enemies, 0, pets, ctx);
    if (!battle) return systemSay(session, CORRIDOR_TEXT.IN_BATTLE);
    this.logger.log(`character ${cid}: corridor floor ${floor} battle ${battle.id} (${sessions.length} players, level ${enemies[0].level})`);
  }

  private async onEnd(battle: Battle, result: number, members: BattleMember[]): Promise<void> {
    const floor = battle.ctx?.floor ?? 0;
    if (result !== BattleResult.WIN || !floorLineup(floor)) return;
    for (const m of members) {
      if (m.left) continue;
      const out = await this.corridor.record(m.cid, floor);
      if (out.credited && out.firstKill) await this.firstKill(m.cid, floor);
    }
  }

  private async firstKill(cid: number, floor: number): Promise<void> {
    const session = this.scenes.findByCharacter(cid);
    if (!session) return;
    const bag = corridorFirstKillBag(floor);
    if (bag > 0 && !(await this.grants.grant(session, this.grants.unpack(bag, Math.random)))) systemSay(session, CORRIDOR_TEXT.BAG_FULL);
    systemSay(session, victoryText(floor, floorLineup(floor)!.name, bag > 0));
  }
}
