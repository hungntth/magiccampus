// Skill window rules shared by server and client (M9 phase B): tabs by use_env, the learn-button gate, the expSkill pool,
// class ranks (cl) and the legacy SkillErrorMessage strings. Flash: SkillManager / SkillUseSlot.enableBtnReqSkill / TipReqSkill.

import { LEVEL_EXP } from './character.js';

export const SkillUseEnv = { ACTIVE: 0, PASSIVE: 1, MARRIAGE: 2, TRAINING: 3, GUILD: 4, MAGIC_WEAPON: 5, LIFE: 6 } as const;

/** Tabs ported in H5 (tab index = use_env): Chủ động, Bị động, Luyện. */
export const SKILL_TABS: readonly { env: number; label: string }[] = [
  { env: SkillUseEnv.ACTIVE, label: 'Chủ động' }, { env: SkillUseEnv.PASSIVE, label: 'Bị động' }, { env: SkillUseEnv.TRAINING, label: 'Luyện' },
];

/** Language CLASS_LEVEL[0..5] (GAMEPREDEF_S[82..87], trailing space kept: it prefixes the class name). */
export const CLASS_RANK_NAMES: readonly string[] = ['Kiến Tập ', 'Sơ Cấp ', 'Trung Cấp ', 'Cao Cấp ', 'Chuyên Gia ', 'Tông Sư '];

/** data_tbl_class.name by class id (1..6). */
export const CLASS_NAMES: Readonly<Record<number, string>> = {
  1: 'Chiến Binh', 2: 'Nhạc Công', 3: 'Danh Y', 4: 'Xạ Thủ', 5: 'Thợ Săn', 6: 'Hiệp Sĩ',
};

/** CALLBACK_S[25]: shown when onUPP carries a new `cl`. */
export const classRankText = (cl: number, classId: number): string =>
  `Bạn đã phổ cập thành: ${CLASS_RANK_NAMES[cl] ?? ''}${CLASS_NAMES[classId] ?? ''}`;

/** req_c_l 10 = rebirth only (never satisfiable in H5). */
export const SKILL_REQ_REBIRTH = 10;

/** Go SkillErrorMessage, verbatim. */
export const SKILL_ERR = {
  NOT_LEARNED: 'Chưa học kỹ năng này',
  SAME_LEVEL: 'Kỹ năng đã đạt cấp này',
  ONE_BY_ONE: 'Phải thăng từng cấp một',
  NO_EXP: 'Kinh nghiệm không đủ.',
  NOT_TRAINING: 'Không phải kỹ năng tu luyện',
  NO_BOOK_SKILL: 'Không tìm thấy kỹ năng của sách này',
  LEVEL: 'Cấp độ nhân vật không đủ',
  NO_SILVER: 'Bạc không đủ',
  CLASS_RANK: 'Cấp chức nghiệp không đủ',
  REBIRTH: 'Cần chuyển sinh để học kỹ năng này',
  CLASS: 'Nghề nghiệp không phù hợp',
  BOOK_FAILED: 'Không thể học kỹ năng',
} as const;

/** Flash GamePredef.TRAINING_SKILL_ORDER: the Luyện tab order by code_name. */
export const TRAINING_SKILL_ORDER: Readonly<Record<string, number>> = {
  SKILL493201: 1, SKILL494301: 2, SKILL494401: 3, SKILL505101: 4, SKILL505201: 5, SKILL505301: 6,
  SKILL504501: 7, SKILL504601: 8, SKILL504701: 9, SKILL504801: 10, SKILL504901: 11, SKILL505001: 12,
};

/** One row of the skill window (H5 extension: the client has no data tables). Costs are those of nextSid (or sid when unlearned). */
export interface SkillLearnView {
  sid: number;
  nextSid: number; // 0 = max level
  name: string;
  level: number;
  useEnv: number;
  kind: number;
  type: number;
  iconCode: string;
  learned: boolean;
  reqLevel: number;
  reqCl: number;
  expSkill: number;
  price: number;
  bookTid: number; // 0 when no book is needed (use_env 3) or none exists
  bookName: string;
  description: string;
  useMp: number;
  targetType: number;
}

/** The legacy in-level exp counter: H5 exp is cumulative, so the pool is exp above the current level's floor. */
export function skillPool(exp: number, level: number): number {
  const floor = LEVEL_EXP[Math.max(1, Math.min(level, LEVEL_EXP.length)) - 1] ?? 0;
  return Math.max(0, exp - floor);
}

/** Exp floor of a level (spending never goes below it, so the level never drops). */
export function levelFloor(level: number): number {
  return LEVEL_EXP[Math.max(1, Math.min(level, LEVEL_EXP.length)) - 1] ?? 0;
}

export interface LearnFacts { level: number; cl: number; pool: number; money: number; moneyBind: number; hasBook?: boolean }

/** SkillUseSlot.enableBtnReqSkill: level, exp pool, silver (bound or not, never split), class rank; unlearned books need the book. */
export function canLearn(v: SkillLearnView, p: LearnFacts): boolean {
  if (v.learned && v.nextSid === 0) return false;
  if (v.reqCl === SKILL_REQ_REBIRTH) return false;
  const bookNeeded = !v.learned && v.useEnv !== SkillUseEnv.TRAINING;
  if (bookNeeded && p.hasBook !== true) return false;
  return p.level >= v.reqLevel && p.pool >= v.expSkill && (p.money >= v.price || p.moneyBind >= v.price) && p.cl >= v.reqCl;
}
