// Pure pet arena rules (Go domain/petarena limits.go, points.go, entry_daily.go + application/petarena fight / announce): ISO-week seasons,
// daily turns and cooldown, Elo rating, points by level group, the weekly rank award, climb / streak milestones, the saved line-up shape
// and the player-visible texts. No Mongo, no clock: callers pass `now`.

import { arenaGroupOf, dayKey, DAY_MS, isoWeekSeason, PET_ARENA_POS_MAX, PET_ARENA_POS_MIN, PET_ARENA_TEAM_MAX, type PetArenaConf, type PPVESlot } from '@mc/shared';
import {
  ARENA_ADD_FIGHT_BASE_MAX, ARENA_ADD_FIGHT_GOLD_STEP, ARENA_CLEAR_CD_SECONDS_PER_GOLD, ARENA_CLIMB_STEPS, ARENA_COOLDOWN_MS, ARENA_DAILY_FIGHTS,
  ARENA_ELO_K, ARENA_LOSS_RATING, ARENA_MAX_DAILY_FIGHTS, ARENA_RANK_AWARD_COEF, ARENA_RANK_AWARD_MAX_RANK, ARENA_STREAK_STEP,
  ARENA_TOP_ANNOUNCE_RANK, ARENA_WIN_POINTS, ARENA_WIN_RATING_MIN,
} from '../pet/pet-depth-constants';
import { parseCmdList, PPVE_TEXT } from './ppve-rules';

/** Player-visible lines: Go handler constants (addArenaLog) and the Flash PET_ARENA_U announcements. */
export const ARENA_TEXT = {
  noTurns: 'Đã vượt quá giới hạn số lần khiêu chiến. Nếu muốn tiếp tục khiêu chiến, hãy nhấp chọn Tăng số lần khiêu chiến',
  cooldown: 'Bạn chờ một lát hãy khiêu chiến tiếp，hoặc nhấn vào[Hủy thời gian chờ]',
  register: 'Vui lòng đầu tiên hãy báo danh',
  fightFailed: 'Không thể khiêu chiến đối thủ này lúc này.',
  turnsCapped: 'Chỉ 10 cơ hội chiến đấu trong 1 ngày',
  noGold: 'Không đủ vàng.',
  awardNone: 'Tuần trước bạn không nằm trong top 200, không có phần thưởng xếp hạng.',
  awardClaimed: 'Bạn đã nhận phần thưởng xếp hạng tuần trước rồi.',
  awardFailed: 'Nhận thưởng thất bại, vui lòng thử lại sau.',
  awardDone: (rank: number, points: number): string => `Nhận thưởng xếp hạng tuần trước (hạng ${rank}) thành công: ${points} điểm đấu pet.`,
  replayMissing: 'Trận đấu này không có bản ghi chiến cuộc để xem lại.',
  registered: 'Báo danh thành công',
  noPets: 'Hãy thiết lập pet thi đấu trước khi báo danh',
  teamName: 'Tên đội không hợp lệ',
  teamMax: (max: number): string => `Nhóm của bạn chỉ được chọn tối đa ${max} pet`,
  top: (att: string, def: string, rank: number): string => `Đấu pet: ${att} đã đánh bại ${def}, tăng lên hạng ${rank}`,
  climb: (name: string, n: number): string => `Đấu pet: ${name} trong 1 ngày đã liên tục tăng ${n} hạng`,
} as const;

/** Daily / turn / cooldown fields of an entry. */
export interface ArenaDaily {
  usedFights: number;
  maxFights: number;
  /** Absolute end of the cooldown (ms epoch), 0 when none. */
  cooldownEndsAt: number;
  fightDay: string;
  /** Rank before the first challenge of the day (0 = unset) and the largest climb step already announced today. */
  dayStartRank: number;
  climbNotified: number;
}

/** Rating and streak counters of an entry. */
export interface ArenaScore {
  rating: number;
  wins: number;
  losses: number;
  combo: number;
  maxCombo: number;
}

// --- season ---------------------------------------------------------------------------------------------------------------
/** Season id of a time: ISO year * 100 + ISO week of the UTC+7 date (a new week starts a fresh ranking). */
export const weekSeason = isoWeekSeason;

export const previousWeekSeason = (ms: number): number => weekSeason(ms - 7 * DAY_MS);

/** Last week's 0-based rank as stored in `lastRank`: -1 when unranked or past the award cap. */
export const carriedLastRank = (position: number): number => (position >= 1 && position <= ARENA_RANK_AWARD_MAX_RANK ? position - 1 : -1);

