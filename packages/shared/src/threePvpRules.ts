// Pure 3v3 rules (M14 phase H): points, medals, loss-streak buff, result decision, room pairing, the weekly schedule and title tiers.
// Everything takes the clock / facts as arguments (no Node APIs), so server tests and the client can share it.

import { BattleResult } from './battle.js';
import { DAY_MS, dayKey, startOfDayMs, vnDate } from './dayKey.js';
import { THREE_PVP } from './threePvp.js';

/** Points of one counted match by the room size at the start (1..3). */
export function pointsFor(size: number, win: boolean): number {
  const table = win ? THREE_PVP.WIN_POINTS : THREE_PVP.LOSS_POINTS;
  const i = Math.min(Math.max(Math.floor(size), 1), THREE_PVP.SEATS) - 1;
  return table[i];
}

export function rankBonus(rank: number): number {
  return THREE_PVP.RANK_BONUS.find((t) => rank >= 1 && rank <= t.upTo)?.bonus ?? 0;
}

/** Settlement payout: points x 10 + the rank bonus; nothing for no points or a rank outside the paid list. */
export function medalsFor(points: number, rank: number): number {
  if (points <= 0 || rank < 1 || rank > THREE_PVP.MAX_RANKED) return 0;
  return points * THREE_PVP.MEDAL_PER_POINT + rankBonus(rank);
}

/** Consolation buff of a room that lost `losses` matches in a row: 5 -> 2435, ..., 9 or more -> 2439; null below 5. */
export function streakBuff(losses: number): number | null {
  if (losses < THREE_PVP.STREAK_START) return null;
  const i = Math.min(losses - THREE_PVP.STREAK_START, THREE_PVP.STREAK_BUFFS.length - 1);
  return THREE_PVP.STREAK_BUFFS[i];
}

export type MatchOutcome = 'a' | 'b' | 'draw';

/**
 * Who won a finished match (side a = the attacker). A side with no living character loses (both wiped = draw); otherwise the combat
 * result decides (a flee already shows as the fleeing side losing); a timeout / round cap is a draw.
 */
export function decideResult(battleResult: number, aAlive: number, bAlive: number): MatchOutcome {
  if (aAlive <= 0 && bAlive <= 0) return 'draw';
  if (aAlive <= 0) return 'b';
  if (bAlive <= 0) return 'a';
  if (battleResult === BattleResult.WIN) return 'a';
  if (battleResult === BattleResult.LOSE) return 'b';
  return 'draw';
}

export interface PairRoom {
  id: number;
  size: number;
  /** Sum of the members' levels. */
  strength: number;
  lastOpponent: number | null;
}

/**
 * Greedy pairing of queued rooms: size desc, strength desc, id asc; each room takes the next room that is not its last opponent (and
 * did not just play it), falling back to the last opponent when nobody else is free (two lone rooms may rematch).
 */
export function pairRooms(rooms: readonly PairRoom[]): [number, number][] {
  const sorted = [...rooms].sort((x, y) => y.size - x.size || y.strength - x.strength || x.id - y.id);
  const used = new Set<number>();
  const pairs: [number, number][] = [];
  for (const room of sorted) {
    if (used.has(room.id)) continue;
    const free = sorted.filter((c) => c.id !== room.id && !used.has(c.id));
    if (free.length === 0) break;
    const other = free.find((c) => c.id !== room.lastOpponent && room.id !== c.lastOpponent) ?? free[0];
    used.add(room.id);
    used.add(other.id);
    pairs.push([room.id, other.id]);
  }
  return pairs;
}

export interface RunWindow {
  /** dayKey (UTC+7) of a weekly run, `<dayKey>-gm-<HHMMSS>` of a GM window. */
  key: string;
  startMs: number;
  endMs: number;
  gm: boolean;
}

export type ThreePvpPhase = 'closed' | 'fighting' | 'settling';

/** Epoch ms of `minutes` past UTC+7 midnight of the day containing `ms`. */
function atMinute(ms: number, minutes: number): number {
  return startOfDayMs(ms) + minutes * 60_000;
}

/** The weekly Friday window containing `now`, or null. */
export function weeklyWindow(now: number): RunWindow | null {
  if (vnDate(now).weekday !== THREE_PVP.WEEKDAY) return null;
  const startMs = atMinute(now, THREE_PVP.START_MIN);
  const endMs = atMinute(now, THREE_PVP.END_MIN);
  return now >= startMs && now < endMs ? { key: dayKey(now), startMs, endMs, gm: false } : null;
}

/** Next Friday 19:00 strictly after `now` (for status displays). */
export function nextWeeklyStart(now: number): number {
  let day = startOfDayMs(now);
  for (let i = 0; i < 8; i++, day += DAY_MS) {
    if (vnDate(day).weekday !== THREE_PVP.WEEKDAY) continue;
    const start = day + THREE_PVP.START_MIN * 60_000;
    if (start > now) return start;
  }
  return now;
}

/** A GM test window of `minutes` (default 15, at least 5, at most 180) starting at `now`. */
export function gmWindow(now: number, minutes: unknown): RunWindow {
  const n = Number(minutes);
  const m = Number.isFinite(n) && n > 0 ? Math.min(Math.max(Math.floor(n), THREE_PVP.GM_MIN_MINUTES), THREE_PVP.GM_MAX_MINUTES) : THREE_PVP.GM_DEFAULT_MINUTES;
  const v = vnDate(now);
  const stamp = `${String(v.hour).padStart(2, '0')}${String(v.minute).padStart(2, '0')}${String(Math.floor(now / 1000) % 60).padStart(2, '0')}`;
  return { key: `${dayKey(now)}-gm-${stamp}`, startMs: now, endMs: now + m * 60_000, gm: true };
}

/** Phase of a run: fighting until its end, settling until `settledAt` is set, closed after. No run = closed. */
export function phaseAt(now: number, run: { startMs: number; endMs: number; settledAt?: number } | null): ThreePvpPhase {
  if (!run || now < run.startMs) return 'closed';
  if (run.settledAt !== undefined) return 'closed';
  return now < run.endMs ? 'fighting' : 'settling';
}

/** Minutes before the start of an announcement that is due at `now` (18:30 -> 30, 18:55 -> 5), else null; due within 5 s of the mark. */
export function announceMark(now: number): number | null {
  if (vnDate(now).weekday !== THREE_PVP.WEEKDAY) return null;
  const start = atMinute(now, THREE_PVP.START_MIN);
  for (const m of THREE_PVP.ANNOUNCE_MIN) {
    const at = atMinute(now, m);
    if (now >= at && now < at + 5_000) return Math.round((start - at) / 60_000);
  }
  return null;
}

/** The highest title the lifetime medals reach (NPC 1860), or null below the first tier. */
export function titleTierFor(lifetimeMedals: number): { titleId: number; medals: number } | null {
  let best: { titleId: number; medals: number } | null = null;
  for (const t of THREE_PVP.TITLES) if (lifetimeMedals >= t.medals) best = t;
  return best;
}

/** Match notice line for the world chat: names in seat order. */
export function matchNotice(outcome: MatchOutcome, a: readonly string[], b: readonly string[]): string {
  const left = a.join(', ');
  const right = b.join(', ');
  if (outcome === 'draw') return `[Chiến Trường Dũng Sĩ] ${left} và ${right} bất phân thắng bại!`;
  return outcome === 'a' ? `[Chiến Trường Dũng Sĩ] ${left} đã đánh bại ${right}!` : `[Chiến Trường Dũng Sĩ] ${right} đã đánh bại ${left}!`;
}
