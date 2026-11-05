// M8 phase A contract: activity strip (startedActList / updateActivityList / updateActivityState), legacy 5-day sign-in,
// monthly calendar sign-in, activity diary + chests, online time / online gift and the tutorial guide log.
// Pure helpers (strip gating and layout, chest gate, online gift timing) are shared by server and client.
// Flash names: getSignInData, signinNow, initDailySignInActData, dailySignInActDoSignin, dailySignInActGetAward,
// dailySignInActRetroactive, dailySignInUpActCrit, getCharDiaryData, getDailyActAward, getTodayOnlineTime, getDailyOnlineAct, saveGuideLog.
// Push names hidden by the Flash CallBack stub come from Go: updateActivityList, updateActivityState, setBtnsDailySignInAct,
// oninitDailySignInActConsumeLimit, updateDailySignInActCrit, onDailySignInActDoSignin.

// --- activity strip ---

/** One strip entry; `flag` means: type 0/4 shown when truthy, type 2 level threshold, type 3 state 0 hidden / 1 signup / 2 running. */
export interface ActivityStripEntry {
  id: number;
  type: 0 | 2 | 3 | 4;
  flag: number;
  sortType: number;
}

/** startedActList / updateActivityList payload, keyed by the activity id as a string. */
export type ActivityStripList = Record<string, ActivityStripEntry>;

/** updateActivityState push (type 3 entries): flag is a 0 / 1 / 2 state code. */
export interface UpdateActivityStatePush {
  id: number;
  sortType: number;
  flag: 0 | 1 | 2;
}

/** Login payload extras of this phase (chooseCharactor): the strip list and the saved tutorial steps. */
export interface ActivityLogin {
  startedActList: ActivityStripList;
  /** saveGuideLog steps done, `{ "<guideId>": true }` (Go cData.guideFlag). */
  guideFlag: Record<string, boolean>;
}

/** Activity ids whose system exists in H5 (everything else is hidden from the strip). Phase A: daily activity panel, sign-in. */
export const ACTIVITY_PORTED_IDS: readonly number[] = [0, 2, 13, 15, 16, 19, 21, 24, 25, 27, 40, 43, 49, 65, 80, 81];

export const ActivityId = { DAILY_ACTIVITY: 0, STAR: 2, NINE_BOSS: 13, WORLD_BOSS: 15, FLOP_PASS: 40, TRIALS: 43, QUIZ: 16, VIP_SHOP: 19, LOTTO: 21, PRABUFF: 24, FEAST: 25, MAZE: 27, BOSS_DAILY: 49, DAILY_SIGNIN: 65, TXKC: 80, HMTXL: 81 } as const;

/** Strip tooltips / captions of the ported ids (the Flash skins are CSS art that was not extracted; H5 draws labelled tiles). */
export const ACTIVITY_LABEL: Readonly<Record<number, string>> = {
  0: 'Hoạt động hằng ngày', 2: 'Tinh Giới Thập Nhị Cung', 13: 'Kiếp Nạn Vô Ưu',  15: 'Boss Thế Giới', 40: 'Lật Bài Truyền Thuyết', 43: 'Vùng Đất Rèn Luyện', 16: 'Đố vui có thưởng', 19: 'Shop VIP', 21: 'Cây ước nguyện', 24: 'Ma pháp bí trận', 25: 'Lễ hội sôi động', 27: 'Mê Trận', 49: 'Sổ tay ma thú', 65: 'Báo danh nhận quà', 80: 'Khóa học Đặc Huấn', 81: 'Tu luyện Ảo Ma',
};

/** Phase D overrides of seed rows: the lotto row is disabled in the seed, the prabuff row is gated by rebirth exp (H5 has no rebirth: level gate). */
export const PRABUFF_MIN_LEVEL = 50;

/** Row of data_tbl_activity as the strip builder reads it. */
export interface ActivityRowLite {
  id: number;
  type: number;
  flag: number;
  sortType: number;
  enable: boolean;
}

