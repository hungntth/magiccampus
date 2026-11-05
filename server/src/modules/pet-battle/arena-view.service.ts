// Read side of the pet arena: the onGetEnemies rows (own row first), the group rank panel (onPetArenaRank), last week's ladders
// (getLastPetArenaRank) and the saved line-up (onGetPetConf). Legacy: Go application/petarena service.go GetEnemies / GetArenaRankPayload.

import { Injectable } from '@nestjs/common';
import type { PetArenaConf, PetArenaPrevRank, PetArenaRankReply, PetArenaRow } from '@mc/shared';
import { ARENA_LIST_LIMIT } from '../pet/pet-depth-constants';
import { positionOf } from './arena-ladder';
import { displayTeamName, winRate } from './arena-rules';
import { ArenaStateService, type Ladder, type Member } from './arena-state.service';

const rowOf = (m: Member, rank: number): PetArenaRow => {
  const e = m.entry;
  const total = e.wins + e.losses;
  return { name: `[${m.level}]${m.name}`, tName: displayTeamName(e.teamName, m.name), total, rate: winRate(e.wins, total), cid: e.characterId, win: e.wins, rank };
};

@Injectable()
export class ArenaViewService {
  constructor(private readonly state: ArenaStateService) {}

  /** The panel list: the caller's row (with the header fields) then the top 50 of its group; [] while it has not registered. */
  async enemies(characterId: number): Promise<PetArenaRow[]> {
    const own = await this.state.entryOf(characterId);
    const me = await this.state.character(characterId);
    if (!own || !me) return [];
    const group = await this.state.groupOf(characterId);
    const ladder = await this.state.ladder(group);
    return this.rowsOf(ladder, characterId, { ...own }, me);
  }

  /** Same rows from an already loaded ladder (the fight reply reads it after the swap); `own` is the caller's fresh entry. */
  rowsOf(ladder: Ladder, characterId: number, own: Member['entry'], me: { name: string; level: number }): PetArenaRow[] {
    const top = ladder.order.slice(0, ARENA_LIST_LIMIT);
    const self: PetArenaRow = {
      ...rowOf({ entry: own, name: me.name, level: me.level }, Math.max(0, positionOf(ladder.order, characterId) - 1)),
      max: own.maxFights, lrank: own.lastRank, pnt: own.rating, today: own.usedFights, maxCombo: own.maxCombo, rid: ladder.group,
      cd: own.cooldownEndsAt > this.state.now() ? own.cooldownEndsAt : 0,
    };
    const rows = [self];
    top.forEach((id, i) => {
      const m = ladder.members.get(id);
      if (m && id !== characterId) rows.push(rowOf(m, i));
    });
    return rows;
  }

  /** onPetArenaRank: `r` the group's top 50 by ladder place, `c` the same players by weekly best win streak. */
  async rank(characterId: number): Promise<PetArenaRankReply> {
    const ladder = await this.state.ladder(await this.state.groupOf(characterId));
    const members = ladder.order.slice(0, ARENA_LIST_LIMIT).flatMap((id, i) => {
      const m = ladder.members.get(id);
      return m ? [{ m, i }] : [];
    });
    const r = members.map(({ m, i }) => ({
      rank: i, name: m.name, tName: displayTeamName(m.entry.teamName, m.name), level: m.level, cid: m.entry.characterId, pnt: m.entry.rating,
      win: m.entry.wins, total: m.entry.wins + m.entry.losses,
    }));
    const c = members.map(({ m }) => ({ name: m.name, maxCombo: m.entry.maxCombo, combo: m.entry.maxCombo })).sort((a, b) => b.maxCombo - a.maxCombo);
    return { r, c };
  }

  /** Last week's final ladder of every group that had placed players: `{"0": [{rank, name, tName, level, cid}]}` (rank 0-based). */
  async previousRanks(): Promise<PetArenaPrevRank> {
    const groups = await this.state.previousLadders();
    const out: PetArenaPrevRank = {};
    for (const [group, rows] of groups) {
      out[String(group)] = rows.map((r) => ({ rank: r.entry.ladderRank - 1, name: r.name, tName: displayTeamName(r.entry.teamName, r.name), level: r.level, cid: r.entry.characterId }));
    }
    return out;
  }

  /** onGetPetConf payload: the saved arena line-up, always a map (the client indexes conf1[5..9] without a null check). */
  async conf(characterId: number): Promise<{ conf1: PetArenaConf }> {
    return { conf1: (await this.state.entryOf(characterId))?.conf1 ?? {} };
  }
}
