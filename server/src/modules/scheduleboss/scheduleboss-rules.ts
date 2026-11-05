// Schedule boss rules (M10 phase I, Go domain/scheduleboss cooldown.go + infrastructure/scheduleboss spawn_picker.go): fixed
// level-independent respawn (6 h ground, 24 h flying = layer 3), the random spawn point 60-120 px from an anchor known to be open
// ground, and the "<tên> đã bị tiêu diệt, sẽ xuất hiện lại lúc HH:MM dd/mm" notice (UTC+7). Pure; the RNG is injected.

import { vnDate } from '@mc/shared';
import type { ScheduleBossRow } from '../gamedata/boss-loot';

export const SCHEDULE_BOSS = {
  GROUND_MS: 6 * 3_600_000,
  FLYING_MS: 24 * 3_600_000,
  MIN_DIST: 60,
  MAX_DIST: 120,
  MARGIN: 80,
  TICK_MS: 30_000,
  /** data_tbl_npc type of a boss NPC */
  NPC_TYPE: 10,
} as const;

export interface Point {
  x: number;
  y: number;
}

/** Normal-tier ground / flying registry rows with a real map take part in the respawn loop (mythic and daily-only rows do not). */
export function isScheduled(b: ScheduleBossRow): boolean {
  return b.active && b.tier === 'normal' && (b.kind === 'ground' || b.kind === 'flying') && b.mapId > 0;
}

export function cooldownMs(kind: ScheduleBossRow['kind']): number {
  return kind === 'flying' ? SCHEDULE_BOSS.FLYING_MS : SCHEDULE_BOSS.GROUND_MS;
}

/** Anchor + 60-120 px in a random direction, clamped to the map with an 80 px margin (maps narrower than the margins use the centre). */
export function pickSpawnPoint(anchors: readonly Point[], width: number, height: number, rng: () => number): Point {
  const a = anchors.length > 0 ? anchors[Math.min(anchors.length - 1, Math.floor(rng() * anchors.length))] : { x: width / 2, y: height / 2 };
  const dist = SCHEDULE_BOSS.MIN_DIST + rng() * (SCHEDULE_BOSS.MAX_DIST - SCHEDULE_BOSS.MIN_DIST);
  const angle = rng() * Math.PI * 2;
  const clamp = (v: number, size: number): number => {
    const lo = SCHEDULE_BOSS.MARGIN;
    const hi = size - SCHEDULE_BOSS.MARGIN;
    return hi <= lo ? Math.round(size / 2) : Math.round(Math.min(hi, Math.max(lo, v)));
  };
  return { x: clamp(a.x + Math.cos(angle) * dist, width), y: clamp(a.y + Math.sin(angle) * dist, height) };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** "HH:MM dd/mm" of an epoch ms in UTC+7. */
export function respawnLabel(ms: number): string {
  const d = vnDate(ms);
  return `${pad(d.hour)}:${pad(d.minute)} ${pad(d.day)}/${pad(d.month)}`;
}

export function deadNotice(name: string, nextSpawnAt: number): string {
  return `${name} đã bị tiêu diệt, sẽ xuất hiện lại lúc ${respawnLabel(nextSpawnAt)}`;
}

/** Persisted respawn state of one boss. */
export interface BossState {
  alive: boolean;
  nextSpawnAt: number;
  x: number;
  y: number;
}

/** Death at `now`: not alive until now + the kind's cooldown (a boss that is already dead keeps its timer). */
export function afterKill(state: BossState, kind: ScheduleBossRow['kind'], now: number): BossState | null {
  return state.alive ? { ...state, alive: false, nextSpawnAt: now + cooldownMs(kind) } : null;
}

export function isDue(state: BossState, now: number): boolean {
  return !state.alive && state.nextSpawnAt <= now;
}
