// Pure rules of the arena window: fight log lines (PET_ARENA_U[18/27/32/33]), the war report line, cooldown clock and the gold price of an
// extra turn. No DOM, so it is unit tested (arenaRules.test.ts).

import type { PetArenaFightPush, PetArenaSysMsg } from '@mc/shared';
import { ARENA_TEXT as T } from './petBattleText';

/** The log line of an onPetArenaFight / onGetArenaLog entry. `result` is the attacker's outcome (1 win, 2 loss). */
export function arenaLogText(l: PetArenaFightPush): string {
  if (l.guest) {
    const enemy = l.h_name ?? '';
    return l.result === 1 ? T.guestWin(enemy) : T.guestLose(enemy);
  }
  const enemy = l.g_name ?? '';
  return l.result === 1 ? T.win(enemy, l.pnt ?? 0) : T.lose(enemy, l.pnt ?? 0);
}

/** The war report text (type 1 weekly streak, 2 one-day climb); empty when there is no report yet. */
export function sysText(msg: Partial<PetArenaSysMsg> | null): string {
  const d = msg?.data;
  if (!Array.isArray(d) || d.length < 4) return '';
  const [type, , name, num] = d;
  if (type === 1) return T.streakMsg(name, num);
  if (type === 2) return T.climbMsg(name, num);
  return '';
}

/** Seconds of cooldown left from the absolute end (ms epoch); 0 when none or over. */
export function cooldownLeft(endMs: number, nowMs: number): number {
  return endMs > nowMs ? Math.ceil((endMs - nowMs) / 1000) : 0;
}

/** mm:ss of a number of seconds. */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Gold of one more daily turn when the current maximum is `max`: (max - 19) * 5 (the server refuses past 30). */
export const turnPrice = (max: number): number => Math.max(5, (max - 19) * 5);

/** Keeps the newest `limit` lines (the panel log is capped like the server's 20 kept lines). */
export function pushCapped<T>(list: readonly T[], item: T, limit = 40): T[] {
  return [...list, item].slice(-limit);
}
