// Pet-facing view of data_tbl_creature (catch / class / quality / icon columns on top of the combat template) and
// data_tbl_creature_skill (default skills of a creature). Pure builders; GameDataService caches the result at startup.

import { toCreature, type CreatureTemplate } from './combat-data';

type Raw = Record<string, unknown>;
const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export interface PetTemplate extends CreatureTemplate {
  classId: number;
  classIds: string; // pipe list, as in the seeds ("3")
  qLevel: number; // 1..3 quality
  catchable: number;
  isBind: number;
  element: number;
  iconCode: string;
  colorCode: string;
  brightCode: string;
}

export interface PetTables {
  templates: Map<number, PetTemplate>;
  creatureSkills: Map<number, number[]>; // cid -> skill ids ordered by position, id
}

export function toPetTemplate(r: Raw): PetTemplate {
  return {
    ...toCreature(r),
    classId: num(r.class_id),
    classIds: r.class_ids === null || r.class_ids === undefined ? '' : String(r.class_ids),
    qLevel: num(r.q_level, 1),
    catchable: num(r.catchable),
    isBind: num(r.is_bind),
    element: num(r.element),
    iconCode: String(r.icon_code ?? 0),
    colorCode: String(r.color_code ?? 0),
    brightCode: String(r.bright_code ?? 0),
  };
}

export function buildPetTables(creatureRows: readonly Raw[], skillRows: readonly Raw[]): PetTables {
  const templates = new Map<number, PetTemplate>();
  for (const raw of creatureRows) {
    const t = toPetTemplate(raw);
    templates.set(t.id, t);
  }
  const grouped = new Map<number, { sid: number; position: number; id: number }[]>();
  for (const raw of skillRows) {
    const cid = num(raw.cid);
    const row = { sid: num(raw.sid), position: raw.position === null || raw.position === undefined ? Number.MAX_SAFE_INTEGER : num(raw.position), id: num(raw.id) };
    const list = grouped.get(cid);
    if (list) list.push(row);
    else grouped.set(cid, [row]);
  }
  const creatureSkills = new Map<number, number[]>();
  for (const [cid, rows] of grouped) {
    rows.sort((a, b) => a.position - b.position || a.id - b.id);
    creatureSkills.set(cid, rows.map((r) => r.sid));
  }
  return { templates, creatureSkills };
}
