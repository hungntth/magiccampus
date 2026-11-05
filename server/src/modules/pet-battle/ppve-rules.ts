// Pure PPVE (Khong Gian Dieu Khac) rules: the persisted state (defaults, normalisation, the two daily markers), the line-up config
// (shape validation, cmdList parsing into pet scripts), the extra-try and exchange prices and the Khac Van level-up plan. No Mongo.
// Legacy: Go application/pet/ppve_service.go, ppve_panel.go, ppve_levelup.go, ppve_fight.go.

import {
  carveId, carveLevelOf, PPVE_CARVE_MAX_LEVEL, PPVE_EXTRA_TRY_GOLD, PPVE_FREE_CHALLENGES, PPVE_FREE_EXCHANGES, PPVE_FREE_KP_FALLBACK,
  PPVE_ICON_UNLOCK_FLOOR, PPVE_LINEUP_MAX, PPVE_MAX_FLOOR, PPVE_PART_ICONS, PPVE_PART_SLOTS, ppveMasterLevel, ppvePartsWire,
  type PPVECmd, type PPVECmdList, type PPVEConfig, type PPVEData, type PPVEKpData, type PPVESlot, type PPVEState,
} from '@mc/shared';
import type { CarveAwardRow, CarveRow } from '../gamedata/ppve-data';
import type { PetScript } from './pet-script';

export const PPVE_FEATURE = 'pet_pve';

/** Refusal notes (Go ppveDenialNote / ppveCarveDenialNote / panel notes). */
export const PPVE_TEXT = {
  noTries: 'Đã hết lượt khiêu chiến hôm nay',
  maxFloor: 'Đã vượt qua tầng cao nhất',
  noPets: 'Hãy thiết lập pet thi đấu trước khi khiêu chiến',
  noGold: 'Không đủ vàng',
  noFreeExchange: 'Đã hết lượt đổi miễn phí',
  carveInvalid: 'Dữ liệu Khắc Văn không hợp lệ',
  carveLocked: 'Khắc Văn chưa mở khóa',
  carveMax: 'Khắc Văn đã đạt cấp tối đa',
  carveNoKp: 'Không đủ Văn Chỉ',
  replayGone: 'Trận đấu đã hết hạn, không thể xem lại',
  configCount: 'Tối đa được chọn 5 pet',
  configSameTemplate: 'Chỉ được chọn 1 pet cùng loại',
  configNotOwned: 'Không tìm thấy pet',
  configNotBound: 'Pet chiến đấu phải là pet khóa',
  kpGained: (n: number): string => `Nhận được ${n} Văn Chỉ`,
  carveLevelUp: (level: number, cost: number): string => `Khắc Văn thăng lên Lv.${level}, tiêu hao ${cost} Văn Chỉ`,
  masterUp: (level: number): string => `. Cấp điêu khắc đạt ${level}`,
} as const;

const int = (v: unknown, d = 0): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : d;
};

// --- state ----------------------------------------------------------------------------------------------------------------
export function defaultPpve(): PPVEState {
  return {
    ppvefloor: 0, todayFloor: -1, kp: 0, freeTime: PPVE_FREE_CHALLENGES, goldTime: 0, goldClgTime: 0, awardTime: PPVE_FREE_EXCHANGES,
    gold4awardTimeDaily: 0, mlv: 0, lastResetDay: '', lastDailyDay: '', p: {}, ppveConfig: {},
  };
}

function cleanParts(raw: unknown): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!/^s[0-7]$/.test(key) || !Array.isArray(value)) continue;
    out[key] = Array.from({ length: PPVE_PART_ICONS }, (_, i) => Math.max(0, int(value[i])));
  }
  return out;
}

/** Reads a stored document (missing / wrong-typed fields fall back to the defaults, like Go decodePPVEState). */
export function normalizePpve(raw: Record<string, unknown> | undefined): PPVEState {
  const d = defaultPpve();
  if (!raw) return d;
  return {
    ppvefloor: Math.max(0, int(raw.ppvefloor, d.ppvefloor)),
    todayFloor: int(raw.todayFloor, d.todayFloor),
    kp: Math.max(0, int(raw.kp, d.kp)),
    freeTime: Math.max(0, int(raw.freeTime, d.freeTime)),
    goldTime: Math.max(0, int(raw.goldTime, d.goldTime)),
    goldClgTime: Math.max(0, int(raw.goldClgTime, d.goldClgTime)),
    awardTime: Math.max(0, int(raw.awardTime, d.awardTime)),
    gold4awardTimeDaily: Math.max(0, int(raw.gold4awardTimeDaily, d.gold4awardTimeDaily)),
    mlv: Math.max(0, int(raw.mlv, d.mlv)),
    lastResetDay: typeof raw.lastResetDay === 'string' ? raw.lastResetDay : '',
    lastDailyDay: typeof raw.lastDailyDay === 'string' ? raw.lastDailyDay : '',
    p: cleanParts(raw.p),
    ppveConfig: normalizeConfig(raw.ppveConfig),
  };
}

