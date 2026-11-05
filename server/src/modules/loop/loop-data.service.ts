// Static loop tables, indexed once on first use: data_tbl_quest_loop (definitions) and the type-7 round pool of every loop
// (`sub_type "7-<lid>"`). H5 keeps only rounds it can play: supported objectives (quest.rules isSupported), every kill creature
// spawns on some map (Go "fightable" rule), except the loop-boss rounds (LOOP_BOSS_QUEST_IDS, fought against a boss NPC).

import { Injectable, Logger } from '@nestjs/common';
import { LOOP_BOSS_QUEST_IDS, loopIdOfSubType } from '@mc/shared';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { isSupported } from '../quest/quest.rules';
import type { LoopDef, RoundCandidate } from './loop-rules';

const num = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

export function toLoopDef(row: Row): LoopDef {
  return {
    id: num(row.id), name: String(row.name ?? ''), nid: num(row.nid), num: num(row.num), refresh: num(row.refresh),
    minLevel: num(row.min_level), maxLevel: num(row.max_level),
  };
}

interface LoopTables {
  defs: Map<number, LoopDef>;
  pools: Map<number, RoundCandidate[]>;
}

@Injectable()
export class LoopDataService {
  private readonly logger = new Logger(LoopDataService.name);
  private tables: Promise<LoopTables> | null = null;

  constructor(private readonly gameData: GameDataService) {}

  private load(): Promise<LoopTables> {
    this.tables ??= this.build();
    return this.tables;
  }

  async def(lid: number): Promise<LoopDef | undefined> {
    return (await this.load()).defs.get(lid);
  }

  async defsByNpc(npcId: number): Promise<LoopDef[]> {
    return [...(await this.load()).defs.values()].filter((d) => d.nid === npcId).sort((a, b) => a.id - b.id);
  }

  /** Playable rounds of a loop (all levels; the level filter happens at pick time). */
  async pool(lid: number): Promise<RoundCandidate[]> {
    return (await this.load()).pools.get(lid) ?? [];
  }

  private async build(): Promise<LoopTables> {
    const [loopRows, spawns] = await Promise.all([
      this.gameData.rows('data_tbl_quest_loop'), this.gameData.rows('data_tbl_map_creature'),
    ]);
    const spawned = new Set(spawns.map((r) => num(r.cid)));
    const boss = new Set(LOOP_BOSS_QUEST_IDS);
    const defs = new Map(loopRows.map((r) => [num(r.id), toLoopDef(r)] as const));
    const pools = new Map<number, RoundCandidate[]>();
    const total = new Map<number, number>();
    for (const row of await this.gameData.rows('data_tbl_quest', { type: 7 })) {
      const lid = loopIdOfSubType(String(row.sub_type ?? ''));
      const tpl = this.gameData.getQuest(num(row.id));
      if (lid <= 0 || !tpl) continue;
      total.set(lid, (total.get(lid) ?? 0) + 1);
      const require = this.gameData.questRequire(tpl.id);
      const fightable = require.every((r) => r.kind !== 2 || spawned.has(r.itemId));
      if (!(fightable || boss.has(tpl.id)) || !isSupported(tpl, require)) continue;
      const list = pools.get(lid) ?? [];
      list.push({ id: tpl.id, minLevel: tpl.minLevel, maxLevel: tpl.maxLevel });
      pools.set(lid, list);
    }
    this.logger.log(`loop pools (playable/total): ${[...total].map(([l, t]) => `${l}:${pools.get(l)?.length ?? 0}/${t}`).join(' ')}`);
    return { defs, pools };
  }
}
