// Mê Huyễn Động layout and tuning (Go application/dungeon mehuyen_defs.go / mehuyen_tuning.go, handlers/npc
// dungeon_mehuyen_floor.go): the four boss spawns, the twelve Hoa Vong Hồn nodes, their visibility rules, the boss power
// tuning (attack 35 %, life / defence 45 %, fixed lives 1,000,000 / 550,000 at lv 50 growing with the level) and the floor
// mob life (5000 on 2003 / 2004). Pure.

import type { Fighter } from '../../combat/battle.types';

export const MH = {
  KEY: 'mehuyen',
  WRAITH: 1619,
  GUARD_A: 1621,
  GUARD_B: 1622,
  FLOWER_NPC: 1623,
  FINAL_BOSS: 1624,
  FLOWER_ITEM: 3020,
  FLOWER_NEED: 20,
  CURE_QUEST: 5242,
  CURSE_RES: '2060100100019',
  CURSE_BUFF: 91619,
  CURSE_DELAY_MS: 4000,
  MOB_LIFE: 5000,
  GUARD_CREATURE: 1008,
  FINAL_CREATURE: 1006,
  FINAL_LIFE: 1_000_000,
  GUARD_LIFE: 550_000,
  POWER_PERCENT: 45,
  ATTACK_PERCENT: 35,
  LIFE_BASE_LEVEL: 50,
  FLOOR_MAPS: [2003, 2004] as readonly number[],
} as const;

export interface MhSpawn { id: number; nid: number; map: number; x: number; y: number }

export const MH_BOSSES: readonly MhSpawn[] = [
  { id: MH.WRAITH, nid: MH.WRAITH, map: 2003, x: 1400, y: 1000 },
  { id: MH.GUARD_A, nid: MH.GUARD_A, map: 2004, x: 490, y: 420 },
  { id: MH.GUARD_B, nid: MH.GUARD_B, map: 2004, x: 2300, y: 1790 },
  { id: MH.FINAL_BOSS, nid: MH.FINAL_BOSS, map: 2004, x: 2420, y: 300 },
];

const FLOWER_POINTS: readonly [number, number][] = [
  [400, 500], [560, 400], [520, 520], [430, 380], [600, 480], [440, 450],
  [2200, 1800], [2380, 1700], [2250, 1680], [2420, 1820], [2330, 1880], [2350, 1710],
];
export const MH_FLOWERS: readonly MhSpawn[] = FLOWER_POINTS.map(([x, y], i) => ({ id: 1623001 + i, nid: MH.FLOWER_NPC, map: 2004, x, y }));

export interface MhView {
  active: boolean; // today's run, not closed
  beaten: readonly number[];
  marks: readonly number[];
  cured: boolean; // 5242 done or credited
}

export const mhGuarded = (v: MhView): boolean => !v.beaten.includes(MH.GUARD_A) || !v.beaten.includes(MH.GUARD_B);

export function mhBossVisible(v: MhView, id: number): boolean {
  return v.active && !v.beaten.includes(id) && (id !== MH.FINAL_BOSS || v.cured);
}

export function mhFlowerVisible(v: MhView, id: number): boolean {
  return v.active && !mhGuarded(v) && !v.cured && !v.marks.includes(id);
}

const pct = (v: number, p: number): number => (v <= 0 ? v : Math.max(1, Math.floor((v * p) / 100)));
const levelLife = (base: number, level: number): number => (level <= MH.LIFE_BASE_LEVEL ? base : Math.floor((base * level) / MH.LIFE_BASE_LEVEL));

/** Go TuneMeHuyenLineup: the guards' 1008 only; every unit of the final fight. */
export function tuneMeHuyenLineup(npcId: number, enemies: Fighter[]): void {
  for (const f of enemies) {
    const guard = (npcId === MH.GUARD_A || npcId === MH.GUARD_B) && f.refId === MH.GUARD_CREATURE;
    if (npcId !== MH.FINAL_BOSS && !guard) continue;
    f.hpMax = pct(f.hpMax, MH.POWER_PERCENT);
    f.attack = pct(f.attack, MH.ATTACK_PERCENT);
    f.magicAttack = pct(f.magicAttack, MH.ATTACK_PERCENT);
    f.defense = pct(f.defense, MH.POWER_PERCENT);
    f.magicDefense = pct(f.magicDefense, MH.POWER_PERCENT);
    if (f.refId === MH.FINAL_CREATURE) f.hpMax = levelLife(MH.FINAL_LIFE, f.level);
    if (f.refId === MH.GUARD_CREATURE) f.hpMax = levelLife(MH.GUARD_LIFE, f.level);
    f.hp = f.hpMax;
  }
}

/** Go TuneMeHuyenMobs: random-encounter mobs (non-boss rows) on the floor maps fight with 5000 life. */
export function tuneMeHuyenMobs(mapId: number, enemies: Fighter[]): void {
  if (!MH.FLOOR_MAPS.includes(mapId)) return;
  for (const f of enemies) {
    if (f.bossFlag !== 0) continue;
    f.hpMax = MH.MOB_LIFE;
    f.hp = MH.MOB_LIFE;
  }
}