/** Strip list for the login payload: enabled rows whose system is ported. */
export function buildStripList(rows: readonly ActivityRowLite[], ported: readonly number[] = ACTIVITY_PORTED_IDS): ActivityStripList {
  const out: ActivityStripList = {};
  for (const r of rows) {
    const forced = r.id === ActivityId.LOTTO;
    if (!(r.enable || forced) || !ported.includes(r.id)) continue;
    if (r.id === ActivityId.PRABUFF) {
      out[String(r.id)] = { id: r.id, type: 2, flag: PRABUFF_MIN_LEVEL, sortType: r.sortType };
      continue;
    }
    const type = r.type === 2 || r.type === 3 || r.type === 4 ? r.type : 0;
    out[String(r.id)] = { id: r.id, type, flag: r.flag, sortType: r.sortType };
  }
  return out;
}

export interface StripContext {
  level: number;
  /** rebirth exp (type 4 gate) */
  expRe: number;
}

export interface StripIcon {
  id: number;
  sortType: number;
  /** red state text under the icon (type 3) */
  label?: string;
}

/** Flash ActivityCanvas.initView / changeView visibility rules, sorted by sortType then id. */
export function visibleStrip(list: ActivityStripList, ctx: StripContext): StripIcon[] {
  const out: StripIcon[] = [];
  for (const e of Object.values(list)) {
    if (e.type === 3) {
      if (e.flag === 1) out.push({ id: e.id, sortType: e.sortType, label: 'Đang báo danh' });
      else if (e.flag === 2) out.push({ id: e.id, sortType: e.sortType, label: 'Đang thao tác' });
    } else if (e.type === 2) {
      if (ctx.level >= e.flag) out.push({ id: e.id, sortType: e.sortType });
    } else if (e.type === 4) {
      if (ctx.expRe > 0) out.push({ id: e.id, sortType: e.sortType });
    } else if (e.flag) {
      out.push({ id: e.id, sortType: e.sortType });
    }
  }
  return out.sort((a, b) => a.sortType - b.sortType || a.id - b.id);
}

export const STRIP_ICON_SIZE = 48;
export const STRIP_PER_ROW = 8;
export const STRIP_WIDTH = 450;

/** Number of pages (Flash getTabNum): 1 up to 16 icons, then one more per extra row of 8. */
export function stripTabCount(iconCount: number): number {
  return iconCount <= 16 ? 1 : Math.floor((iconCount - 17) / 8) + 2;
}

export interface StripSlot {
  icon: StripIcon;
  x: number;
  y: number;
}

/** Icons of page `tab` (1-based) with their ActivityCanvas coordinates: window of 16 starting at (tab-1)*8, two rows of 8. */
export function stripWindow(icons: readonly StripIcon[], tab: number): StripSlot[] {
  const start = (tab - 1) * STRIP_PER_ROW;
  const out: StripSlot[] = [];
  for (let i = 0; i < 2 * STRIP_PER_ROW; i++) {
    const icon = icons[start + i];
    if (!icon) break;
    out.push({ icon, x: 350 - (i % STRIP_PER_ROW) * 50, y: i < STRIP_PER_ROW ? 0 : 50 });
  }
  return out;
}

// --- legacy 5-day sign-in ---

/** getSignInData / signinNow reply. */
export interface SignInData {
  continueSigninTime: number;
  signinedToday: boolean;
  signedYesterday: boolean;
}

// --- monthly calendar sign-in ---

export interface DailySignInData {
  actYear: number;
  actMonth: number;
  /** signed days of the month: `{ "3": true }` */
  actDays: Record<string, boolean>;
  /** crit meter 0..100 */
  crit: number;
  /** day (1..31) on which the lucky claim is open, 0 when closed; flag = already claimed this month */
  getAwardTime: { day: number; flag: boolean };
}

