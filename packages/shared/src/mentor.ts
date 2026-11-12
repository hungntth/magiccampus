// M14 phase B: teacher / student (Sư đồ) wire contract shared by server and client: rank tables, request codes and texts, the
// reply / push shapes (initTS, findTeacher, findStudent, acceptStudent, acceptTeacher, reportTS, delST, delTeacher, upTeacher,
// confirmTutor, tutorFuncAlert) and the pure rules (report gain, upgrade gate, ll strings). Flash text ids are IMPANEL_S[n].

/** GamePredef.TEACHER_TITLE: rank 0..6 (titles 1..6 of data_tbl_title carry the same names). */
export const TEACHER_RANK_TITLES = [
  'Không có', 'Vi nhân sư biểu', 'Tuân tuân thiện dụ', 'Hối nhân bất quyện', 'Nhân tài thi giáo', 'Hậu đức thụ nhân', 'Vạn thánh chi sư',
] as const;

/** Students a teacher of each rank may hold (GamePredef.STUDENT_NUM). */
export const STUDENT_NUM = [0, 5, 10, 15, 20, 25, 30] as const;

/** Points needed to leave rank `tl` (index = current rank; points are not spent). The IMPanel button gate, not its tooltips. */
export const TEACHER_UPGRADE_POINTS = [0, 200_000, 800_000, 20_000_000, 200_000_000, 1_000_000_000] as const;

export const MENTOR_MAX_RANK = 6;
export const MENTOR_MIN_TEACHER_LEVEL = 30;
/** Quest 692 "Lần Đầu Làm Thầy" (NPC 547): turning it in makes a Lv 30+ rank 0 character rank 1. */
export const MENTOR_QUALIFY_QUEST = 692;
/** Share of the exp a student needed per level gained that becomes teacher points on a report. */
export const MENTOR_REPORT_PERCENT = 10;
export const MENTOR_REQUEST_MS = 300_000;
export const MENTOR_NPC_DRAFT_MS = 60_000;

/**
 * NPC 49 Quản Lý Tiến Cử (type 16): `npcFuncOther(49, 1)` recommends the party leader as the teacher. Its data row stands on map 100,
 * which has no map data (a placeholder in the legacy game too), so H5 shows it as a per-viewer instance NPC at `hub` (Xuất Vân Thôn).
 */
export const NPC_TUTOR = {
  npcId: 49, funcId: 1, maxStudentLevel: 20, lockLevel: 30, scriptFunc: 'tutor_recommend', label: 'Tiến cử thành viên nhóm',
  hub: { mapId: 1, x: 1090, y: 930 },
} as const;

/** `f` of the findTeacher / findStudent reply: 1 waiting, 2 offline, 3 not found, 4 level, 5 has a teacher, 6 full / not eligible, 7 other line, 8 your own teacher. */
export const FindTsCode = { WAITING: 1, OFFLINE: 2, NOT_FOUND: 3, LEVEL: 4, HAS_TEACHER: 5, NOT_ELIGIBLE: 6, OTHER_LINE: 7, IS_TEACHER: 8 } as const;
export type FindTsCodeId = (typeof FindTsCode)[keyof typeof FindTsCode];

/** `f` of the reportTS reply. */
export const ReportTsCode = { OK: 1, NO_TEACHER: 2, FAILED: 3, TEACHER_OFFLINE: 4 } as const;
export type ReportTsCodeId = (typeof ReportTsCode)[keyof typeof ReportTsCode];

/** findTeacher (the student asks) answers `{t: 2, f}`; findStudent (the teacher asks) answers `{t: 1, f}`. */
export interface FindTsReply {
  t: 1 | 2;
  f: FindTsCodeId;
}

/** onFindTeacher `{t: 1, i: studentId, n}` (to the teacher) / onFindStudent `{t: 2, i: teacherId, n}` (to the student). */
export interface FindTsPush {
  t: 1 | 2;
  i: number;
  n: string;
}

/** onMakeTS: `t` 1 to the teacher (i = student), 2 to the student (i = teacher); `l` = the student's level. */
export interface MakeTsPush {
  t: 1 | 2;
  i: number;
  n: string;
  l: number;
}

/** onDelST: `t` 1 to the teacher (i = student), 2 to the student (i = teacher). */
export interface DelStPush {
  t: 1 | 2;
  i: number;
  n: string;
}

/** reportTS reply to the student; `ll` ("<last reported level>|<reported exp>") only when f is OK. */
export interface ReportTsReply {
  t: 2;
  f: ReportTsCodeId;
  ll?: string;
}

/** onReportTS to the teacher after a successful report: new points and the pair's `ll`. */
export interface ReportTsPush {
  t: 1;
  i: number;
  n: string;
  tp: number;
  ll: string;
}

/** One student row of the teacher's grid (onInitTS is an array of these). */
export interface InitTsRow {
  id: number;
  name: string;
  ll: string;
  honor: number;
}

export interface UpTeacherReply {
  t: 1;
  tl: number;
  tp: number;
}

/** tutorFuncAlert push: ask "Xác nhận nhóm trưởng hiện tại là người tiến cử?" about leader `i`. */
export interface TutorFuncAlert {
  i: number;
}

/** onUPP slice for the teacher rank. */
export interface MentorUpdate {
  tl: number;
  tp?: number;
}