// --- turns and cooldown ---------------------------------------------------------------------------------------------------
/** Applies the daily reset (turns back to 20, day markers cleared). Mutates; true when something changed. */
export function resetDaily(e: ArenaDaily, now: number): boolean {
  const day = dayKey(now);
  if (e.fightDay === day) {
    if (e.maxFights >= ARENA_DAILY_FIGHTS) return false;
    e.maxFights = ARENA_DAILY_FIGHTS;
    return true;
  }
  e.fightDay = day;
  e.dayStartRank = 0;
  e.climbNotified = 0;
  e.usedFights = 0;
  e.maxFights = ARENA_DAILY_FIGHTS;
  return true;
}

export const cooldownLeft = (e: ArenaDaily, now: number): number => Math.max(0, e.cooldownEndsAt - now);

/** Why a challenge cannot start (turns are checked before the cooldown, as Go CheckCanFight), null when it can. */
export function fightBlocker(e: ArenaDaily, now: number): 'noTurns' | 'cooldown' | null {
  if (e.usedFights >= e.maxFights) return 'noTurns';
  return cooldownLeft(e, now) > 0 ? 'cooldown' : null;
}

export function recordFight(e: ArenaDaily, now: number): void {
  e.usedFights++;
  e.cooldownEndsAt = now + ARENA_COOLDOWN_MS;
}

/** addPetFightNum: one more turn for today; false at the cap. */
export function buyFight(e: ArenaDaily): boolean {
  if (e.maxFights >= ARENA_MAX_DAILY_FIGHTS) return false;
  e.maxFights++;
  return true;
}

/** Gold of the next extra turn: (max - 19) * 5 (the max never counts below the base 20). */
export const addFightCost = (currentMax: number): number => (Math.max(currentMax, ARENA_DAILY_FIGHTS) - ARENA_ADD_FIGHT_BASE_MAX) * ARENA_ADD_FIGHT_GOLD_STEP;

/** clearArenaCD: ceil(seconds left / 30) gold, 0 when there is no cooldown. */
export const clearCooldownCost = (leftMs: number): number => (leftMs <= 0 ? 0 : Math.ceil(leftMs / 1000 / ARENA_CLEAR_CD_SECONDS_PER_GOLD));

// --- rating and points ----------------------------------------------------------------------------------------------------
/** |Elo change| of a result (K 32, truncated; a zero rounds to 1), the same for both sides. */
export function eloChange(attackerRating: number, defenderRating: number, attackerWon: boolean): number {
  const expected = 1 / (1 + 10 ** ((defenderRating - attackerRating) / 400));
  return Math.abs(Math.trunc(ARENA_ELO_K * ((attackerWon ? 1 : 0) - expected))) || 1;
}

/** The attacker's rating gain: the Elo change with a floor of 10 on a win, a flat 5 on a loss (a loss still adds). */
export const ratingGain = (attackerWon: boolean, elo: number): number => (attackerWon ? Math.max(elo, ARENA_WIN_RATING_MIN) : ARENA_LOSS_RATING);

/** Points paid to the attacker by its level group; a loss pays half rounded down. */
export function challengePoints(group: number, attackerWon: boolean): number {
  const win = ARENA_WIN_POINTS[group] ?? ARENA_WIN_POINTS[0];
  return attackerWon ? win : Math.floor(win / 2);
}

/** Applies a decided fight to both score blocks (Go RecordWin / RecordChallengeLoss / RecordLoss); returns the attacker's rating gain. */
export function settleFight(attacker: ArenaScore, defender: ArenaScore, attackerWon: boolean): number {
  const elo = eloChange(attacker.rating, defender.rating, attackerWon);
  const gain = ratingGain(attackerWon, elo);
  if (attackerWon) {
    win(attacker, gain);
    lose(defender, elo);
  } else {
    attacker.losses++;
    attacker.combo = 0;
    attacker.rating += gain;
    win(defender, elo);
  }
  return gain;
}

function win(s: ArenaScore, rating: number): void {
  s.wins++;
  s.combo++;
  s.maxCombo = Math.max(s.maxCombo, s.combo);
  s.rating += rating;
}

function lose(s: ArenaScore, rating: number): void {
  s.losses++;
  s.combo = 0;
  s.rating = Math.max(0, s.rating - rating);
}

