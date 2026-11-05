// NpcEnv over the static tables (M10 E2.0): TBL_SKILL rows (+ TBL_BUFF) as runtime NpcSkill, built lazily and cached,
// and the data_tbl_creature_skill default pools. Every creature with skill rows casts in every battle (decision 13).

import { Injectable } from '@nestjs/common';
import { GameDataService } from '../gamedata/gamedata.service';
import type { NpcEnv } from './mechanics/npc-ai';
import { buildNpcSkill, type NpcSkill } from './mechanics/npc-skills';

@Injectable()
export class NpcSkillCatalog implements NpcEnv {
  private readonly cache = new Map<number, NpcSkill | null>();

  constructor(private readonly gameData: GameDataService) {}

  skill(id: number): NpcSkill | undefined {
    let sk = this.cache.get(id);
    if (sk === undefined) {
      const tpl = this.gameData.skill(id);
      sk = tpl ? buildNpcSkill(tpl, (b) => this.gameData.getBuff(b)) : null;
      this.cache.set(id, sk);
    }
    return sk ?? undefined;
  }

  creaturePool(cid: number): readonly number[] {
    return this.gameData.creatureSkillIds(cid);
  }
}
