// M10 phase F: Vùng Đất Rèn Luyện (trials / VDRL, Flash TrialsPassMainPanel + TrialsPassAwardPanel + the MiniMapCanvas timer, strip id 43).
// Floor table, reward tables (client _firstAwardArr / _floorAwardArr, item table 29, always bound), score and Monday-stamp helpers,
// wire shapes and the player-visible texts. RPCs: trialsPanelInit, trialsStart(floor), trialsOut, trialsTimerAward,
// trialsFirstKillAwardTake(floor), trialsAwardTake, trialsAwardTakeByGold. Pushes: onUpdateTrialsCharData (incremental),
// onUpdateTrialsLifeAndTime {num, life}. Rules: legacy memory trials-vdrl.md; plan 2026-11-04_13 §2.4.

import { DAY_MS, vnDate } from './dayKey.js';

export const TRIALS = {
  ACTIVITY_ID: 43,
  FLOORS: 5,
  MIN_LEVEL: 130,
  DAILY_ENTRIES: 5,
  /** A new entry needs the leader plus at least one member (resuming a run on the same floor is allowed alone). */
  MIN_PARTY: 2,
  /** Rounds a twin (floor 4) stays dead before the partner's presence revives it (Go TwinReviveRounds). */
  TWIN_ROUNDS: 2,
  /** Round cap of a trainer fight (decision 9). */
  ROUND_CAP: 150,
  ITEM_TABLE: 29,
  /** Where a character with no stored return point goes (Bàng Bối Thành). */
  EXIT_MAP: 38,
} as const;

export interface TrialsFloorDef {
  floor: number;
  name: string;
  map: number;
  /** Huấn Luyện Viên NPC standing on the floor map. */
  trainer: number;
  /** Level of the floor's units. */
  level: number;
  minutes: number;
  lives: number;
}

export const TRIALS_FLOORS: readonly TrialsFloorDef[] = [
  { floor: 1, name: 'Thanatos', map: 558, trainer: 2102, level: 130, minutes: 20, lives: 5 },
  { floor: 2, name: 'Deeven', map: 559, trainer: 2100, level: 135, minutes: 20, lives: 4 },
  { floor: 3, name: 'Thánh Kiếm Orlando', map: 560, trainer: 2099, level: 140, minutes: 20, lives: 4 },
  { floor: 4, name: 'Catos và Pollux', map: 576, trainer: 2101, level: 145, minutes: 25, lives: 3 },
  { floor: 5, name: 'Tà Thần Khakass', map: 561, trainer: 2098, level: 150, minutes: 30, lives: 3 },
];

/** Every map a trials run can stand on (Go IsTrialsMap covers 558..576; the floors use these five). */
export const TRIALS_MAPS: readonly number[] = TRIALS_FLOORS.map((f) => f.map);

export const trialsFloor = (floor: number): TrialsFloorDef | undefined => TRIALS_FLOORS[floor - 1];

export interface TrialsAward {
  iid: number;
  n: number;
}

const A = (iid: number, n: number): TrialsAward => ({ iid, n });

/** TrialsPassMainPanel._firstAwardArr, floors 1..5. */
export const TRIALS_FIRST_AWARD: readonly (readonly TrialsAward[])[] = [
  [A(4725, 1), A(4591, 1), A(4674, 4), A(4735, 1)],
  [A(4726, 1), A(4591, 2), A(4674, 5), A(4736, 1)],
  [A(4727, 1), A(4592, 1), A(4674, 8), A(4737, 1)],
  [A(4728, 1), A(4592, 1), A(4674, 9), A(4738, 1)],
  [A(4729, 1), A(4592, 2), A(4674, 10), A(4739, 1)],
];

