// Pure skill helpers: the start_skill pipe list and the row -> LearnedSkill mapping.

import type { LearnedSkill } from '@mc/shared';
import type { SkillTemplate } from '../gamedata/skill-data';

/** `data_tbl_class.start_skill`, e.g. "1010|1086" -> [1010, 1086]; junk and duplicates are dropped. */
export function parseStartSkills(raw: unknown): number[] {
  const out: number[] = [];
  for (const part of String(raw ?? '').split('|')) {
    const id = Number(part.trim());
    if (part.trim() !== '' && Number.isInteger(id) && id > 0 && !out.includes(id)) out.push(id);
  }
  return out;
}

export function toLearnedSkill(row: { skillId: number; level: number; position: number }, tpl: SkillTemplate): LearnedSkill {
  return {
    sid: row.skillId, level: row.level, position: row.position, kind: tpl.kind, name: tpl.name, type: tpl.type,
    useMp: tpl.useMp, iconCode: tpl.iconCode, targetType: tpl.targetType,
  };
}
