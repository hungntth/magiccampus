// Random encounters (cbom; moved out of CombatService for the line cap): rolled for the party leader or a solo / AFK player on a
// map without safe_flag; the roster is the leader's eligible members, the enemy count follows the roster size. M10: feature
// modules tune the built enemies per map (Mê Huyễn floors: mob life 5000, Go TuneMeHuyenMobs) through addTuner.

import { Injectable } from '@nestjs/common';
import { BATTLE_ENEMY_SLOTS } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { PartyManager } from '../party/party.manager';
import { CharacterStatsService, type CharStats } from '../stats/character-stats.service';
import type { Fighter } from './battle.types';
import { CombatService } from './combat.service';
import { rollEncounter } from './encounter';
import { spawnFighter } from './fighters';
import { selectRoster } from './roster';

/** Edits the built enemies in place (a tuner may replace an entry); `playerLevel` is the initiating player's level. */
export type EncounterTuner = (mapId: number, enemies: Fighter[], playerLevel: number) => void;

@Injectable()
export class EncounterService {
  private readonly tuners: EncounterTuner[] = [];

  constructor(
    private readonly combat: CombatService,
    private readonly scenes: SceneManager,
    private readonly gameData: GameDataService,
    private readonly stats: CharacterStatsService,
    private readonly parties: PartyManager,
  ) {}

  addTuner(fn: EncounterTuner): void {
    this.tuners.push(fn);
  }

  /**
   * cbom(x, y): rolls a random encounter for the session's map; silently does nothing when none starts. Only the party leader
   * (or a solo / AFK player) rolls; a follower's cbom is ignored. The roster is the leader's eligible members.
   */
  async tryRandomEncounter(session: Session): Promise<void> {
    if (session.battleId !== null || Date.now() < session.encounterUntil) return;
    const cid = session.characterId!;
    const party = this.parties.partyOf(cid);
    if (party && party.leaderId !== cid && !party.afk.has(cid)) return;
    const map = this.gameData.getMap(session.mapId);
    if (!map || Number(map.safe_flag ?? 0) > 0) return;
    const lead = party?.leaderId ?? null;
    // The enemy count depends on the roster size, so a first roster (HP unknown) is picked before the encounter roll.
    const pre = selectRoster(cid, session.mapId, this.combat.candidates(session, party, () => 1), lead);
    const rows = rollEncounter(Number(map.basic_battle_rate ?? 0), this.gameData.mapCreatures(session.mapId), this.combat.rng, pre.length);
    if (!rows) return;
    const sts = new Map(await Promise.all(pre.map(async (id): Promise<[number, CharStats]> => [id, await this.stats.compute(id)])));
    const hpOf = (id: number): number => sts.get(id)?.doc.currentHp ?? 0;
    if (hpOf(cid) <= 0) return; // H5: a dead character cannot be attacked
    const roster = selectRoster(cid, session.mapId, this.combat.candidates(session, party, hpOf), lead);
    const sessions = roster.map((id) => this.scenes.findByCharacter(id)).filter((s): s is Session => s !== undefined);
    const mapLevel = Number(map.level) > 0 ? Number(map.level) : Number(map.lv ?? 0);
    const enemies: Fighter[] = [];
    for (const row of rows) {
      const tpl = this.gameData.creature(row.creatureId);
      const slot = BATTLE_ENEMY_SLOTS[enemies.length];
      if (tpl && slot !== undefined) enemies.push(spawnFighter(slot, row, tpl, mapLevel, sts.get(cid)!.doc.level));
    }
    if (enemies.length === 0) return;
    const playerLevel = sts.get(cid)!.doc.level;
    for (const t of this.tuners) t(session.mapId, enemies, playerLevel);
    this.combat.startGroup(sessions, sessions.map((s) => sts.get(s.characterId!)!), enemies, 0, await this.combat.loadPets(roster));
  }
}
