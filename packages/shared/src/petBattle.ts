// M12 phase F: Khong Gian Dieu Khac (PPVE tower) contracts, the shared pet-script wire shape, the pet battle replay pushes and the
// carve (Khac Van) id math. Legacy: Go application/pet/ppve_*.go, Flash PetPVESystem / PetPVEConfigPanel (PET_PVE_PANEL strings).

import type { BattleStart } from './battle.js';

export const PPVE_MAX_FLOOR = 150;
/** Free tries per day (freeTime) and free KP exchanges per day (awardTime). */
export const PPVE_FREE_CHALLENGES = 3;
export const PPVE_FREE_EXCHANGES = 1;
/** Rank rows of updatePPRankView. */
export const PPVE_RANK_LIMIT = 50;
/** Rounds of a simulated PPVE / arena fight (PET_PVE_PANEL[44]: "chua ha doi thu trong 24 luot"). */
export const PET_SIM_MAX_ROUNDS = 24;
/** Line-up size and its slot positions (pos 1..5 = battle slots 15..19). */
export const PPVE_LINEUP_MAX = 5;
/** Gold of the n-th extra try of the day (goldTime 0, 1, 2+ clamp is a refusal past the third: Go caps at the table). */
export const PPVE_EXTRA_TRY_GOLD = [10, 20, 50] as const;
/** exchangeKPByGold: 25 gold -> 50 KP. */
export const PPVE_KP_GOLD_COST = 25;
export const PPVE_KP_GOLD_YIELD = 50;
/** Free exchange KP when the carve_award row is missing (Go ppveFreeKPAward). */
export const PPVE_FREE_KP_FALLBACK = 50;

/** Result of a PPVE floor (onSendReplayPPVEPanel arg 1, GamePredef BATTLE_WIN / BATTLE_LOSE / BATTLE_NOT_END). */
export const PPVE_RESULT = { WIN: 1, LOSE: 2, NOT_END: -1 } as const;
export type PpveResult = (typeof PPVE_RESULT)[keyof typeof PPVE_RESULT];

/** Delay between onBattleReplay and the one onBattlePlayList (the client first-round START_DELAY is 2 s). */
export const PET_REPLAY_DELAY_MS = 2500;
/** Replays kept per character (in memory). */
export const PET_REPLAY_KEEP = 20;

// --- carve (Khac Van) ---------------------------------------------------------------------------------------------------
export const PPVE_PART_SLOTS = 8;
export const PPVE_PART_ICONS = 6;
export const PPVE_CARVE_MAX_LEVEL = 20;
/** Master level table rows (data_tbl_carve_master 1..48) and the total carve levels needed per master level. */
export const PPVE_MASTER_MAX = 48;
export const PPVE_MASTER_STEP = 20;
/** Best floor needed to open icon 0..5 (client _KPLEVELLIST). */
export const PPVE_ICON_UNLOCK_FLOOR = [0, 20, 40, 60, 80, 100] as const;

/** TBL_CARVE id of part 0..7, icon 0..5 at level 1..20: (part + 1) * 1000 + (icon + 1) * 100 + level. */
export const carveId = (part: number, icon: number, level: number): number => (part + 1) * 1000 + (icon + 1) * 100 + level;
/** Level 0..20 stored in a node id (0 = unopened). */
export const carveLevelOf = (id: number): number => (id > 0 ? id % 100 : 0);

/** Σ(level of every opened node) / 20, capped at 48. `p` is the `s0..s7` map of node ids. */
export function ppveMasterLevel(p: Readonly<Record<string, readonly number[] | undefined>>): number {
  let total = 0;
  for (let part = 0; part < PPVE_PART_SLOTS; part++) {
    for (const id of p[`s${part}`] ?? []) total += carveLevelOf(Number(id));
  }
  return Math.min(PPVE_MASTER_MAX, Math.floor(total / PPVE_MASTER_STEP));
}

/** The panel wants all of s0..s7 with 6 ints each (a missing key shows PET_PVE_PANEL[13]). Persisted state is untouched. */
export function ppvePartsWire(p: Readonly<Record<string, readonly number[] | undefined>>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (let part = 0; part < PPVE_PART_SLOTS; part++) {
    const src = p[`s${part}`] ?? [];
    out[`s${part}`] = Array.from({ length: PPVE_PART_ICONS }, (_, i) => Math.trunc(Number(src[i] ?? 0)) || 0);
  }
  return out;
}

// --- pet script (cmdList) -----------------------------------------------------------------------------------------------
/** One round of a pet AI script: -10 attack / -50 skill; t = 1 random, 2 highest attack, 3 lowest HP, 4 fastest, 5x fixed slot x. */
export interface PPVECmd {
  action: -10 | -50;
  id: number;
  level: number;
  t: number | string;
}
/** Flash cmdList: `{"0".."23": PPVECmd}` (numbers may arrive as strings). */
export type PPVECmdList = Record<string, PPVECmd>;

// --- panel wire --------------------------------------------------------------------------------------------------------
export interface PPVESlot {
  pid: number;
  pos: number;
  cmdList: PPVECmdList;
}
/** Saved config keyed by position "1".."5". */
export type PPVEConfig = Record<string, PPVESlot>;

export interface PPVEKpData {
  ppvefloor: number;
  kp: number;
  freeTime: number;
  goldTime: number;
  goldClgTime: number;
  awardTime: number;
  gold4awardTimeDaily: number;
}

/** ppveData of onUpdatePPVEPanel and the (optional) login `petPVEData`. */
export interface PPVEData {
  p: Record<string, number[]>;
  mlv: number;
  ppveConfig: PPVEConfig;
}

