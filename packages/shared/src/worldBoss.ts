// M10 phase I world boss "Boss Thế Giới" (activity icon 15, Flash WbAutoBattleCanva / WbRankCanvas / WbTimerCanvas / WbResult): wire types, the
// cheer table the client mirrors, the schedule string and strings. Wire contract: legacy research 2026-10-10_01 §3-§5 (+ GUIDE_GAP).
// RPCs (fire-and-forget in Flash): canEnterWbMap, wbLeaveMap, takeWbAward, wbAutoBattle(playerId, auto), wbBattleCheck, wbReliveNow,
// wbStrongBattle(type). Pushes: initWbView (10 positional args), updateWbOnlineNum, onBossHpChanged, onUpdateWbRank, onShowWbTimer,
// onClearTimer, updateWbStrongLabel, onUpdateWbResult, onStartWb, onClearWbView, updateActivityState {id 15}.

export const WB_ACTIVITY_ID = 15;

/** Go weekdays (0 = Sunday .. 6 = Saturday) | start-end, UTC+7. The map opens 30 minutes before the start (lobby). */
export const WB_SCHEDULE = '2,4,6|14:30-15:00';

export interface WbSchedule {
  weekdays: number[];
  /** "HH:MM" */
  start: string;
  end: string;
}

/** Parses "D,D,D|HH:MM-HH:MM" (Go domain/worldboss schedule.go); throws on a malformed string. */
export function parseWbSchedule(s: string): WbSchedule {
  const parts = s.trim().split('|');
  const span = (parts[1] ?? '').split('-');
  if (parts.length !== 2 || span.length !== 2) throw new Error(`invalid world boss schedule: ${s}`);
  const weekdays = parts[0].split(',').map((x) => Number(x.trim()));
  if (weekdays.length === 0 || weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error(`invalid world boss schedule: ${s}`);
  const clock = (c: string): number => {
    const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(c);
    if (!m || Number(m[1]) > 24 || Number(m[2]) > 59) throw new Error(`invalid world boss schedule: ${s}`);
    return Number(m[1]) * 60 + Number(m[2]);
  };
  if (clock(span[1]) <= clock(span[0])) throw new Error(`invalid world boss schedule: ${s}`);
  return { weekdays, start: span[0].trim(), end: span[1].trim() };
}

/** "HH:MM" to minutes after midnight. */
export function wbClockMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** updateActivityState flag of icon 15: 1 lobby ("Đang báo danh"), 2 running ("Đang thao tác"), 0 hidden. */
export const WbFlag = { IDLE: 0, LOBBY: 1, FIGHT: 2 } as const;

/** Cheer (Cổ vũ) table shown by the client tooltips: the level about to be bought is the index. */
export const WB_CHEER = {
  MAX_LEVEL: 5,
  GOLD: 2,
  SILVER: 250_000,
  /** attack added by the purchase at level i (display only) */
  LEVEL_PCT: [20, 40, 60, 80, 100] as readonly number[],
  /** silver success rate (%) at current level i; gold always succeeds */
  SILVER_RATE: [100, 85, 65, 45, 25] as readonly number[],
} as const;

/** wbStrongBattle(type): 1 pays gold, 2 pays silver. */
export const WbCheerType = { GOLD: 1, SILVER: 2 } as const;

/** Relive countdown of WbTimerCanvas (seconds) and its instant price. */
export const WB_RELIVE = { TIMER_S: 25, GOLD: 10 } as const;

/** Gift item of the award strip / result window (a bag template id; H5 extension fields `name` / `iconCode` draw it). */
export interface WbAwardItem {
  itemId: number;
  num: number;
  name?: string;
  iconCode?: string;
}

export interface WbRankEntry {
  name: string;
  score: number;
}

export interface WbGlobalRank {
  globalRank: WbRankEntry[];
}

/** `myRank` is 0-based, -1 when not ranked. */
export interface WbClassRank {
  classRank: WbRankEntry[];
  myRank: number;
}

/** initWbView, in the exact positional order of Flash CallBack (research §4.1). */
export type InitWbViewArgs = [
  timeLeftSec: number,
  auto: boolean,
  bossHp: number,
  maxHp: number,
  cheerLevel: number,
  rank1: WbGlobalRank,
  rank2: WbClassRank,
  myHurt: number,
  online: number,
  awards: WbAwardItem[] | null,
];

/** onUpdateWbRank(rank1, rank2, hurt). */
export type UpdateWbRankArgs = [rank1: WbGlobalRank, rank2: WbClassRank, hurt: number];

/** onUpdateWbResult payload; unranked ranks are "-". */
export interface WbResult {
  award: WbAwardItem[];
  rank1: string | number;
  rank2: string | number;
  hurt: number;
  money: number;
  exp: number;
  luckyNum: number;
  name: string;
}

/** Strings of Language.as (WBQUTOBATTLECANVA_U, WB_RANK_CANVAS_U, WB_RESULT_CANVAS_U, CALLBACK_S[224]) the H5 HUD copies. */
export const WB_TEXT = {
  AUTO: 'Tự động đánh',
  GOLD_CHEER: 'Cổ vũ vàng',
  SILVER_CHEER: 'Cổ vũ bạc',
  CONFIRM_GOLD: (gold: number): string => `Xác nhận tốn ${gold} vàng để tăng tấn công?`,
  CONFIRM_SILVER: (money: number): string => `Xác nhận tốn ${money} bạc để tăng tấn công?`,
  MAX_LEVEL: 'Đã là cấp cao nhất',
  QUIT: 'Thoát',
  COST_TIP: (num: number, type: string, add: number): string => `Tiêu hao ${num} ${type}\nTăng tấn công ${add}%\n`,
  RATE_TIP: (rate: string): string => `Tỉ lệ thành công ${rate}`,
  RELIVE_CONFIRM: 'Tốn 10 vàng để lập tức chiến đấu',
  ONLINE: 'Số người:',
  RELIVE_TITLE: 'Lập tức chiến đấu',
  RELIVE_BTN: 'Đấu Ngay',
  RELIVE_LEFT: (s: number): string => `${s} giây sau sẽ tiếp tục chiến đấu`,
  RANK_TAB_CLASS: 'Xếp hạng nghề',
  RANK_TAB_WORLD: 'Xếp hạng thế giới',
  RANK: 'Xếp hạng',
  NAME: 'Tên',
  DAMAGE: 'Lượng sát thương',
  MY_RANK: (r: number | string): string => `Xếp hạng： ${r}`,
  MY_HURT: (n: number): string => `Sát thương：${n}`,
  REMAIN: 'Còn: ',
  RESULT_TITLE: 'Tổng kết sự kiện',
  RESULT_OK: 'Xác nhận',
  RESULT_TAKE: 'Nhận',
  ENDED: 'Sự kiện BOSS Thế Giới đã kết thúc!',
} as const;

/** "Còn: N ngày" / "Còn: H giờ M phút S giây" (QUESTCANVAS_S[9] / [11]). */
export function wbRemainText(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s >= 86_400) return `${WB_TEXT.REMAIN}${Math.floor(s / 86_400)} ngày`;
  return `${WB_TEXT.REMAIN}${Math.floor(s / 3600)} giờ ${Math.floor((s % 3600) / 60)} phút ${s % 60} giây`;
}

/** Rank cell score text: `score(pct%)` with pct = score x 100 / maxHp (3 decimals), `( <= 0.001%)` below that. */
export function wbScoreText(score: number, maxHp: number): string {
  const pct = maxHp > 0 ? (score * 100) / maxHp : 0;
  return pct < 0.001 ? `${score}( <= 0.001%)` : `${score}(${pct.toFixed(3)}%)`;
}
