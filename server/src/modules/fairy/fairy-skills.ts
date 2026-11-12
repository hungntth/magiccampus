// Pure fairy skill rules (Go application/fairy/skill.go, guard_skills.go, battle_skills.go): onSkill learns a book's skill once per family
// (TBL_SKILL code_name) into the first free s1..s20 slot when the grow level reaches the book's req_level (client FairySkillCanvas check);
// upFairySkill swaps a slot to the next level for 1 / 3 Sách Huấn Luyện Truyền Nhân; the guarding fairy's passive (type 11) skills buff the
// owner once per family at the highest level; its active (type 6) skills form the battle rotation of the selected config list.

import { FAIRY, FAIRY_SKILL_BOOKS, fairyGrowLevel, fairySkillKey, type FairyInfo, type FairySkillList } from '@mc/shared';

/** The skill row fields these rules read (a subset of gamedata SkillTemplate). */
export interface FairySkillTpl {
  id: number;
  type: number;
  level: number;
  codeName: string;
  buffId: number;
}

export type SkillOf = (id: number) => FairySkillTpl | undefined;
/** Rows of one code_name family, levels ascending. */
export type FamilyOf = (codeName: string) => readonly FairySkillTpl[];

/** Family key of a skill (code_name; fallback = the 3-id range of the book's level-1 id, then the id). */
export function familyOf(skillOf: SkillOf, id: number): string {
  const code = skillOf(id)?.codeName;
  if (code) return `code:${code}`;
  for (const base of Object.values(FAIRY_SKILL_BOOKS)) if (id >= base && id < base + FAIRY.SKILL_MAX_LEVEL) return `book:${base}`;
  return `id:${id}`;
}

export const hasFamily = (f: FairyInfo, skillOf: SkillOf, id: number): boolean =>
  Object.values(f.skillFlag).some((learned) => learned > 0 && familyOf(skillOf, learned) === familyOf(skillOf, id));

/** First free s1..s20 key, null when all are used. */
export function freeSlot(f: FairyInfo): string | null {
  for (let i = 1; i <= FAIRY.SKILL_SLOTS; i++) if (!(fairySkillKey(i) in f.skillFlag)) return fairySkillKey(i);
  return null;
}

export type LearnPlan = { sindex: string; skill: number } | { error: number };

/** onSkill(id, book): the book template's level-1 skill into a free slot. Errors carry the client sindex 1 (Học kỹ năng thất bại). */
export function planLearn(f: FairyInfo, bookTid: number, bookReqLevel: number, skillOf: SkillOf): LearnPlan {
  const skill = FAIRY_SKILL_BOOKS[bookTid];
  if (!skill) return { error: 1 };
  if (fairyGrowLevel(f.gexp) < bookReqLevel) return { error: 1 };
  if (hasFamily(f, skillOf, skill)) return { error: 1 };
  const sindex = freeSlot(f);
  return sindex ? { sindex, skill } : { error: 1 };
}

export type UpPlan = { sindex: string; skill: number; books: number } | { error: number };

/** upFairySkill(id, index): next level of the same code_name for 1 (lv1 -> 2) or 3 (lv2 -> 3) books; sindex 3 = max level, 2 = failed. */
export function planUpSkill(f: FairyInfo, index: number, skillOf: SkillOf, familyRows: FamilyOf): UpPlan {
  if (!Number.isInteger(index) || index < 1 || index > FAIRY.SKILL_SLOTS) return { error: 2 };
  const sindex = fairySkillKey(index);
  const cur = skillOf(f.skillFlag[sindex] ?? 0);
  if (!cur) return { error: 2 };
  if (cur.level >= FAIRY.SKILL_MAX_LEVEL) return { error: 3 };
  const next = familyRows(cur.codeName).find((r) => r.level === cur.level + 1);
  if (!next) return { error: 2 };
  return { sindex, skill: next.id, books: cur.level === 2 ? 3 : 1 };
}

/** Learned skills of type `type`, one per family at its highest level (a pre-fix duplicate never stacks). */
export function bestPerFamily(f: FairyInfo, skillOf: SkillOf, type: number): Map<string, FairySkillTpl> {
  const out = new Map<string, FairySkillTpl>();
  for (const id of Object.values(f.skillFlag)) {
    const t = skillOf(id);
    if (!t || t.type !== type) continue;
    const key = familyOf(skillOf, id);
    const prev = out.get(key);
    if (!prev || t.level > prev.level) out.set(key, t);
  }
  return out;
}

/** Buff rows of the guarding fairy's passive skills (type 11 with a buff). */
export const passiveBuffIds = (f: FairyInfo, skillOf: SkillOf): number[] =>
  [...bestPerFamily(f, skillOf, FAIRY.SKILL_PASSIVE).values()].filter((t) => t.buffId > 0).map((t) => t.buffId).sort((a, b) => a - b);

/** Selected rotation list: `select` 0..2 (absent = 0); -1 "Không dùng" / -2 / anything else = none. */
export function selectedList(f: FairyInfo): FairySkillList | null {
  const sel = f.skillConfig.select ?? 0;
  if (!Number.isInteger(sel) || sel < 0 || sel >= FAIRY.CONFIG_LISTS) return null;
  return f.skillConfig[String(sel) as '0' | '1' | '2'] ?? null;
}

/**
 * Battle rotation of the guarding fairy (Go ActiveSkillRotation): five TBL_SKILL ids (0 = empty slot) of the selected list, each resolved to the
 * learned level of its family (a slot saved before upFairySkill still casts the new level); null when nothing would cast. Slot N casts on rounds
 * N, N + 5, N + 10, ... before the owner acts (FAIRY_MANAGER_PANEL_U[107]).
 */
export function activeRotation(f: FairyInfo, skillOf: SkillOf): number[] | null {
  const list = selectedList(f);
  if (!list) return null;
  const learned = bestPerFamily(f, skillOf, FAIRY.SKILL_ACTIVE);
  if (learned.size === 0) return null;
  const out = Array.from({ length: FAIRY.ROTATION_SLOTS }, (_, i) => {
    const id = list[`c${i}`] ?? -1;
    return id > 0 && skillOf(id) ? (learned.get(familyOf(skillOf, id))?.id ?? 0) : 0;
  });
  return out.some((id) => id > 0) ? out : null;
}
