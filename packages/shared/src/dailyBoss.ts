// M8 phase D daily boss ("Sổ Tay Ma Thú", activity id 49): contracts, the per-boss config of the Flash client constants
// (BossDailyPanel BOSS_DAILY_CONFIG, copied through Go boss_config.go) and the attempt / cooldown gate shared by both sides.
// Flash names: bossDailyGetData, bossDailyBattle(bossId), bossDailyFinishByCard(bossId); push onOpenBossDailyPanel (Go name).

/** Attempts across all bosses per day shown by the panel ("Số lần còn lại"); Go sent it but never enforced it, H5 does. */
export const BOSS_DAILY_TOTAL = 16;
/** Type 2 bosses: cooldown since the last fight, 72 hours. */
export const BOSS_DAILY_COOLDOWN_MS = 259_200_000;

export interface BossDailyConfig {
  /** 1 = N attempts a day, 2 = one fight per cooldown */
  type: 1 | 2;
  isSuper: boolean;
  /** attempts per day (type 1) */
  num: number;
  /** cooldown in ms (type 2) */
  step: number;
}

const type1 = (ids: readonly number[], num: number, isSuper: boolean): [number, BossDailyConfig][] =>
  ids.map((id) => [id, { type: 1, isSuper, num, step: 0 }]);

const NORMAL_2 = [
  2204, 2205, 2206, 2207, 2208, 2209, 2210, 2211, 2212, 2213, 2214, 2215, 2216, 2217, 2218, 2219, 2220, 2222, 2224, 2225,
  2227, 2229, 2231, 2233, 2235, 2237, 2239, 2241, 2243, 2245, 2247, 2249, 2250, 2253, 2256, 2259, 2260, 2455, 2457,
];
const NORMAL_4 = [
  2221, 2223, 2226, 2228, 2230, 2232, 2234, 2236, 2238, 2240, 2242, 2244, 2246, 2248, 2251, 2252, 2254, 2255, 2257, 2258, 2261, 2456, 2458,
];
const SUPER_2 = [2262, 2263, 2264, 2269, 2270, 2271, 2272, 2273, 2274, 2275, 2468, 2568];
const SUPER_COOLDOWN = [2265, 2266, 2267, 2268];

/** The 79 configured bosses by NPC id (data_tbl_npc_creature `nid`). */
export const BOSS_DAILY_CONFIG: ReadonlyMap<number, BossDailyConfig> = new Map<number, BossDailyConfig>([
  ...type1(NORMAL_2, 2, false), ...type1(NORMAL_4, 4, false), ...type1(SUPER_2, 2, true), ...type1([2567], 4, true),
  ...SUPER_COOLDOWN.map((id): [number, BossDailyConfig] => [id, { type: 2, isSuper: true, num: 0, step: BOSS_DAILY_COOLDOWN_MS }]),
]);

/** Wild bosses (Go WildList): their reward decays when the boss is far above the player. */
export const BOSS_DAILY_WILD: readonly number[] = [2262, 2263, 2264, 2269, 2270, 2271, 2272, 2273, 2274, 2275, 2468];

/** Per-boss counters of the day: `n` fights used (type 1), `t` last fight time ms (type 2). */
export interface BossDailyEntry {
  n?: number;
  t?: number;
}

/** bossDailyGetData reply and onOpenBossDailyPanel push (Flash BossDailyPanel.onGetData). */
export interface BossDailyData {
  /** total attempts per day */
  total: number;
  /** server clock, ms */
  t: number;
  data: {
    /** UTC+7 day key of the counters */
    d: string;
    /** attempts used today across bosses */
    n: number;
    now: number;
    /** per-boss counters keyed by boss id */
    data: Record<string, BossDailyEntry>;
    /** bosses fought today (`dfd[id] == id`), unlocks bossDailyFinishByCard */
    dfd: Record<string, number>;
  };
  /** H5 catalog of the bosses (Flash reads its embedded table): id, name, creature level, attempts / cooldown */
  bosses?: BossDailyRow[];
}

export interface BossDailyRow {
  id: number;
  name: string;
  level: number;
  type: 1 | 2;
  isSuper: boolean;
  wild: boolean;
  /** attempts per day (type 1) */
  num: number;
  /** cooldown ms (type 2) */
  step: number;
}

export interface BossDailyFinishReply {
  result: number;
}

export interface BossDailyCounters {
  /** day key of the counters */
  day: string;
  used: number;
  perBoss: Record<string, BossDailyEntry>;
}

export type BossGate = { ok: true } | { ok: false; reason: 'unknown' | 'total' | 'attempts' | 'cooldown'; note: string };

/** Refusal texts (BOSS_DAILY_PANEL strings are not all in the research, these follow the Go error names). */
export const BOSS_GATE_NOTE = {
  unknown: 'Ma thú không tồn tại',
  total: 'Hôm nay bạn đã hết lượt khiêu chiến',
  attempts: 'Ma thú này đã hết lượt khiêu chiến hôm nay',
  cooldown: 'Ma thú này vẫn đang trong thời gian chờ',
} as const;

/** Can `bossId` be fought now? Counters are the already day-rolled ones; `now` is injected so tests control the clock. */
export function bossDailyGate(counters: BossDailyCounters, bossId: number, now: number): BossGate {
  const cfg = BOSS_DAILY_CONFIG.get(bossId);
  if (!cfg) return { ok: false, reason: 'unknown', note: BOSS_GATE_NOTE.unknown };
  if (counters.used >= BOSS_DAILY_TOTAL) return { ok: false, reason: 'total', note: BOSS_GATE_NOTE.total };
  const entry = counters.perBoss[String(bossId)] ?? {};
  if (cfg.type === 1 && (entry.n ?? 0) >= cfg.num) return { ok: false, reason: 'attempts', note: BOSS_GATE_NOTE.attempts };
  if (cfg.type === 2 && entry.t !== undefined && entry.t + cfg.step > now) return { ok: false, reason: 'cooldown', note: BOSS_GATE_NOTE.cooldown };
  return { ok: true };
}

/**
 * Counters after a fight starts (attempt consumed win or lose). A new day (`day` differs) first clears `used` and the per-boss
 * `n`, keeping the type 2 `t` (Go BossDailyState.Reset).
 */
export function bossDailyAfterStart(counters: BossDailyCounters, bossId: number, day: string, now: number): BossDailyCounters {
  const base = bossDailyRoll(counters, day);
  const cfg = BOSS_DAILY_CONFIG.get(bossId);
  const entry = base.perBoss[String(bossId)] ?? {};
  const next: BossDailyEntry = cfg?.type === 2 ? { t: now } : { n: (entry.n ?? 0) + 1 };
  return { day, used: base.used + 1, perBoss: { ...base.perBoss, [String(bossId)]: next } };
}

/** The counters as seen on `day`: unchanged on the same day, else reset (type 2 timestamps survive). */
export function bossDailyRoll(counters: BossDailyCounters, day: string): BossDailyCounters {
  if (counters.day === day) return counters;
  const perBoss: Record<string, BossDailyEntry> = {};
  for (const [id, e] of Object.entries(counters.perBoss)) perBoss[id] = e.t !== undefined ? { t: e.t } : { n: 0 };
  return { day, used: 0, perBoss };
}