/**
 * The two independent daily markers (Go applyPPVEDailyReset): `lastResetDay` resets the free tries and today's floor, `lastDailyDay` the
 * gold counters and the free exchange, so a reset lands whichever path runs first on a new day. Mutates; true when something changed.
 */
export function applyDailyReset(state: PPVEState, today: string): boolean {
  let changed = false;
  if (state.lastResetDay !== today) {
    state.freeTime = PPVE_FREE_CHALLENGES;
    state.todayFloor = -1;
    state.lastResetDay = today;
    changed = true;
  }
  if (state.lastDailyDay !== today) {
    state.goldTime = 0;
    state.goldClgTime = 0;
    state.awardTime = PPVE_FREE_EXCHANGES;
    state.gold4awardTimeDaily = 0;
    state.lastDailyDay = today;
    changed = true;
  }
  return changed;
}

export const kpDataOf = (s: PPVEState): PPVEKpData => ({
  ppvefloor: s.ppvefloor, kp: s.kp, freeTime: s.freeTime, goldTime: s.goldTime, goldClgTime: s.goldClgTime, awardTime: s.awardTime,
  gold4awardTimeDaily: s.gold4awardTimeDaily,
});

/** ppveData: all of s0..s7 (the panel shows an error for a missing key), the master level and the saved config. */
export const ppveDataOf = (s: PPVEState): PPVEData => ({ p: ppvePartsWire(s.p), mlv: s.mlv, ppveConfig: s.ppveConfig });

// --- config / scripts -------------------------------------------------------------------------------------------------------
/** A cmdList as the client sends it: an object keyed by round, or an array of entries (the unconfigured default is `[]`). */
export function parseCmdList(raw: unknown): PPVECmdList {
  const rows: unknown[] = Array.isArray(raw) ? raw : typeof raw === 'object' && raw !== null
    ? Object.entries(raw).sort(([a], [b]) => int(a) - int(b)).map(([, v]) => v) : [];
  const out: PPVECmdList = {};
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const o = row as Record<string, unknown>;
    const action = int(o.action);
    if (action !== -10 && action !== -50) continue;
    const t = int(o.t, 1);
    const cmd: PPVECmd = { action, id: int(o.id), level: int(o.level, 1), t };
    out[String(Object.keys(out).length)] = cmd;
  }
  return out;
}

/** Stored / echoed config: `{"1": {pid, pos, cmdList}}` keyed by position; malformed entries are dropped. */
export function normalizeConfig(raw: unknown): PPVEConfig {
  const out: PPVEConfig = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const value of Object.values(raw)) {
    if (typeof value !== 'object' || value === null) continue;
    const o = value as Record<string, unknown>;
    const pid = int(o.pid);
    const pos = int(o.pos);
    if (pid <= 0 || pos < 1 || pos > PPVE_LINEUP_MAX || out[String(pos)]) continue;
    out[String(pos)] = { pid, pos, cmdList: parseCmdList(o.cmdList) };
  }
  return out;
}

/** Valid line-up entries ordered by position, one entry per pet id (Go ppveConfiguredPets). */
export function configSlots(config: PPVEConfig): PPVESlot[] {
  const seen = new Set<number>();
  return Object.values(config)
    .filter((s) => s.pos >= 1 && s.pos <= PPVE_LINEUP_MAX && s.pid > 0)
    .sort((a, b) => a.pos - b.pos)
    .filter((s) => !seen.has(s.pid) && seen.add(s.pid));
}

/** The pet script of a cmdList, rows ordered by round index. */
export function scriptOf(cmdList: PPVECmdList): PetScript {
  const out: PetScript = {};
  for (const [k, v] of Object.entries(cmdList)) out[k] = { action: v.action, id: v.id, level: v.level, t: int(v.t, 1) };
  return out;
}

/** A saved line-up holds at most 5 pets (PET_PVE_PANEL[7]); an empty config clears the line-up. */
export function configInputRefusal(raw: unknown): string | null {
  const count = typeof raw === 'object' && raw !== null ? Object.values(raw).filter((v) => typeof v === 'object' && v !== null).length : 0;
  return count > PPVE_LINEUP_MAX ? PPVE_TEXT.configCount : null;
}

/** Pet-level checks: every pet owned and bound, at most one per template (PET_PVE_PANEL[47] rule 2). */
export function lineupRefusal(pets: readonly { id: number; tid: number; binded: number }[], slots: readonly PPVESlot[]): string | null {
  const byId = new Map(pets.map((p) => [p.id, p]));
  const tids = new Set<number>();
  for (const s of slots) {
    const p = byId.get(s.pid);
    if (!p) return PPVE_TEXT.configNotOwned;
    if (p.binded <= 0) return PPVE_TEXT.configNotBound;
    if (tids.has(p.tid)) return PPVE_TEXT.configSameTemplate;
    tids.add(p.tid);
  }
  return null;
}

