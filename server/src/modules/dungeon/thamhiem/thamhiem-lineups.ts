// Thám Hiểm Di Tích line-ups of the floor-6 Vệ Sĩ TM spots and the floor-7 final bosses, plus the chest rewards (Go
// thamhiem_lineups.go, thamhiem_run.go ThamHiemChestRewards): the spots field five Vệ Sĩ TM 2216-2220 and that spot's catchable
// pet (spot 9225201 guards only); the bosses field 10 units with 200k HP minions and 500k HP bosses. Go-side tables, they
// replace the seeded rows of the same nids. Pure.

import { pickDistinct, type CompletionEntry } from '../completion-reward';
import { isThPet, TH, TH_PETS, TH_FINAL_BOSSES } from './thamhiem-layout';

export const TH_MINION_HP = 200_000;
export const TH_BOSS_HP = 500_000;

export interface ThUnit {
  creature: number;
  level: number;
  bossFlag: number;
  exp: number;
  hp: number; // 0 = the level stats
}

const GUARD_ESCORT: readonly ThUnit[] = [2216, 2217, 2218, 2219].map((creature) => ({ creature, level: 52, bossFlag: 2, exp: 1500, hp: 0 }));

function petLineup(creature: number): ThUnit[] {
  const out: ThUnit[] = [{ creature: 2220, level: 54, bossFlag: 1, exp: 4000, hp: 0 }, ...GUARD_ESCORT];
  if (creature > 0) out.push({ creature, level: 52, bossFlag: 0, exp: 3000, hp: 0 }); // boss_flag 0 = catchable
  return out;
}

const minions = (n: number, creature: number, level: number, exp: number): ThUnit[] =>
  Array.from({ length: n }, () => ({ creature, level, bossFlag: 2, exp, hp: TH_MINION_HP }));

const bossLineup = (creature: number, level: number, exp: number, ...groups: ThUnit[][]): ThUnit[] =>
  [{ creature, level, bossFlag: 1, exp, hp: TH_BOSS_HP }, ...groups.flat()];

const BOSS_LINEUPS: Readonly<Record<number, readonly ThUnit[]>> = {
  [TH.FLAME_CHIEF]: bossLineup(2203, 58, 8000, minions(2, 2204, 56, 2000), minions(2, 2205, 56, 2000), minions(2, 2207, 56, 2000), minions(3, 2208, 55, 1500)),
  [TH.FLAME_DEMON]: bossLineup(2209, 60, 10000, minions(2, 2210, 58, 2500), minions(3, 2211, 56, 2000), minions(4, 2212, 55, 1500)),
};

/** Go ThamHiemLineup: a fresh copy of the Go-side line-up of a spot / final boss, null for every other NPC (seeded rows). */
export function thLineup(npc: number): ThUnit[] | null {
  if (isThPet(npc)) return petLineup(TH_PETS.find((p) => p.id === npc)!.creature);
  const l = BOSS_LINEUPS[npc];
  return l ? l.map((u) => ({ ...u })) : null;
}

export const isThFinalBoss = (npc: number): boolean => TH_FINAL_BOSSES.includes(npc);

// -- chest -----------------------------------------------------------------------------------------------------------------

const MATERIALS: readonly CompletionEntry[] = [
  { kind: 'item', id: 21, grade: 5, count: 1, name: 'Gỗ Tốt' },
  { kind: 'item', id: 23, grade: 5, count: 1, name: 'Pha Lê' },
  { kind: 'item', id: 24, grade: 5, count: 1, name: 'Kim Loại Hiếm' },
  { kind: 'item', id: 26, grade: 5, count: 1, name: 'Gấm Vóc' },
  { kind: 'item', id: 28, grade: 5, count: 1, name: 'Da Thú' },
];
/** Green (Liệt Văn) resistance gems. */
export const TH_GREEN_GEMS: readonly number[] = [74, 75, 76, 77, 79, 2253];
/** Túi Quà Thần Khí Phụ Trắng / Lục / Lam at 50 / 40 / 10 %. */
const SUB_BAGS: readonly { id: number; weight: number }[] = [{ id: 4905, weight: 50 }, { id: 4906, weight: 40 }, { id: 4907, weight: 10 }];

/**
 * The owner's mandatory chest list on top of the shared pool (Go ThamHiemChestRewards): Bụi Ấn Thạch 30, Bụi Ảo Năng 20, Dũng Khí
 * Thạch 10, Ý Chí Thạch 4, two different grade-5 materials, one green resistance gem, one sub-bag, one random relic; the first
 * clear adds the explorer bag 6117. `intn(k)` is an integer in [0, k).
 */
export function thChestRewards(intn: (k: number) => number, firstClear = false): CompletionEntry[] {
  const out: CompletionEntry[] = [
    { kind: 'currency', key: 'stoneSealPoint', count: 30, name: 'Bụi Ấn Thạch' },
    { kind: 'currency', key: 'magiccystalrec', count: 20, name: 'Bụi Ảo Năng' },
    { kind: 'currency', key: 'warSprite', count: 10, name: 'Dũng Khí Thạch' },
    { kind: 'currency', key: 'battleSprite', count: 4, name: 'Ý Chí Thạch' },
  ];
  for (const i of pickDistinct(MATERIALS.length, 2, intn)) out.push(MATERIALS[i]);
  out.push({ kind: 'item', id: TH_GREEN_GEMS[intn(TH_GREEN_GEMS.length)], grade: 0, count: 1, name: 'Đá Kháng Liệt Văn' });
  let roll = intn(100);
  for (const b of SUB_BAGS) {
    if (roll < b.weight) {
      out.push({ kind: 'item', id: b.id, grade: 0, count: 1, name: 'Túi Quà Thần Khí Phụ' });
      break;
    }
    roll -= b.weight;
  }
  out.push({ kind: 'item', id: TH.RELIC_FIRST + intn(TH.RELIC_LAST - TH.RELIC_FIRST + 1), grade: 0, count: 1, name: 'Cổ vật' });
  if (firstClear) out.push({ kind: 'item', id: TH.FIRST_CLEAR_BAG, grade: 0, count: 1, name: 'Túi Phần Thưởng Người Mạo Hiểm' });
  return out;
}