/** TrialsPassAwardPanel._floorAwardArr rows "1-1".."1-5": the weekly award of the highest floor cleared this week. */
export const TRIALS_WEEK_AWARD: readonly (readonly TrialsAward[])[] = [
  [A(4730, 1), A(4724, 3), A(4674, 1), A(4673, 1), A(4740, 1)],
  [A(4731, 1), A(4591, 1), A(4674, 2), A(4741, 1)],
  [A(4732, 1), A(4591, 1), A(4724, 2), A(4674, 4), A(4742, 1)],
  [A(4733, 1), A(4591, 1), A(4724, 4), A(4674, 5), A(4743, 1)],
  [A(4734, 1), A(4591, 2), A(4724, 2), A(4674, 6), A(4744, 1)],
];

/** Reward row with the H5 extension (`name` / `iconCode`: the client has no item table). */
export interface TrialsRewardRow extends TrialsAward {
  name?: string;
  iconCode?: string;
}

/** trialsPanelInit result and the base of every onUpdateTrialsCharData push (Flash keys). */
export interface TrialsCharData {
  /** Entries per day. */
  m: number;
  /** Entries used today. */
  n: number;
  /** Server clock (ms). */
  t: number;
  /** Day stamp YYYYMMDD of `n`. */
  ut: string;
  /** {floor: Monday stamp of the last clear}. */
  kt: Record<string, string>;
  /** {floor: 1} first-kill award taken. */
  a: Record<string, 1>;
  /** Monday stamp of the last weekly claim. */
  at: string;
  /** {floor: best score}. */
  sc: Record<string, number>;
  /** Floor whose button the client refreshes with `a` / `sc`. */
  nf: number;
}

/** trialsPanelInit reply: the Flash payload plus the reward tables (H5 extension). */
export interface TrialsPanel extends TrialsCharData {
  rw?: { first: TrialsRewardRow[][]; week: TrialsRewardRow[][] };
}

/** onUpdateTrialsCharData: incremental, only the changed keys (always `nf` with `a` / `sc`). */
export type TrialsCharPatch = Partial<TrialsCharData>;

/** onUpdateTrialsLifeAndTime / trialsTimerAward: ms left and lives; `{num: 0, life: -1}` = no run. */
export interface TrialsLifeTime {
  num: number;
  life: number;
}

export const TRIALS_NO_RUN: TrialsLifeTime = { num: 0, life: -1 };

/** Score 40 + 30 x time left / limit + 30 x lives left / lives (Go integer division on whole seconds). */
export function trialsScore(msLeft: number, limitMs: number, livesLeft: number, lives: number): number {
  const limitS = Math.floor(limitMs / 1000);
  if (limitS <= 0 || lives <= 0) return 40;
  const leftS = Math.min(Math.max(0, Math.floor(msLeft / 1000)), limitS);
  const alive = Math.min(Math.max(0, livesLeft), lives);
  return 40 + Math.trunc((30 * leftS) / limitS) + Math.trunc((30 * alive) / lives);
}

/** TrialsFloorCanvas.setStarLev: > 65 three stars, > 50 two, > 1 one. */
export function trialsStars(score: number): number {
  return score > 65 ? 3 : score > 50 ? 2 : score > 1 ? 1 : 0;
}

/** Client TimeUtil.getThisMonDay format "<month 0-11>|<date>|1" of the (UTC+7) Monday of the week containing `ms`. */
export function trialsMonday(ms: number): string {
  const v = vnDate(ms - ((vnDate(ms).weekday + 6) % 7) * DAY_MS);
  return `${v.month - 1}|${v.day}|1`;
}

/** Day stamp YYYYMMDD (UTC+7). */
export function trialsDay(ms: number): string {
  const v = vnDate(ms);
  return `${v.year}${String(v.month).padStart(2, '0')}${String(v.day).padStart(2, '0')}`;
}

