// M10 phụ bản (dungeon) contracts: static definitions shared by the hub panel and the server (Go application/dungeon defs.go +
// RunRules), the H5 hub helper getFbInfo() -> FbInfo[] and the H5 run strip push onDungeonRun(DungeonRunView | null).
// Scripted menus reuse npcScript.ts (onList / npcScript funcs `dg_mh_<npc>_<diff>`, `dg_enter_<npc>_<floor>_<map>`, `dg_next_<npc>`).

/** One floor: its map(s), the NPCs that must be beaten / marked, extra once-per-run fights and the floor quest (0 = none). */
export interface DungeonFloorDef {
  maps: readonly number[];
  mapNames?: readonly string[];
  bosses: readonly number[];
  extra: readonly number[];
  steps: readonly number[];
  quest: number;
}

export interface DungeonDifficulty {
  level: number;
  name: string;
  chestPlan: string;
  expPerLevel: number;
}

/** Go RunRules (single process: no channel lock). */
export interface DungeonRules {
  durationMin: number;
  ejectMap: number;
  ejectName: string;
  minGroup: number;
  singleEntry: boolean;
  leaderQuests: boolean;
  warnMinutes: readonly number[];
  difficulties: readonly DungeonDifficulty[];
  landX?: number;
  landY?: number;
  finalBoss?: number; // a credited win over it starts the daily lock (last floor without a quest)
  finishOnChest?: boolean;
}

export interface DungeonChestDef {
  npc: number;
  map: number;
  x: number;
  y: number;
  plan: string;
}

export interface DungeonDef {
  key: string;
  name: string;
  level: number;
  openQuest: number;
  ticket: number;
  ticketName: string;
  exitMap: number;
  entrances: readonly number[];
  floors: readonly DungeonFloorDef[];
  floorNpcs: Readonly<Record<number, number>>; // in-map NPC -> floor index
  chest?: DungeonChestDef;
  rules: DungeonRules;
  autoTaskIds: readonly number[];
  /** Ported and playable (phase B: quyhutmau, mehuyen, khobau, khobau_event). */
  enabled: boolean;
}

/** NPC 200 Sứ Giả Mở Phụ Bản (map 31) hands out the opener quests. */
export const DUNGEON_OPENER_NPC = 200;
export const DUNGEON_OPENER_MAP = 31;

/** Run state of one dungeon for the hub: none today, open, closed (left / expired) or quick-completed. */
export type FbRunState = 'none' | 'open' | 'closed' | 'auto';

/** getFbInfo() row (H5 helper for the "Phó bản" hub; Flash GameIntroPanel read static XML). */
export interface FbInfo {
  key: string;
  tickets: number; // carried tickets
  run: FbRunState;
  reached: number; // highest reachable floor index, -1 without a run
  lockedUntil: number; // epoch ms of the next 00:00 after today's clear, 0 = not locked
  cleared: boolean; // ever cleared (quick complete gate)
  deadline: number; // run deadline epoch ms, 0 without an open run
  entrance: string; // entrance NPC name(s), " / " joined (the client has no NPC table)
}

/** onDungeonRun(view | null): the run strip while the character stands on a ruled floor; null clears it. */
export interface DungeonRunView {
  key: string;
  name: string;
  floor: number; // 0-based
  floors: number;
  deadline: number; // epoch ms
  difficulty: string;
  pending: string; // "đánh bại …; hoàn thành nhiệm vụ […]", '' when the floor is cleared
}

/** Go dungeon_mehuyen_entry.go formatWait: "X giờ Y phút" / "N phút" / "ít phút". */
export function formatWait(ms: number): string {
  const mins = Math.round(ms / 60_000); // Go rounds the wait to the minute first
  if (mins <= 0) return 'ít phút';
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (hours > 0) return `${hours} giờ ${rest} phút`;
  return `${Math.max(rest, 1)} phút`;
}
