// Pure skill-command planning (phase C): turns a skill template + the caster's MP into a SkillCast, a basic-attack fallback
// (not enough MP, Go turn_executor) or a refusal (passive / unsupported type). Numbers follow the Go adapter: base 10, mult 1.0.

import { skillCategory, skillMpCost, type SkillCategory } from '@mc/shared';
import type { SkillTemplate } from '../gamedata/skill-data';
import type { SkillCast } from './battle.types';

export type CastPlan =
  | { kind: 'cast'; cast: SkillCast }
  | { kind: 'basic' } // not enough MP: the command becomes a basic attack, nothing is spent
  | { kind: 'refused'; reason: 'passive' | 'unsupported' };

export function planCast(tpl: SkillTemplate, mp: number, mpMax: number): CastPlan {
  const category: SkillCategory = skillCategory(tpl.type);
  if (category === 'passive') return { kind: 'refused', reason: 'passive' };
  if (category === 'buff') return { kind: 'refused', reason: 'unsupported' };
  const mpCost = skillMpCost(tpl.useMp, mpMax);
  if (mpCost > mp) return { kind: 'basic' };
  return {
    kind: 'cast',
    cast: {
      name: tpl.name, category, mpCost,
      spec: { magic: category === 'magic' || category === 'heal', mult: tpl.mult, base: tpl.base, ranged: category !== 'melee' },
    },
  };
}
