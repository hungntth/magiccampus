// hitNpc / clickBoss (M9 phase E, Go combat/battle.go:37-108; clickBoss is bound to the same handler in Go): fight an NPC's
// data_tbl_npc_creature line-up, or one of the map's creatures when the NPC has none. The NPC must stand on the caller's map
// within 300 px; only a party leader (or a solo player) starts it and the eligible party members join. Pushes onBattleStart.
// M10: startNpcFight is the feature entry (dungeon floors, towers): no range check, an optional solo roster, a BattleContext
// and the dungeon level as the line-up level fallback; the boss row takes the centre slot.

import { Injectable } from '@nestjs/common';
import { BATTLE_ENEMY_SLOTS } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { PartyManager } from '../party/party.manager';
import type { Battle, BattleContext, Fighter } from './battle.types';
import { CombatService } from './combat.service';
import { creatureFighter, spawnFighter } from './fighters';
import { LINEUP_SLOTS, lineupExpBase, lineupLevel, orderLineup, toNpcCreatureRow, withinRange } from './npc-battle';

export interface NpcFightOpts {
  group?: boolean; // default true: the eligible party members join
  level?: number; // line-up level fallback (row level -> use_lv -> this -> 10)
  ctx?: BattleContext;
  tune?: (enemies: Fighter[]) => void; // feature kits / stat tuning applied to the built line-up
}

export const NPC_BATTLE_TEXT = {
  NOT_LEADER: 'Đã ở trong nhóm thì cần nghe lời nhóm trưởng!',
  TOO_FAR: 'Khoảng cách quá xa',
  DEAD: 'Bạn đã kiệt sức, hãy hồi sinh trước',
} as const;

@Injectable()
export class NpcBattleService {
  constructor(
    private readonly gameData: GameDataService,
    private readonly combat: CombatService,
    private readonly parties: PartyManager,
  ) {}

  async hit(session: Session, npcId: number): Promise<void> {
    const cid = session.characterId!;
    const npc = this.gameData.getNpc(npcId);
    if (!npc || Number(npc.pos_map_id) !== session.mapId) throw RpcException.notFound('npc');
    const party = this.parties.partyOf(cid);
    if (party && party.leaderId !== cid && !party.afk.has(cid)) throw RpcException.forbidden(NPC_BATTLE_TEXT.NOT_LEADER);
    const { sessions, sts } = await this.combat.roster(session);
    const lead = sts[0];
    if (!lead || sessions[0] !== session) throw RpcException.forbidden(NPC_BATTLE_TEXT.DEAD);
    if (lead.doc.currentHp <= 0) throw RpcException.forbidden(NPC_BATTLE_TEXT.DEAD);
    if (!withinRange(lead.doc.posX, lead.doc.posY, Number(npc.pos_x ?? 0), Number(npc.pos_y ?? 0))) {
      throw RpcException.forbidden(NPC_BATTLE_TEXT.TOO_FAR);
    }
    const enemies = await this.lineup(npcId, session.mapId, lead.doc.level);
    if (enemies.length === 0) throw RpcException.notFound('npc line-up');
    this.combat.startGroup(sessions, sts, enemies, npcId, await this.combat.loadPets(sessions.map((s) => s.characterId!)));
  }

  /**
   * Feature fight against an NPC line-up (callers did their own gating). Null when the caller is dead, the NPC has no line-up
   * ("<tên> chưa có dữ liệu đội hình chiến đấu." is the caller's text) or a concurrent start won.
   */
  async startNpcFight(session: Session, nid: number, opts: NpcFightOpts = {}): Promise<Battle | null> {
    const roster = await this.combat.roster(session);
    const n = opts.group === false ? 1 : roster.sessions.length;
    const sessions = roster.sessions.slice(0, n);
    const sts = roster.sts.slice(0, n);
    const lead = sts[0];
    if (!lead || sessions[0] !== session || lead.doc.currentHp <= 0) return null;
    const enemies = await this.npcLineup(nid, opts.level);
    if (enemies.length === 0) return null;
    opts.tune?.(enemies);
    const pets = await this.combat.loadPets(sessions.map((s) => s.characterId!));
    return this.combat.startGroup(sessions, sts, enemies, nid, pets, opts.ctx);
  }

  /** One fighter per data_tbl_npc_creature row (overlays included), the boss row (flag 1) in the centre, then row id order. */
  async npcLineup(nid: number, fallbackLevel?: number): Promise<Fighter[]> {
    const enemies: Fighter[] = [];
    for (const row of orderLineup([...(await this.gameData.npcCreatures(nid))].sort((a, b) => Number(a.id) - Number(b.id)).map(toNpcCreatureRow))) {
      const tpl = this.gameData.creature(row.creatureId);
      const slot = LINEUP_SLOTS[enemies.length];
      if (!tpl || slot === undefined) continue;
      enemies.push(creatureFighter(slot, tpl, lineupLevel(row.level, tpl.useLevel, fallbackLevel), row.bossFlag, lineupExpBase(row)));
    }
    return enemies;
  }

  private async lineup(npcId: number, mapId: number, playerLevel: number): Promise<Fighter[]> {
    const enemies = await this.npcLineup(npcId);
    if (enemies.length > 0) return enemies;
    const spawn = this.gameData.mapCreatures(mapId)[0]; // Go: a single map creature when the NPC has no line-up
    const tpl = spawn && this.gameData.creature(spawn.creatureId);
    const map = this.gameData.getMap(mapId);
    const mapLevel = Number(map?.level) > 0 ? Number(map?.level) : Number(map?.lv ?? 0);
    return spawn && tpl ? [spawnFighter(BATTLE_ENEMY_SLOTS[0], spawn, tpl, mapLevel, playerLevel)] : [];
  }
}