/** chooseCharactor extras (Flash Player.ti / tn / tl / tp / ll): `ti` is a string ("-1" = no teacher). */
export interface MentorLogin {
  ti: string;
  tn: string;
  tl: number;
  tp: number;
  ll: string;
}

export const MENTOR_TEXT = {
  refusedBy: (name: string) => `${name} đã giải trừ quan hệ sư đồ với bạn!`,
  askStudent: (name: string) => `Nhận ${name} làm đồ đệ?`,
  askTeacher: (name: string) => `Nhận ${name} làm sư phụ?`,
  newStudent: (name: string) => `Bạn đã nhận ${name} làm đồ đệ!`,
  newTeacher: (name: string) => `Bạn đã bái ${name} làm sư phụ!`,
  reported: (name: string) => `Đồ đệ ${name} đã hồi báo cho bạn!`,
  noTeacher: 'Bạn chưa có sư phụ!',
  cannotTeach: 'Bạn vẫn chưa thể nhận đồ đệ!',
  noUpgrade: 'Điểm chức nghiệp chưa đủ để thăng cấp!',
  expired: 'Lời mời sư đồ đã hết hạn hoặc không tồn tại!',
  noStudent: 'Người này không phải đồ đệ của bạn!',
  reportFailed: 'Cấp độ hiện tại chưa cao hơn lần hồi báo trước!',
  deleteStudent: 'Xác nhận xóa đồ đệ này?',
  npcConfirm: 'Xác nhận nhóm trưởng hiện tại là người tiến cử?',
  npcLocked: 'Quan hệ tiến cử tạm thời không thể giải trừ (đồ đệ cần đạt cấp 30)!',
} as const;

/** IMPANEL_S[30..36]: text of each findTeacher `f`. */
export const FIND_TEACHER_TEXT: Readonly<Record<number, string>> = {
  1: 'Chờ đối phương xác nhận thỉnh cầu bái sư của bạn!',
  2: 'Người bạn muốn bái sư không online!',
  3: 'Đối phương và bạn không cùng kênh hoặc người chơi không tồn tại!',
  4: 'Cấp độ đối phương không đủ, không thể nhận bạn làm đồ đệ!',
  5: 'Bạn đã có sư phụ rồi!',
  6: 'Số lượng đồ đệ của đối phương đã đầy hoặc không đủ điều kiện nhận đồ đệ!',
  7: 'Đối phương và bạn không cùng kênh!',
};

/** IMPANEL_S[38..44, 86]: text of each findStudent `f`. */
export const FIND_STUDENT_TEXT: Readonly<Record<number, string>> = {
  1: 'Chờ đối phương xác nhận yêu cầu nhận đồ đệ của bạn!',
  2: 'Người chơi bạn muốn nhận đồ đệ không online!',
  3: 'Đối phương và bạn không cùng kênh hoặc người chơi không tồn tại!',
  4: 'Cấp độ của bạn không đủ, không thể nhận đối phương làm đồ đệ!',
  5: 'Đối phương đã có sư phụ!',
  6: 'Đồ đệ của bạn đã đầy hoặc bạn không phù hợp điều kiện nhận đồ đệ!',
  7: 'Đối phương và bạn không cùng kênh!',
  8: 'Dám nhận sự phụ của mình làm đồ đệ, không sợ bị trục xuất khỏi sư môn sao?',
};

/** reportTS `f` -> note (IMPANEL_S[19] for 2; the others are H5 wording). */
export const REPORT_TEXT: Readonly<Record<number, string>> = {
  2: 'Bạn chưa có sư phụ!',
  3: 'Cấp độ hiện tại chưa cao hơn lần hồi báo trước!',
  4: 'Sư phụ của bạn không online, không thể hồi báo!',
};

const clampRank = (tl: number): number => (Number.isInteger(tl) ? Math.min(Math.max(tl, 0), MENTOR_MAX_RANK) : 0);

export const rankTitle = (tl: number): string => TEACHER_RANK_TITLES[clampRank(tl)];
export const studentCap = (tl: number): number => STUDENT_NUM[clampRank(tl)];

/** Points needed to leave rank `tl` (Infinity at the top rank or below rank 1). */
export function upgradePoints(tl: number): number {
  return tl >= 1 && tl < MENTOR_MAX_RANK ? TEACHER_UPGRADE_POINTS[tl] : Infinity;
}

/** The upgrade button gate: rank 1..5 with enough points. */
export const canUpgradeTeacher = (tl: number, tp: number): boolean => tp >= upgradePoints(tl);

/**
 * Teacher points of a report: floor(sum of `levelExp(level)` for every level in (last, current] x 10 %). `levelExp(L)` is the
 * exp that level L needs on top of level L - 1 (Go PlayerLevelRequiredExp).
 */
export function reportGain(lastLevel: number, level: number, levelExp: (level: number) => number): number {
  let total = 0;
  for (let l = lastLevel + 1; l <= level; l++) total += levelExp(l);
  return Math.floor((total * MENTOR_REPORT_PERCENT) / 100);
}

export const formatLl = (level: number, exp: number): string => `${Math.trunc(level)}|${Math.trunc(exp)}`;

/** Parses "<level>|<exp>"; garbage reads as 0|0. */
export function parseLl(ll: unknown): { level: number; exp: number } {
  const [a, b] = typeof ll === 'string' ? ll.split('|') : [];
  const level = Number(a);
  const exp = Number(b);
  return { level: Number.isFinite(level) ? level : 0, exp: Number.isFinite(exp) ? exp : 0 };
}
