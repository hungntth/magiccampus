// Star instance (Tinh Giới Thập Nhị Cung): the 12 palaces x 12 levels PvE grid. Wire shapes of getWarMap / clickWarMap / addWarMapTime and
// the battlePlayEnd star report, the score / reward / cost formulas and the report-card text rules. Pure: usable in Node and the browser.
// Legacy: Flash StarInstanceMap / StarBattleReport, Go application/starinstance (scoring.go, reward.go, click.go).

export const WAR_MAP_SIDS = 12;
export const WAR_MAP_LEVELS = 12;
/** Free attempts per day, and the cap after buying more with addWarMapTime. */
export const WAR_MAP_MIN_SMAX = 5;
export const WAR_MAP_MAX_SMAX = 10;
/** Account level the activity strip icon (id 2, flag 80) and the palaces need. */
export const WAR_MAP_MIN_LEVEL = 80;

/** Palace names in sid order (data_tbl_war_map 1..12). */
export const STAR_PALACE_NAMES: readonly string[] = [
  'Cung Bạch Dương', 'Cung Kim Ngưu', 'Cung Song Tử', 'Cung Cự Giải', 'Cung Sư Tử', 'Cung Xử Nữ',
  'Cung Thiên Bình', 'Cung Hổ Cáp', 'Cung Nhân Mã', 'Cung Ma Kết', 'Cung Bảo Bình', 'Cung Song Ngư',
];

/** best score per cell: `d[level][sid]` (percent, 0 = never won). */
export type WarMapScores = Record<string, Record<string, number>>;

/**
 * getWarMap reply: the Flash contract `{d, s}` plus two H5 additions the panel needs without a second call: `p` = the finished
 * Tinh Cung cultivation level per palace (`p[sid]`, the clickWarMap -2 gate) and `pnt` = the starPnt balance.
 */
export interface WarMapReply {
  d: WarMapScores;
  s: { smax: number; snum: number };
  p?: Record<string, number>;
  pnt?: number;
}

/** updateWarMapStatus push: absolute values, either field. */
export interface WarMapStatusPush {
  smax?: number;
  snum?: number;
}

export const ClickWarMapCode = { OK: 1, FAIL: 0, CULTIVATION: -2, PREVIOUS_LEVEL: -3, NO_ATTEMPTS: -5 } as const;

/** clickWarMap reply; `d` names the first roster member that fails a gate (refusal codes only). */
export interface ClickWarMapReply {
  c: number;
  d?: { id: number; name: string };
}

/** battlePlayEnd reply of a star battle: a win with the scored cell, `{r:0}` otherwise. `time` is in milliseconds. */
export interface StarBattleEndReply {
  r: 0 | 1;
  s?: { id: number; level: number; score: number; time: number; die: number };
}

/** BattleContext.source of the palace fights. */
export const STAR_BATTLE_SOURCE = 'star';

/** Score = 100 - deaths x 20 - clamp(elapsedSec / 3, 0, 50), clamped to [0, 100] (Go ComputeScore, integer division). */
export function starScore(deaths: number, elapsedSec: number): number {
  const penalty = Math.min(Math.max(Math.trunc(elapsedSec / 3), 0), 50);
  return Math.max(Math.min(100 - deaths * 20 - penalty, 100), 0);
}

/** A win always stores at least 1 so a slow win still counts as cleared (Go MinWinScore). */
export const starWinScore = (deaths: number, elapsedSec: number): number => Math.max(starScore(deaths, elapsedSec), 1);

/** starPnt granted per win (and per swept battle): level x 10. */
export const starPntForLevel = (level: number): number => level * 10;

/** Price in gold of the next extra attempt when the day's maximum is `smax` (addWarMapTime). */
export const warMapAddCost = (smax: number): number => (smax - 4) * 10;

/** Flash StarInstanceCanvas: stars shown for a score (> 90 5, > 80 4, > 60 3, > 30 2, else 1; 0 = not cleared). */
export function starCount(score: number): number {
  if (score <= 0) return 0;
  if (score > 90) return 5;
  if (score > 80) return 4;
  if (score > 60) return 3;
  if (score > 30) return 2;
  return 1;
}

/** StarBattleReport: always at least one star lit. */
export const reportStars = (score: number): number => Math.max(1, starCount(score));

/** Language.STAR_BATTLE_REPORT[1..5]. */
export const STAR_REPORT_COMMENTS: readonly string[] = ['Quá tệ！', 'Cũng tạm được！', 'Giỏi lắm！', 'Quá giỏi！', 'Nhân tài hiếm có！'];

export const reportComment = (score: number): string => STAR_REPORT_COMMENTS[reportStars(score) - 1];

/** Level-button progress bar by palaces cleared at that level (StarInstanceMap PROGRESS_PER, index = palaces cleared 0..12). */
export const WAR_MAP_PROGRESS = [0, 0.2, 0.28, 0.38, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.9, 1] as const;

export function levelProgress(d: WarMapScores, level: number): number {
  let n = 0;
  for (let sid = 1; sid <= WAR_MAP_SIDS; sid++) if ((d[String(level)]?.[String(sid)] ?? 0) > 0) n++;
  return WAR_MAP_PROGRESS[n] ?? 0;
}

/** Flash getTimeBySec: mm:ss, or h:m:s past one hour. */
export function reportTime(ms: number): string {
  let sec = Math.max(0, Math.round(ms / 1000));
  const pad = (v: number): string => (v < 10 ? `0${v}` : String(v));
  if (sec > 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec - h * 3600) / 60);
    sec -= h * 3600 + m * 60;
    return `${h}:${m}:${sec}`;
  }
  const m = Math.floor(sec / 60);
  return `${pad(m)}:${pad(sec - m * 60)}`;
}

/** Language.STAR_MAP_INS refusal text of a clickWarMap code (`who` = the offending member, only meaningful for a leader). */
export function clickRefusalText(code: number, leader: boolean, who?: string): string {
  const name = who ?? 'Có người';
  switch (code) {
    case ClickWarMapCode.CULTIVATION:
      return leader ? `${name} trong nhóm chưa đủ điều kiện khiêu chiến` : 'Không đủ điều kiện khiêu chiến';
    case ClickWarMapCode.PREVIOUS_LEVEL:
      return leader ? `${name} trong nhóm chưa khiêu chiến cấp trước đó` : 'Chưa khiêu chiến cấp trước đó';
    case ClickWarMapCode.NO_ATTEMPTS:
      return leader ? `${name} đã hết số lần khiêu chiến` : 'Số lần khiêu chiến đã hết';
    default:
      return '';
  }
}

/** Parses a battlePlayEnd reply into a star report; null for anything else (a loss `{r:0}` or a non-star reply). */
export function parseStarReply(reply: unknown): NonNullable<StarBattleEndReply['s']> | null {
  const r = reply as { r?: unknown; s?: Record<string, unknown> } | null;
  if (!r || typeof r !== 'object' || !Number(r.r) || !r.s || typeof r.s !== 'object') return null;
  const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { id: n(r.s.id), level: n(r.s.level), score: n(r.s.score), time: n(r.s.time), die: n(r.s.die) };
}
