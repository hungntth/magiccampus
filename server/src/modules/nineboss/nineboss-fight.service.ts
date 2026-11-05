// Kiếp Nạn Vô Ưu floor fights (Go handlers/nineboss battle.go + the EndBattle hook): attachThisFloorBoss validates level / floor, expands
// the roster to the leader's party (members kept only when they could be credited for the floor), builds the fixed line-up at the
// highest roster level and starts the battle tagged {source 'nineboss', floor, roundCap 150}. On a real win every non-left character
// is credited; a first kill grants 3627 x 10n + 3677 x n and broadcasts the NOTICE_INFO[57 + n - 1] text with onSystemSay.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BattleResult, NINE_BOSS, NINE_BOSS_NAMES, NINE_BOSS_TEXT, nineFirstKillReward } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { BattleHooks } from '../combat/battle-hooks';
import type { Battle, BattleMember } from '../combat/battle.types';
import { CombatService } from '../combat/combat.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { systemSay } from '../npcscript/menu';
import { GrantService } from '../rewards/grant.service';
import { floorEnemies } from './nineboss-lineup';
import { nineFloor } from './nineboss-config';
import { encounterLevel } from './nineboss-rules';
import { nineGrants, NineBossService } from './nineboss.service';

export const NINE_BOSS_SOURCE = 'nineboss';

@Injectable()
export class NineBossFightService implements OnModuleInit {
  private readonly logger = new Logger(NineBossFightService.name);

  constructor(
    private readonly combat: CombatService,
    private readonly battleHooks: BattleHooks,
    private readonly gameData: GameDataService,
    private readonly scenes: SceneManager,
    private readonly grants: GrantService,
    private readonly nine: NineBossService,
  ) {}

  onModuleInit(): void {
    this.battleHooks.onEnd(NINE_BOSS_SOURCE, (e) => this.onEnd(e.battle, e.result, e.members));
  }

  /** attachThisFloorBoss(floor): every refusal is an onSystemSay (the Flash panel has no error path). */
  async attack(session: Session, floor: number): Promise<void> {
    const cfg = nineFloor(floor);
    if (!cfg) return;
    const cid = session.characterId!;
    const why = await this.nine.attackRefusal(cid, floor);
    if (why) return systemSay(session, why);
    if (session.battleId !== null) return systemSay(session, NINE_BOSS_TEXT.IN_BATTLE);
    const roster = await this.combat.roster(session);
    if (roster.sessions[0] !== session || roster.sts[0].doc.currentHp <= 0) return systemSay(session, NINE_BOSS_TEXT.UNAVAILABLE);
    const sessions = [session];
    const sts = [roster.sts[0]];
    for (let i = 1; i < roster.sessions.length; i++) {
      if ((await this.nine.attackRefusal(roster.sessions[i].characterId!, floor)) === null) {
        sessions.push(roster.sessions[i]);
        sts.push(roster.sts[i]);
      }
    }
    const enemies = floorEnemies(cfg, (id) => this.gameData.creature(id), encounterLevel(sts.map((s) => s.doc.level)));
    if (enemies.length === 0) {
      this.logger.warn(`floor ${floor}: no enemy templates`);
      return systemSay(session, NINE_BOSS_TEXT.UNAVAILABLE);
    }
    const pets = await this.combat.loadPets(sessions.map((s) => s.characterId!));
    const battle = this.combat.startGroup(sessions, sts, enemies, 0, pets, { source: NINE_BOSS_SOURCE, floor, roundCap: NINE_BOSS.ROUND_CAP });
    if (!battle) systemSay(session, NINE_BOSS_TEXT.UNAVAILABLE);
  }

  private async onEnd(battle: Battle, result: number, members: BattleMember[]): Promise<void> {
    const floor = battle.ctx?.floor ?? 0;
    if (result !== BattleResult.WIN || !nineFloor(floor)) return;
    for (const m of members) {
      if (m.left) continue;
      const out = await this.nine.record(m.cid, floor);
      if (!out.credited || !out.firstKill) continue;
      await this.firstKill(m.cid, floor, battle.fighters.get(m.slot)?.name ?? '');
    }
  }

  private async firstKill(cid: number, floor: number, name: string): Promise<void> {
    const session = this.scenes.findByCharacter(cid);
    if (session && !(await this.grants.grant(session, nineGrants(nineFirstKillReward(floor))))) {
      systemSay(session, NINE_BOSS_TEXT.BAG_FULL);
    }
    this.scenes.broadcastAll('onSystemSay', [NINE_BOSS_TEXT.FIRST_KILL(name, NINE_BOSS_NAMES[floor - 1])]);
  }
}