/** Language.TRIALS_MAIN_PANEL[15..19]. */
export const TRIALS_FLOOR_INFO: readonly string[] = [
  'Thanatos là đại yêu bị phong ấn tại lối vào của Vùng Đất Rèn Luyện, hắn có một sức khống chế năng lượng rất mạnh cũng như ảnh hưởng lớn trong chốn ma giới. Đứng trước mặt Thanatos cũng đã là to gan lắm rồi!',
  'Deeven là hậu duệ của viễn cổ thần tộc, tuy đã mất năng lực hô mưa gọi gió nhưng sức lực còn lại cũng làm cho người khác phải khiếp sợ',
  'Nơi thâm sâu ở Vùng Đất Rèn Luyện đã bị bóng tối bao phủ, các quái vật bị ô nhiễm rơi vào vòng luân hồi không thể thoát. Thánh Kiếm Orlando lợi dụng năng lực bóng tối này để điều khiển bọn tà ma phục tùng mệnh lệnh của hắn.',
  'Catos và Pollux đều là những tinh anh ở Thánh Đường, nhưng linh hồn của họ đã lầm đường lạc lối, trở thành tai sai cho bóng tối tà ma!',
  'Tà Thần Khakass chỉ là ánh phản xạ của các loại ma quỷ trên thế giới, nhưng hắn lại có sao chép hết toàn bộ năng lực của loài ma quỷ mà hắn phản xạ được. Vì vậy muốn đánh bại hắn, hẳn người dũng sĩ phải có kiến thức uyên thâm và dũng mãnh!',
];

/** Language.TRIALS_MAIN_PANEL[20] (Cách chơi). */
export const TRIALS_RULES: readonly string[] = [
  'Cách chơi:',
  '1. Người chơi cấp 130 trở lên, mỗi ngày mỗi người có 5 cơ hội vào Vùng Đất Rèn Luyện.',
  '2. Trong 5 ải Rèn Luyện phải vượt qua ải đầu thì ải sau mới sáng đèn, những ải sáng đèn là ải có thể khiêu chiến.',
  '3. Mỗi ải đều có yêu cầu về thời gian và HP khác nhau.',
  '4. Phần thưởng chia làm 3 loại: ① Thưởng đầu: đầu tiên qua ải bất kỳ đều được nhận; ② Thưởng tuần: mỗi tuần nhận 1 lần, mặc định phần thưởng cao nhất đạt được; ③ Thưởng thành tựu: khi đạt đến thành tựu quy định sẽ nhận được phần thưởng hoặc danh hiệu tương ứng.',
];

