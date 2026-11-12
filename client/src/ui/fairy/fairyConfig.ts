// Pure helpers of the Tiểu Tinh Linh window (no DOM): static row lookups, the skill config draft of the Thiết lập tab
// (FairySkillConfigCanvas: three lists x five slots, one skill family per list) and the fail-code -> Flash text mapping.

import {
  FAIRY, FAIRY_BOOK_ROWS, FAIRY_SKILL_ROWS, FAIRY_TEMPLATE_ROWS, FAIRY_TEXT, fairySkillKey, type FairyBookRow, type FairyFailCode,
  type FairyInfo, type FairySkillConfig, type FairySkillRow, type FairyTemplateRow,
} from '@mc/shared';

const templates = new Map(FAIRY_TEMPLATE_ROWS.map((r) => [r.id, r]));
const skills = new Map(FAIRY_SKILL_ROWS.map((r) => [r.id, r]));
const books = new Map(FAIRY_BOOK_ROWS.map((r) => [r.id, r]));

export const templateOf = (tid: number): FairyTemplateRow | undefined => templates.get(tid);
export const skillOf = (id: number): FairySkillRow | undefined => skills.get(id);
export const bookOf = (tid: number): FairyBookRow | undefined => books.get(tid);

/** Learned skills of a fairy in slot order: [index 1..20, TBL_SKILL id]. */
export function learnedSkills(f: Pick<FairyInfo, 'skillFlag'>): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i <= FAIRY.SKILL_SLOTS; i++) {
    const id = Number(f.skillFlag[fairySkillKey(i)] ?? 0);
    if (id > 0) out.push([i, id]);
  }
  return out;
}

/** Sách Huấn Luyện Truyền Nhân needed for the next level (1 for 1 -> 2, 3 for 2 -> 3), 0 at max. */
export const upgradeCost = (level: number): number => (level >= FAIRY.SKILL_MAX_LEVEL ? 0 : level <= 1 ? 1 : 3);

/** Editable copy of a stored config: three lists of five TBL_SKILL ids (-1 empty) and the list in use (-1 none). */
export interface ConfigDraft {
  lists: number[][];
  select: number;
}

export function draftOf(cfg: FairySkillConfig | undefined): ConfigDraft {
  const lists: number[][] = [];
  for (let l = 0; l < FAIRY.CONFIG_LISTS; l++) {
    const row = (cfg?.[String(l) as '0' | '1' | '2'] ?? {}) as Record<string, number>;
    const slots: number[] = [];
    for (let c = 0; c < FAIRY.ROTATION_SLOTS; c++) {
      const v = Number(row[`c${c}`]);
      slots.push(Number.isInteger(v) && v > 0 ? v : -1);
    }
    lists.push(slots);
  }
  const sel = Number(cfg?.select);
  const select = cfg?.select === undefined ? 0 : Number.isInteger(sel) && sel >= -1 && sel < FAIRY.CONFIG_LISTS ? sel : 0;
  return { lists, select };
}

/** fairySkillConfigChange payload of a draft. */
export function configOf(d: ConfigDraft): FairySkillConfig {
  const cfg: FairySkillConfig = { select: d.select };
  d.lists.forEach((slots, l) => {
    cfg[String(l) as '0' | '1' | '2'] = Object.fromEntries(slots.map((v, c) => [`c${c}`, v > 0 ? v : -1]));
  });
  return cfg;
}

/** True when a list holds two skills of one family (U[103]); `family` maps a skill id to its code name. */
export function hasDuplicateFamily(slots: readonly number[], family: (id: number) => string | undefined): boolean {
  const seen = new Set<string>();
  for (const id of slots) {
    if (id <= 0) continue;
    const f = family(id) ?? String(id);
    if (seen.has(f)) return true;
    seen.add(f);
  }
  return false;
}

export const sameDraft = (a: ConfigDraft, b: ConfigDraft): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Text of a grow / raise / feed refusal (FairyFuncCanvas / FairyItemCanvas); '' = silent. */
export function failText(op: 'grow' | 'raise' | 'feed', code: FairyFailCode, growType = 0): string {
  if (op === 'grow') {
    if (code === 'out') return FAIRY_TEXT.NO_GROWS;
    if (code === 'rmb') return growType === FAIRY.GROW_TYPE.MONEY ? FAIRY_TEXT.NO_MONEY : FAIRY_TEXT.NO_GOLD;
    if (code === 'lv') return FAIRY_TEXT.GROW_MAX;
    return FAIRY_TEXT.FEED_FAIL;
  }
  if (code === 'item') return FAIRY_TEXT.WRONG_ITEM;
  if (code === 'num') return FAIRY_TEXT.ITEM_SHORT;
  if (code === 'full') return FAIRY_TEXT.DOH_FULL;
  if (code === 'out') return FAIRY_TEXT.NO_FEEDS;
  if (code === 'max') return FAIRY_TEXT.MAX_LEVEL;
  return FAIRY_TEXT.FEED_FAIL;
}

/** Skill reply failure: sindex 1 learn failed, 2 upgrade failed, 3 max level. */
export const skillFailText = (sindex: number): string =>
  sindex === 3 ? FAIRY_TEXT.SKILL_MAX : sindex === 2 ? FAIRY_TEXT.UP_FAIL : FAIRY_TEXT.LEARN_FAIL;

/** Max level of a skill family (rows sharing the code name). */
export function familyMax(codeName: string): number {
  let max = 0;
  for (const r of FAIRY_SKILL_ROWS) if (r.codeName === codeName && r.level > max) max = r.level;
  return max || FAIRY.SKILL_MAX_LEVEL;
}

/** Art of a fairy: the shown skin template when `skinTid` > 0, else its own template (server AppearanceService.fairyArt). */
export const fairyArtOf = (tid: number, skinTid: number): string => templateOf(skinTid > 0 ? skinTid : tid)?.rc ?? '';
