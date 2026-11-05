// Phụ bản fights (Go handlers/npc dungeon_boss.go + application/dungeon victory.go): the generic click hook for line-up NPCs
// standing on their floor map, the shared fight start (run open, floor reached, not yet beaten; data_tbl_npc_creature line-up at
// the dungeon level; ctx {source 'dungeon', bossNid, key}) used by the per-dungeon spawns, and the end hook: on a real win every
// player-side character with a run gets the NPC beaten ("Đã đánh bại X." / "… Tầng này đã hoàn thành …").

import { Injectable, OnModuleInit } from '@nestjs/common';
import { BattleResult, type DungeonDef } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { BattleHooks } from '../combat/battle-hooks';
import type { Battle, Fighter } from '../combat/battle.types';
import { NpcBattleService } from '../combat/npc-battle.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { npcMsg } from '../npcscript/menu';
import { NpcHookRegistry } from '../npcscript/npc-hooks.registry';
import { DG_TEXT } from './dungeon-entry.hooks';
import { DungeonEvents } from './dungeon-events';
import { dungeonByFighter, reachable } from './dungeon-rules';
import { DungeonStateService } from './dungeon-state.service';
import { DungeonSupport } from './dungeon-support.service';
import { DungeonViewService } from './dungeon-view.service';

export const DUNGEON_SOURCE = 'dungeon';
export const FIGHT_TEXT = {
  BEATEN: (n: string) => `${n} đã bị đánh bại trong lượt phụ bản hôm nay.`,
  NO_LINEUP: (n: string) => `${n} chưa có dữ liệu đội hình chiến đấu.`,
  VICTORY: (n: string) => `Đã đánh bại ${n}.`,
  FLOOR_OPEN: (n: string) => `Đã đánh bại ${n}. Tầng này đã hoàn thành, có thể đến tầng tiếp theo.`,
} as const;

/** Per-fight line-up tuning (Kho Báu kits, Mê Huyễn boss power). */
export type LineupTuner = (enemies: Fighter[], d: DungeonDef) => void;

@Injectable()
export class DungeonFightService implements OnModuleInit {
  private readonly tuners: LineupTuner[] = [];

  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly battleHooks: BattleHooks,
    private readonly npcBattle: NpcBattleService,
    private readonly gameData: GameDataService,
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly views: DungeonViewService,
    private readonly events: DungeonEvents,
  ) {}

  onModuleInit(): void {
    this.hooks.onClick('dungeon-fighter', async (s, npc) => {
      if (npc.instance || !dungeonByFighter(npc.id)) return false;
      if (Number(this.gameData.getNpc(npc.id)?.pos_map_id ?? 0) === s.mapId) await this.fight(s, npc.id);
      return true; // Go: claimed even off its map (nothing happens)
    }, 80);
    this.battleHooks.onEnd(DUNGEON_SOURCE, (e) => this.onEnd(e.battle, e.result, e.members.filter((m) => !m.left).map((m) => m.cid)));
  }

  addTuner(fn: LineupTuner): void {
    this.tuners.push(fn);
  }

  /** Validates and starts the fight against `nid`'s line-up; the refusals are onNpcMsg like Go ValidateFight callers. */
  async fight(session: Session, nid: number, tune?: LineupTuner): Promise<boolean> {
    const ref = dungeonByFighter(nid);
    if (!ref) return false;
    const { d, floor } = ref;
    const cid = session.characterId!;
    const name = this.support.npcName(nid, 'boss');
    const { run, done } = await this.state.view(cid, d);
    if (!run) return refuse(session, nid, DG_TEXT.NO_RUN(d));
    if (reachable(d, run, done) < floor) return refuse(session, nid, DG_TEXT.LOCKED(d));
    if (run.beaten.includes(nid)) return refuse(session, nid, FIGHT_TEXT.BEATEN(name));
    const battle = await this.npcBattle.startNpcFight(session, nid, {
      level: d.level, ctx: { source: DUNGEON_SOURCE, bossNid: nid, floor, key: d.key },
      tune: (enemies) => {
        for (const t of this.tuners) t(enemies, d);
        tune?.(enemies, d);
      },
    });
    if (!battle && (await this.npcBattle.npcLineup(nid, d.level)).length === 0) return refuse(session, nid, FIGHT_TEXT.NO_LINEUP(name));
    return battle !== null;
  }

  private async onEnd(battle: Battle, result: number, cids: number[]): Promise<void> {
    const nid = battle.ctx?.bossNid ?? 0;
    const ref = dungeonByFighter(nid);
    if (!ref || result !== BattleResult.WIN) return;
    const credited: number[] = [];
    const name = this.support.npcName(nid, 'boss');
    for (const cid of cids) {
      const r = await this.state.recordVictory(cid, nid);
      if (!r.credited) continue;
      credited.push(cid);
      this.support.say(cid, r.cleared ? FIGHT_TEXT.FLOOR_OPEN(name) : FIGHT_TEXT.VICTORY(name));
    }
    await this.events.emitVictory({ d: ref.d, npcId: nid, battle, credited, fighters: cids });
    for (const cid of credited) await this.views.pushTo(cid);
  }
}

function refuse(session: Session, nid: number, text: string): false {
  npcMsg(session, nid, text);
  return false;
}
