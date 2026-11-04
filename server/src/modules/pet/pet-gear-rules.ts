// Pure rules of pet skills (books, slots, delete gate) and pet equipment (gates, positions). No Nest / Mongo here.
// Server research 2026-11-04_08 sections 6 and 7.

import { isPetEquipPosition, ITEM_TYPE_PET_BOOK, PET_EQUIP_POS_BASE, PET_SKILL_SLOT_COUNT, PET_FIRST_LOCKED_SLOT } from '@mc/shared';
import type { SkillTemplate } from '../gamedata/skill-data';

type Tpl = Record<string, unknown>;
const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** Pipe/comma list ("|3|", "3", "1|2") -> positive integers. */
export function idList(raw: unknown): number[] {
  return String(raw ?? '')
    .split(/[|,]/)
    .map((p) => Number(p.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
}

// --- skills ---

/** `cre_kind` = "classId|minQLevel"; a missing or 0 part is unrestricted. */
export function parseCreKind(raw: string): { classId: number; minQ: number } {
  const [c, q] = raw.split('|');
  return { classId: Math.max(0, int(c)), minQ: Math.max(0, int(q)) };
}

export interface CreatureFacts {
  classIds: readonly number[]; // creature class_ids
  qLevel: number;
}

export function skillFitsCreature(creKind: string, c: CreatureFacts): boolean {
  const k = parseCreKind(creKind);
  if (k.classId > 0 && !c.classIds.includes(k.classId)) return false;
  return c.qLevel >= k.minQ;
}

/** The skill a book teaches: its skill_id when set, else the lowest-level skill with exactly the book's name. */
export function bookSkill(book: Tpl, byId: (id: number) => SkillTemplate | undefined, named: (n: string) => readonly SkillTemplate[]): SkillTemplate | undefined {
  const direct = int(book.skill_id);
  if (direct > 0) return byId(direct);
  const name = String(book.name ?? '');
  return name ? named(name)[0] : undefined;
}

/** True when the item template is a pet skill book (type 506, use_type 2). */
export const isPetBook = (tpl: Tpl | undefined): boolean => !!tpl && int(tpl.type) === ITEM_TYPE_PET_BOOK && int(tpl.use_type) === 2;

/** Two pet skills conflict when they share id, name, a non-empty code_name or a non-empty script_req_l. */
export function skillsConflict(a: SkillTemplate, b: SkillTemplate): boolean {
  return a.id === b.id || a.name === b.name || (a.codeName !== '' && a.codeName === b.codeName)
    || (a.scriptReqL !== '' && a.scriptReqL === b.scriptReqL);
}

/** Index (0-based) of the first open slot (value 0), -1 when none. */
export const firstEmptySkillSlot = (skills: readonly number[]): number => skills.findIndex((v) => v === 0);

export type BookCheck =
  | { ok: true; slot: number; skill: SkillTemplate }
  | { ok: false; f: 1 | 2 | 3; reason: string };

/** Everything petBook checks before consuming the book (f 2 book/skill problem, f 1 slot/conflict). */
export function checkBook(
  book: Tpl | undefined, skills: readonly number[], c: CreatureFacts,
  byId: (id: number) => SkillTemplate | undefined, named: (n: string) => readonly SkillTemplate[],
): BookCheck {
  if (!isPetBook(book)) return { ok: false, f: 2, reason: 'Vật phẩm này không phải sách kỹ năng pet' };
  const skill = bookSkill(book!, byId, named);
  if (!skill) return { ok: false, f: 2, reason: 'Không tìm thấy kỹ năng của sách này' };
  if (!skillFitsCreature(skill.creKind, c)) return { ok: false, f: 2, reason: 'Pet này không thể học kỹ năng đó!' };
  const slot = firstEmptySkillSlot(skills);
  if (slot < 0) return { ok: false, f: 1, reason: 'Pet không còn ô kỹ năng trống!' };
  for (const id of skills) {
    const have = id > 0 ? byId(id) : undefined;
    if (have && skillsConflict(have, skill)) return { ok: false, f: 1, reason: 'Pet đã học kỹ năng này hoặc kỹ năng tương tự!' };
  }
  return { ok: true, slot, skill };
}

/** petDelSkill gate: the pet must be bound; the slot must hold a learned skill. */
export function delSkillBlocker(binded: number, slotValue: number): string | null {
  if (binded !== 1) return 'Phải khóa pet mới xóa được';
  if (!(slotValue > 0)) return 'Ô kỹ năng này không có kỹ năng';
  return null;
}

/** petOpenSkill gate: only a locked slot (-1) of 6..15 can be opened. */
export function openSkillBlocker(slot: number, slotValue: number): string | null {
  if (!Number.isInteger(slot) || slot < PET_FIRST_LOCKED_SLOT || slot > PET_SKILL_SLOT_COUNT) return 'Ô kỹ năng không hợp lệ';
  return slotValue === -1 ? null : 'Ô kỹ năng này đã được mở';
}

// --- equipment ---

export interface EquipGateInput {
  petLevel: number;
  petTid: number;
  creatureClassIds: readonly number[];
}

/** equ index (0..7) of a pet equipment template (position 50..57), null for anything else. */
export function petEquipIndex(tpl: Tpl | undefined): number | null {
  const p = int(tpl?.position);
  return isPetEquipPosition(p) ? p - PET_EQUIP_POS_BASE : null;
}

/** Why the pet cannot wear this item (req_level <= pet level, req_class contains the creature class, req_class_id the pet tid). */
export function petEquipBlocker(tpl: Tpl, g: EquipGateInput): string | null {
  if (g.petLevel < int(tpl.req_level)) return 'Cấp độ pet chưa đủ!';
  const classes = idList(tpl.req_class);
  if (classes.length > 0 && !g.creatureClassIds.some((c) => classes.includes(c))) {
    return 'Loại pet không phù hợp với trang bị này!';
  }
  const tids = idList(tpl.req_class_id);
  if (tids.length > 0 && !tids.includes(g.petTid)) return 'Pet này không thể mặc trang bị đó!';
  return null;
}