// --- prices ---------------------------------------------------------------------------------------------------------------
/**
 * Gold of the next extra try: 10 / 20 / 50 by goldTime, then 50 for every further one. Flash PET_PVE_PANEL[47] rule 3 says "lan 3 tro len
 * mat 50 vang" (third and above); the Go server instead refused past the third try (ErrPPVEChallengeCapReached), which we do not port.
 */
export function extraTryGold(goldTime: number): number {
  return PPVE_EXTRA_TRY_GOLD[Math.min(Math.max(0, goldTime), PPVE_EXTRA_TRY_GOLD.length - 1)];
}

/** The carve_award row the daily free exchange reads: the NEXT floor, clamped to 1..150 (the client shows setPPFloorAward(ppvefloor + 1)). */
export const freeExchangeFloor = (ppvefloor: number): number => Math.min(PPVE_MAX_FLOOR, Math.max(1, ppvefloor + 1));

/** KP of the daily free exchange; 50 when the carve_award row is missing. */
export const freeExchangeKp = (award: CarveAwardRow | undefined): number => (award ? award.freeExchange : PPVE_FREE_KP_FALLBACK);

// --- Khac Van level-up ----------------------------------------------------------------------------------------------------
export type LevelUpPlan =
  | { ok: true; id: number; level: number; cost: number; part: number; icon: number }
  | { ok: false; text: string };

/**
 * ppLevelUpPetIcon plan (Go LevelUpIcon): node id of (part, icon) is 0 (unopened) or in (base, base + 20]; the next node is id + 1 (or
 * base + 1) priced at that row's costkp. The icon unlocks with the best floor; level 20 is the max; the KP must cover the price.
 */
export function planCarveLevelUp(
  state: Pick<PPVEState, 'ppvefloor' | 'kp' | 'p'>, part: number, icon: number, rowOf: (id: number) => CarveRow | undefined,
): LevelUpPlan {
  if (!Number.isInteger(part) || !Number.isInteger(icon) || part < 0 || part >= PPVE_PART_SLOTS || icon < 0 || icon >= PPVE_PART_ICONS) {
    return { ok: false, text: PPVE_TEXT.carveInvalid };
  }
  if (state.ppvefloor < PPVE_ICON_UNLOCK_FLOOR[icon]) return { ok: false, text: PPVE_TEXT.carveLocked };
  const cur = state.p[`s${part}`]?.[icon] ?? 0;
  const base = carveId(part, icon, 0);
  if (cur !== 0 && (cur <= base || cur > base + PPVE_CARVE_MAX_LEVEL)) return { ok: false, text: PPVE_TEXT.carveInvalid };
  const next = cur > 0 ? cur + 1 : base + 1;
  if (carveLevelOf(next) > PPVE_CARVE_MAX_LEVEL || next - base > PPVE_CARVE_MAX_LEVEL) return { ok: false, text: PPVE_TEXT.carveMax };
  const row = rowOf(next);
  if (!row) return { ok: false, text: PPVE_TEXT.carveMax };
  if (state.kp < row.costKp) return { ok: false, text: PPVE_TEXT.carveNoKp };
  return { ok: true, id: next, level: next - base, cost: row.costKp, part, icon };
}

/** Applies a plan to the state (mutates): spends the KP, opens the node, recomputes the master level. Returns whether the master level rose. */
export function applyCarveLevelUp(state: PPVEState, plan: Extract<LevelUpPlan, { ok: true }>): boolean {
  const key = `s${plan.part}`;
  const levels = Array.from({ length: PPVE_PART_ICONS }, (_, i) => state.p[key]?.[i] ?? 0);
  levels[plan.icon] = plan.id;
  state.p[key] = levels;
  state.kp -= plan.cost;
  const before = state.mlv;
  state.mlv = ppveMasterLevel(state.p);
  return state.mlv > before;
}

// --- challenge ------------------------------------------------------------------------------------------------------------
/** Gate of challengeNextFloor (Go ChallengeNextFloor), checked after the daily reset: max floor first, then the free tries. */
export function challengeRefusal(state: Pick<PPVEState, 'ppvefloor' | 'freeTime'>): string | null {
  if (state.ppvefloor >= PPVE_MAX_FLOOR) return PPVE_TEXT.maxFloor;
  if (state.freeTime <= 0) return PPVE_TEXT.noTries;
  return null;
}

/** A WIN spends one free try and advances (Go ppve_challenge_next_floor): ppvefloor = todayFloor = the floor fought. A loss changes nothing. */
export function applyFloorWin(state: PPVEState, floor: number): void {
  state.ppvefloor = floor;
  state.todayFloor = floor;
  state.freeTime = Math.max(0, state.freeTime - 1);
}
