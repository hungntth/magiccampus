// Pure skill-learning rules (M9 phase B, Go application/skill service.go / normal_upgrade.go / family.go / effect_skill_book.go /
// training_bonus.go): the validation chain, family next-level checks, the cost plan, the book-name key and the training bonus.

import { SKILL_ERR, SKILL_REQ_REBIRTH, SkillUseEnv } from '@mc/shared';
import type { SkillTemplate } from '../gamedata/skill-data';

export interface LearnChar { level: number; classId: number; cl: number }

/** validateNormalSkillRequest order: level -> class -> class rank (req_c_l <= 0 passes, 10 needs rebirth). */
export function validateSkill(tpl: SkillTemplate, c: LearnChar): string | null {
  if (c.level < tpl.reqLevel) return SKILL_ERR.LEVEL;
  if (tpl.reqClass.length > 0 && !tpl.reqClass.includes(c.classId)) return SKILL_ERR.CLASS;
  if (tpl.reqCl > 0) {
    if (tpl.reqCl === SKILL_REQ_REBIRTH) return SKILL_ERR.REBIRTH; // H5 has no rebirth
    if (c.cl < tpl.reqCl) return SKILL_ERR.CLASS_RANK;
  }
  return null;
}

/** The learned row of `tpl`'s family (same code_name), with its template. */
export function familyEntry<R extends { skillId: number }>(
  learned: readonly R[], tpl: SkillTemplate, lookup: (id: number) => SkillTemplate | undefined,
): { row: R; tpl: SkillTemplate } | null {
  if (!tpl.codeName) return null;
  for (const row of learned) {
    const t = lookup(row.skillId);
    if (t && t.codeName === tpl.codeName) return { row, tpl: t };
  }
  return null;
}

/** UpgradeNormalSkill family checks: learned, higher than the current level, exactly current + 1. */
export function upgradeError(current: SkillTemplate | null, next: SkillTemplate): string | null {
  if (!current) return SKILL_ERR.NOT_LEARNED;
  if (next.level <= current.level) return SKILL_ERR.SAME_LEVEL;
  if (next.level !== current.level + 1) return SKILL_ERR.ONE_BY_ONE;
  return null;
}

export type MoneyField = 'moneyBind' | 'money';

/** chargeSkillCost: exp pool first, then the whole price from moneyBind if it covers it, else from money (never split). */
export function chargePlan(
  cost: { expSkill: number; price: number }, w: { pool: number; money: number; moneyBind: number },
): { ok: true; field: MoneyField | null } | { ok: false; err: string } {
  if (cost.expSkill > w.pool) return { ok: false, err: SKILL_ERR.NO_EXP };
  if (cost.price <= 0) return { ok: true, field: null };
  if (w.moneyBind >= cost.price) return { ok: true, field: 'moneyBind' };
  if (w.money >= cost.price) return { ok: true, field: 'money' };
  return { ok: false, err: SKILL_ERR.NO_SILVER };
}

/** Book name -> skill-name key: after "sách kỹ năng", then after "-", trimmed, spaces collapsed, lower case. */
export function bookSkillKey(bookName: string): string {
  let s = bookName.toLowerCase().normalize('NFC');
  const at = s.indexOf('sách kỹ năng');
  if (at >= 0) s = s.slice(at + 'sách kỹ năng'.length);
  const dash = s.indexOf('-');
  if (dash >= 0) s = s.slice(dash + 1);
  return s.replace(/\s+/g, ' ').trim();
}

export const skillNameKey = (name: string): string => name.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();

/** Level-1 rows (use_env != 5) named like the book: the player's class wins, else the first match (by id). */
export function pickBookSkill(rows: readonly SkillTemplate[], bookName: string, classId: number): SkillTemplate | null {
  const key = bookSkillKey(bookName);
  if (!key) return null;
  const hits = rows.filter((t) => t.level === 1 && t.useEnv !== SkillUseEnv.MAGIC_WEAPON && skillNameKey(t.name) === key)
    .sort((a, b) => a.id - b.id);
  return hits.find((t) => t.reqClass.includes(classId)) ?? hits[0] ?? null;
}

export type TrainingStat = 'maxHp' | 'defense' | 'magicDefense' | 'speed';
const TRAINING_STATS: readonly { key: string; stat: TrainingStat; base: number }[] = [
  { key: 'sinh mệnh', stat: 'maxHp', base: 110 }, { key: 'phòng vật lý', stat: 'defense', base: 30 },
  { key: 'phòng ma pháp', stat: 'magicDefense', base: 30 }, { key: 'tốc độ', stat: 'speed', base: 3 },
];
const TRAINING_COEF = 10;

/** Owner-tuned training bonus: base × level × tier (Sơ 1 / Trung 2 / Cao 3) × 10, kind 5 / type 11 / name "Luyện …" only. */
export function trainingBonus(tpl: SkillTemplate): { stat: TrainingStat; value: number } | null {
  const name = tpl.name.toLowerCase().normalize('NFC').trim();
  if (tpl.kind !== 5 || tpl.type !== 11 || !name.startsWith('luyện ')) return null;
  const tier = name.includes('cao cấp') ? 3 : name.includes('trung cấp') ? 2 : 1;
  const st = TRAINING_STATS.find((s) => name.includes(s.key));
  return st ? { stat: st.stat, value: Math.round(st.base * Math.max(1, tpl.level) * tier * TRAINING_COEF) } : null;
}