export interface PPVERankRow {
  cid: string;
  name: string;
  classId: string;
  level: number;
  floorNum: number;
}

/** updatePPRankView / the tail of onSendReplayPPVEPanel. */
export interface PPVERank {
  rankList: PPVERankRow[];
  /** 0-based position, -1 when the caller has no cleared floor. */
  myRank: number;
}

/** Persisted state of the feature `pet_pve` (Go PPVEState). */
export interface PPVEState {
  ppvefloor: number;
  todayFloor: number;
  kp: number;
  freeTime: number;
  goldTime: number;
  goldClgTime: number;
  awardTime: number;
  gold4awardTimeDaily: number;
  mlv: number;
  lastResetDay: string;
  lastDailyDay: string;
  p: Record<string, number[]>;
  ppveConfig: PPVEConfig;
}

/** Login field (the client lazy-loads the panel, but the legacy server sends it populated). */
export interface PPVELoginInfo {
  petPVEData: PPVEData;
}

// --- replay -----------------------------------------------------------------------------------------------------------
/** onBattleReplay(start, bid): the onBattleStart-shaped payload of the recorded fight and its replay id. */
export type PetBattleReplayStart = BattleStart;

// --- pet arena (Dau pet, phase G) ---------------------------------------------------------------------------------------
// Legacy: Go application/petarena + handlers/petarena, Flash PetArenaPanel / PetFightConf (PET_ARENA_U strings).

/** Level groups A..F (Flash rid 0..5, PET_ARENA_RANK_U[9..14]); `min` is the displayed lower bound (A starts at 35), the Go grouping is `level >= min`. */
export const PET_ARENA_GROUPS: readonly { rid: number; min: number }[] = [
  { rid: 0, min: 35 }, { rid: 1, min: 75 }, { rid: 2, min: 95 }, { rid: 3, min: 115 }, { rid: 4, min: 135 }, { rid: 5, min: 155 },
];

/** Level group 0..5 of a character level (Go petarena.LevelGroup: everything below 75 is group A). */
export function arenaGroupOf(level: number): number {
  for (let i = PET_ARENA_GROUPS.length - 1; i > 0; i--) if (level >= PET_ARENA_GROUPS[i].min) return PET_ARENA_GROUPS[i].rid;
  return 0;
}

/** Pets that may be registered per group (PET_ARENA_U[42] rule 3: A 2, B 3, C 4, D and above 5). */
export const PET_ARENA_TEAM_MAX: readonly number[] = [2, 3, 4, 5, 5, 5];

/** The arena line-up uses positions 5..9 (config keys "5".."9"); the opposing slot of position p is battle slot p (defender) / p + 10 (attacker). */
export const PET_ARENA_POS_MIN = 5;
export const PET_ARENA_POS_MAX = 9;

/** Saved arena line-up (petArenaTicket arg 2 / onGetPetConf conf1): keyed by position "5".."9". */
export type PetArenaConf = Record<string, PPVESlot>;

/** One row of onGetEnemies; the caller's own row (cid == player.id) also carries the panel header fields. */
export interface PetArenaRow {
  /** "[level]name". */
  name: string;
  tName: string;
  total: number;
  /** "37%" or "0". */
  rate: string;
  cid: number;
  win: number;
  /** 0-based ladder position in the group (the client adds 1). */
  rank: number;
  // self row only
  max?: number;
  /** Last week's 0-based rank, -1 when unranked. */
  lrank?: number;
  pnt?: number;
  today?: number;
  maxCombo?: number;
  rid?: number;
  /** Absolute end time of the challenge cooldown (ms epoch), 0 when none. */
  cd?: number;
}

/** onPetArenaFight / one onGetArenaLog line. Attacker line: guest false + g_cid / g_name / pnt; defender line: guest true + h_cid / h_name / rank. */
export interface PetArenaFightPush {
  guest: boolean;
  g_cid?: number;
  g_name?: string;
  h_cid?: number;
  h_name?: string;
  /** The attacker's outcome: 1 win, 2 loss. */
  result: 1 | 2;
  pnt?: number;
  bid: string;
  /** Defender line only: its new 0-based rank after losing a place. */
  rank?: number;
  today?: number;
  max?: number;
  cd?: number;
  maxCombo?: number;
  enemy?: PetArenaRow[];
}

/** getPetArenaRank / onPetArenaRank: `r` the top 50 of the caller's group, `c` the same names ordered by weekly best win streak. */
export interface PetArenaRankRow { rank: number; name: string; tName: string; level: number; cid: number; pnt: number; win: number; total: number }
export interface PetArenaComboRow { name: string; maxCombo: number; combo: number }
export interface PetArenaRankReply { r: PetArenaRankRow[]; c: PetArenaComboRow[] }

/** getLastPetArenaRank reply: last week's final ladder of every group, keyed "0".."5" (PetArenaPrevRankPanel reads rank / name / tName / level). */
export interface PetArenaPrevRankRow { rank: number; name: string; tName: string; level: number; cid: number }
export type PetArenaPrevRank = Record<string, PetArenaPrevRankRow[]>;

/** War report: data = [type (1 weekly win streak, 2 one-day climb), cid, name, num]. */
export interface PetArenaSysMsg { id: number; data: [number, number, string, number] }

/** addArenaNum push after addPetFightNum. */
export interface PetArenaNumPush { f: boolean; max: number }

/** petFightResult reply / onPetFightResult push (Go battle DTO, trimmed to what H5 keeps in memory). */
export interface PetFightResultReply { bid: string; attackerId: number; defenderId: number; result: 1 | 2; season: number }

/** getPetArenaActivityInfo reply: the activity ladder is hidden until a schedule exists. */
export interface PetArenaActivityInfo { season: number; isActive: boolean }
