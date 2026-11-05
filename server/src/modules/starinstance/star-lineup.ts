// Palace line-ups of the star instance (Go application/starinstance/lineups.go + handlers/starinstance/battle.go): the zodiac boss row
// (data_tbl_creature 453-464, boss flag 1, centre slot) with its "Thủ Hộ" guard rows (1153-1167, boss flag 2, beside it) at the
// palace's stars-template level. The seed has no per-level line-up, so every level of a palace uses the same units. The zodiac rows
// carry att_energy 9999 (a data sentinel), replaced by att_intelligence. Pure over a creature lookup.

import { WAR_MAP_SIDS } from '@mc/shared';
import type { CreatureTemplate } from '../gamedata/combat-data';
import type { Fighter } from '../combat/battle.types';
import { creatureFighter } from '../combat/fighters';
import { LINEUP_SLOTS } from '../combat/npc-battle';

export interface PalaceLineup {
  boss: number;
  guards: readonly number[];
}

/** Go PalaceLineups, index = sid - 1. Song Tử = 460 (immune to physical) + 1161 (immune to magic); four palaces fight alone. */
export const PALACE_LINEUPS: readonly PalaceLineup[] = [
  { boss: 458, guards: [1156, 1160] },
  { boss: 455, guards: [1159, 1163] },
  { boss: 460, guards: [1161] },
  { boss: 462, guards: [] },
  { boss: 461, guards: [] },
  { boss: 454, guards: [1158, 1162] },
  { boss: 464, guards: [1154, 1165] },
  { boss: 453, guards: [1153, 1166] },
  { boss: 459, guards: [] },
  { boss: 463, guards: [1155, 1167] },
  { boss: 456, guards: [1157, 1164] },
  { boss: 457, guards: [] },
];

const ENERGY_SENTINEL = 9999;
const TAG = /\s*【[^】]*】/g;

/** Go EnemyLevelFallback: used when the stars-template row is missing. */
export const enemyLevelFallback = (level: number): number => 75 + 5 * level;

export const palaceLineup = (sid: number): PalaceLineup | undefined => (sid >= 1 && sid <= WAR_MAP_SIDS ? PALACE_LINEUPS[sid - 1] : undefined);

/** Go palaceTemplate: sentinel energy replaced by intelligence, the 【…】 tag stripped from the name; the cached row is not modified. */
export function palaceTemplate(tpl: CreatureTemplate, id: number): CreatureTemplate {
  const att = tpl.att.eng >= ENERGY_SENTINEL ? { ...tpl.att, eng: tpl.att.int } : tpl.att;
  const clean = tpl.name.replace(TAG, '').trim();
  return { ...tpl, att, name: clean || `BOSS #${id}` };
}

/** The enemy fighters of one palace fight; empty when the boss row is missing (guards that are missing are skipped). */
export function palaceEnemies(sid: number, level: number, lookup: (id: number) => CreatureTemplate | undefined): Fighter[] {
  const lineup = palaceLineup(sid);
  const boss = lineup && lookup(lineup.boss);
  if (!lineup || !boss) return [];
  const lv = Math.max(level, 1);
  const out: Fighter[] = [creatureFighter(LINEUP_SLOTS[0], palaceTemplate(boss, lineup.boss), lv, 1)];
  lineup.guards.forEach((id, i) => {
    const tpl = lookup(id);
    if (tpl && i + 1 < LINEUP_SLOTS.length) out.push(creatureFighter(LINEUP_SLOTS[i + 1], palaceTemplate(tpl, id), lv, 2));
  });
  return out;
}