/** Weekly rank award points: round(coef[group] * 1.02^(200 - rank)), 0 outside 1..200. */
export function rankAward(group: number, rank: number): number {
  if (rank < 1 || rank > ARENA_RANK_AWARD_MAX_RANK) return 0;
  return Math.round((ARENA_RANK_AWARD_COEF[group] ?? ARENA_RANK_AWARD_COEF[0]) * 1.02 ** (ARENA_RANK_AWARD_MAX_RANK - rank));
}

// --- milestones -----------------------------------------------------------------------------------------------------------
/** A win into rank 1..3 that is above the old rank (an old rank of 0 = unranked counts). */
export const isTopRise = (oldRank: number, newRank: number): boolean =>
  newRank >= 1 && newRank <= ARENA_TOP_ANNOUNCE_RANK && (oldRank <= 0 || newRank < oldRank);

/** The 200 / 100 climb step reached since the first challenge of the day that was not announced yet, 0 when none. */
export function climbMilestone(dayStartRank: number, rank: number, notified: number): number {
  if (dayStartRank <= 0 || rank <= 0) return 0;
  const climb = dayStartRank - rank;
  return ARENA_CLIMB_STEPS.find((step) => climb >= step && notified < step) ?? 0;
}

export const streakMilestone = (streak: number): boolean => streak >= ARENA_STREAK_STEP && streak % ARENA_STREAK_STEP === 0;

// --- names, rows ----------------------------------------------------------------------------------------------------------
export const isTeamNameSet = (name: string): boolean => name !== '' && name !== 'nl';
export const displayTeamName = (team: string, owner: string): string => (isTeamNameSet(team) ? team : owner);
const TEAM_NAME_RE = /^[\p{L}\p{N} _]{1,16}$/u;
/** A team name the client may send: "nl" / empty (keep) or 1..16 letters, digits, spaces, underscores. */
export const teamNameValid = (name: string): boolean => !isTeamNameSet(name) || TEAM_NAME_RE.test(name);
/** "37%" (truncated) or "0" without fights. */
export const winRate = (wins: number, total: number): string => (total <= 0 ? '0' : `${Math.trunc((wins * 100) / total)}%`);

// --- line-up --------------------------------------------------------------------------------------------------------------
const int = (v: unknown): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
};

/** Saved / echoed line-up `{"5": {pid, pos, cmdList}}` keyed by position 5..9; malformed entries and repeated positions are dropped. */
export function normalizeArenaConf(raw: unknown): PetArenaConf {
  const out: PetArenaConf = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const value of Object.values(raw)) {
    if (typeof value !== 'object' || value === null) continue;
    const o = value as Record<string, unknown>;
    const pid = int(o.pid);
    const pos = int(o.pos);
    if (pid <= 0 || pos < PET_ARENA_POS_MIN || pos > PET_ARENA_POS_MAX || out[String(pos)]) continue;
    out[String(pos)] = { pid, pos, cmdList: parseCmdList(o.cmdList) };
  }
  return out;
}

/** Valid slots by position, one per pet id (Go ArenaTeamSlots). */
export function arenaSlots(conf: PetArenaConf): PPVESlot[] {
  const seen = new Set<number>();
  return Object.values(conf)
    .filter((s) => s.pos >= PET_ARENA_POS_MIN && s.pos <= PET_ARENA_POS_MAX && s.pid > 0)
    .sort((a, b) => a.pos - b.pos)
    .filter((s) => !seen.has(s.pid) && seen.add(s.pid));
}

/** Input-shape check before any lookup: at most 5 raw entries (one per position). */
export function arenaConfInputRefusal(raw: unknown): string | null {
  const count = typeof raw === 'object' && raw !== null ? Object.values(raw).filter((v) => typeof v === 'object' && v !== null).length : 0;
  return count > PET_ARENA_POS_MAX - PET_ARENA_POS_MIN + 1 ? PPVE_TEXT.configCount : null;
}

/** Pet-level checks of a registration (PET_ARENA_U[42]): non-empty, owned, bound, one per template, at most the group's team size. */
export function arenaRegisterRefusal(
  pets: readonly { id: number; tid: number; binded: number }[], slots: readonly PPVESlot[], characterLevel: number,
): string | null {
  if (slots.length === 0) return ARENA_TEXT.noPets;
  const max = PET_ARENA_TEAM_MAX[arenaGroupOf(characterLevel)] ?? PET_ARENA_TEAM_MAX[0];
  if (slots.length > max) return ARENA_TEXT.teamMax(max);
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