export const TRIALS_TEXT = {
  TITLE: 'Vùng Đất Rèn Luyện',
  LEFT: (n: number) => `Khiêu chiến còn lại: ${n}`,
  LOCKED: 'Chưa đủ điều kiện khiêu chiến tầng này',
  CONFIRM_QUIT: 'Xác nhận thoát?',
  WEEKLY_ONCE: 'Mỗi tuần chỉ nhận thưởng 1 lần',
  TIMER: (clock: string) => `Thời gian đếm ngược ${clock}`,
  LIVES: (n: number) => `HP X${n}`,
  LEVEL: 'Cần đạt cấp 130 trở lên mới có thể vào Vùng Đất Rèn Luyện.',
  NO_ENTRIES: 'Hôm nay đã hết lượt vào Vùng Đất Rèn Luyện.',
  RUN_ACTIVE: 'Bạn đang trong một lượt rèn luyện, hãy hoàn thành hoặc rời khỏi trước.',
  IN_BATTLE: 'Bạn đang trong trận chiến.',
  NOT_CLEARED: 'Chưa vượt qua ải này, chưa thể nhận thưởng.',
  CLAIMED: 'Phần thưởng này đã nhận rồi.',
  NOTHING_WEEK: 'Tuần này bạn chưa vượt qua ải nào.',
  BAG_FULL: 'Túi đã đầy, hãy dọn túi rồi nhận lại.',
  BUSY: 'Hệ thống bận, vui lòng thử lại sau.',
  ENTER_FAILED: 'Không thể vào Vùng Đất Rèn Luyện, vui lòng thử lại sau.',
  BATTLE_FAILED: 'Không thể bắt đầu trận chiến, vui lòng thử lại sau.',
  PARTY_SIZE: (n: number) => `Vùng Đất Rèn Luyện cần tổ đội từ ${n} người trở lên, đội trưởng mở khiêu chiến cho cả đội.`,
  MEMBER_BLOCKED: (name: string, floor: number, why: string) => `Thành viên ${name} chưa thể vào Vùng Đất Rèn Luyện ải ${floor}: ${why}`,
  PARTY_BLOCKED: (floor: number, why: string) => `Tổ đội không thể vào Vùng Đất Rèn Luyện ải ${floor}: ${why}`,
  MEMBER_IN_BATTLE: (name: string) => `Thành viên ${name} đang trong trận chiến, không thể vào cùng tổ đội.`,
  MEMBER_NO_RUN: 'Bạn không có lượt rèn luyện ở ải này nên không thể khiêu chiến cùng tổ đội.',
  MEMBER_STAGE: 'Bạn đang ở giai đoạn khác của ải này nên không thể khiêu chiến cùng tổ đội.',
  ENTERED: (floor: number, name: string, minutes: number, lives: number) =>
    `Đã vào Vùng Đất Rèn Luyện ải ${floor} - ${name}. Hãy nói chuyện với Huấn Luyện Viên để khiêu chiến. Thời gian: ${minutes} phút, HP X${lives}.`,
  WIN: (floor: number, name: string, score: number, best: number) =>
    `Vượt qua ải ${floor} - ${name}! Điểm: ${score} (cao nhất ${best}). Nói chuyện với Huấn Luyện Viên để rời khỏi.`,
  FIRST_CLEAR: (floor: number) => `Lần đầu vượt qua ải ${floor}, có thể nhận Phần thưởng lần đầu trong bảng Vùng Đất Rèn Luyện.`,
  LOST: (lives: number) => `Khiêu chiến thất bại, còn HP X${lives}.`,
  RUN_OVER: 'Lượt rèn luyện đã kết thúc. Nói chuyện với Huấn Luyện Viên để rời khỏi.',
  TIME_OUT: 'Đã hết thời gian rèn luyện. Nói chuyện với Huấn Luyện Viên để rời khỏi.',
  EJECT_EXPIRED: 'Đã hết thời gian rèn luyện, ngươi được đưa ra khỏi Vùng Đất Rèn Luyện.',
  EJECT_NO_RUN: 'Ngươi không có lượt rèn luyện ở ải này, được đưa ra khỏi Vùng Đất Rèn Luyện.',
  STAGE_CLEAR: (cleared: string, next: string, lives: number) =>
    `Đã đánh bại ${cleared}! Hãy nói chuyện với Huấn Luyện Viên để khiêu chiến Boss thủ hộ ${next}. Còn HP X${lives}.`,
  MENU_RUN: (floor: number, name: string, left: string, lives: number) => `Ải ${floor} - ${name}\nThời gian còn lại: ${left}\nHP X${lives}`,
  MENU_NO_RUN: 'Bạn không có lượt rèn luyện ở ải này. Hãy vào từ bảng Vùng Đất Rèn Luyện.',
  LABEL_FIGHT: (name: string) => `Khiêu chiến ${name}`,
  LABEL_OUT: 'Rời khỏi Vùng Đất Rèn Luyện',
  HINT_GUARD_WAVE: 'Đánh bại 4 quái vật Luân Hồi, Boss thủ hộ Thánh Kiếm Orlando mới xuất hiện.',
  HINT_DEEVEN: 'Manh mối của trưởng lão: Deeven mượn sức gió của bầy Bạo Phong để hồi sinh, hãy hạ hết Bạo Phong trước khi hạ hắn.',
  HINT_TWINS: (rounds: number) => `Pollux và Catos phải ngã xuống không cách nhau quá 1 phút (${rounds} hiệp), nếu không kẻ ngã trước sẽ hồi sinh.`,
  HINT_KHAKASS: 'Tà Thần Khakass đã sao chép năng lực của các Boss ở mọi không gian!',
} as const;