export interface DailySignInConf {
  /** start of the month in ms */
  start: number;
  /** weekday numbers (0 = Sunday): Thursday lucky claim, Saturday surprise */
  luckyDay: number;
  surpriseDay: number;
  /** index = week of month (1..), index 0 unused; empty tier = 0 (e.g. no row for this month) */
  luckyPoint: number[];
  luckyGold: number[];
  retroactivePrice: number;
  critPrice: number;
  /** 0 hides the crit controls (polarity trap of the Flash panel): always 1 */
  closeOnKey: number;
  iInfo: { inc: 1 | 2 | 4; iid: number; number: number }[];
}

export interface DailySignInInit {
  time: { year: number; month: number; date: number };
  conf: DailySignInConf;
  data: DailySignInData;
}

/** dailySignInActDoSignin reply and onDailySignInActDoSignin push. */
export interface DailySignInDoReply {
  data: DailySignInData;
  date: number;
}

export const DAILY_SIGNIN_CONF = {
  levelGate: 50,
  legacyLevelGate: 20,
  retroactivePrice: 50,
  critPrice: 100,
  critStep: 5,
  luckyDay: 4,
  surpriseDay: 6,
} as const;

// --- diary (activity points) ---

/** getCharDiaryData reply: task id -> count today, plus `act` (points) and `ad` (chest claimed today). */
export type DiaryData = Record<string, number | boolean> & { act: number; ad: boolean };

/** updateDiaryData push args (id is the task id as a string; act >= 0 overwrites the total). */
export interface UpdateDiaryDataArgs {
  id: string;
  val: number;
  act: number;
}

/** One TBL_DIARY row for the panel (H5 catalog RPC getDiaryList; Flash read its static table). */
export interface DiaryEntry {
  id: number;
  name: string;
  info: string;
  /** points per completion */
  act: number;
  /** daily cap, -1 = unlimited */
  max: number;
  pos: number;
}

/** Names of the five chests (items 3255..3259) by tier. */
export const DIARY_CHEST_NAMES: readonly string[] = ['Rương Trắng', 'Rương Lục', 'Rương Lam', 'Rương Tím', 'Rương Cam'];

/** getDailyActAward reply. */
export interface DailyActAwardReply {
  f: boolean;
}

/** Chest tier gates on the day's activity points (Flash GameIntroPanel / DailyActPanel). */
export const DIARY_CHEST_THRESHOLDS: readonly number[] = [30, 60, 120, 210, 360];

/** Diary task ids hooked in H5 phase A (TBL_DIARY ids). Loop tasks arrive with phase C. */
export const DiaryTask = { LOGIN: 29, ONLINE_30: 33, PARTY: 34 } as const;

/** Chest `tier` can be claimed: valid tier, enough points and none claimed yet today (one chest per day across tiers). */
export function chestClaimable(tier: number, points: number, claimedToday: boolean): boolean {
  const need = DIARY_CHEST_THRESHOLDS[tier];
  return need !== undefined && !claimedToday && points >= need;
}

// --- online time / online gift ---

/** getTodayOnlineTime reply: minutes online today and gifts claimed today. */
export interface TodayOnlineTime {
  t: number;
  f: number;
}

export const ONLINE_GIFT_MINUTES = 30;
export const ONLINE_GIFT_MAX_PER_DAY = 48;

export interface OnlineGiftStatus {
  due: boolean;
  /** minutes until the next gift (0 when due or when every gift of the day was taken) */
  minutesLeft: number;
  exhausted: boolean;
}

/** Gift number f+1 is due once the day's online minutes reach (f+1) * 30 (Flash Core.onGetTodayOnlineTime). */
export function onlineGiftStatus(minutes: number, claimed: number): OnlineGiftStatus {
  if (claimed >= ONLINE_GIFT_MAX_PER_DAY) return { due: false, minutesLeft: 0, exhausted: true };
  const left = (claimed + 1) * ONLINE_GIFT_MINUTES - minutes;
  return left <= 0 ? { due: true, minutesLeft: 0, exhausted: false } : { due: false, minutesLeft: left, exhausted: false };
}
