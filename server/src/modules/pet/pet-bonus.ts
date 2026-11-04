// Pure pet bonus aggregation: equipped pet items (same stat lines as character gear: flat, then percent props 24/25) and
// passive skills (skill type 11 + buff_id -> the buff's six prop slots, percent when the buff `percent_flag` is 1).

import { buffBonuses } from '../buff/buff-stats';
import { equipBonuses } from '../inventory/equip-stats';
import type { SkillTemplate } from '../gamedata/skill-data';
import type { PetBonuses } from './pet-stats';

export const PASSIVE_SKILL_TYPE = 11;

export interface PetBonusLookups {
  skill(id: number): SkillTemplate | undefined;
  buff(id: number): Record<string, unknown> | undefined;
}

/** Buff templates of the learned passive skills (slots with a value > 0 whose skill is type 11 with a buff). */
export function passiveBuffs(skillIds: readonly number[], look: PetBonusLookups): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const id of skillIds) {
    if (!(id > 0)) continue;
    const s = look.skill(id);
    if (!s || s.type !== PASSIVE_SKILL_TYPE || s.buffId <= 0) continue;
    const buff = look.buff(s.buffId);
    if (buff) out.push(buff);
  }
  return out;
}

export function petBonuses(
  equipTemplates: readonly Record<string, unknown>[], skillIds: readonly number[], look: PetBonusLookups,
): PetBonuses {
  return { gear: equipBonuses(equipTemplates), passive: buffBonuses(passiveBuffs(skillIds, look)) };
}
