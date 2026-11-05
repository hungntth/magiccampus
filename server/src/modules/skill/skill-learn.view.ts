// Skill window rows (getSkillLearnList, M9 phase B): learned skills of tabs 0/1/3 with their next level's costs, unlearned
// level-1 class rows the level allows, and every Luyện chain (TRAINING_SKILL_ORDER). Pure; Flash SkillManager.as:1160-1300.

import { SKILL_REQ_REBIRTH, SkillUseEnv, TRAINING_SKILL_ORDER, type SkillLearnView } from '@mc/shared';
import type { SkillIndex, SkillTemplate } from '../gamedata/skill-data';
import { skillNameKey } from './skill-learn.rules';

const TABS: ReadonlySet<number> = new Set([SkillUseEnv.ACTIVE, SkillUseEnv.PASSIVE, SkillUseEnv.TRAINING]);

export interface ViewInput {
  level: number;
  classId: number;
  learned: readonly { skillId: number }[];
  lookup: (id: number) => SkillTemplate | undefined;
  index: SkillIndex;
  /** skill-name key -> book template { tid, name } */
  books: ReadonlyMap<string, { tid: number; name: string }>;
}

function view(tpl: SkillTemplate, learned: boolean, next: SkillTemplate | null, books: ViewInput['books']): SkillLearnView {
  const cost = learned ? next : tpl;
  const book = !learned && tpl.useEnv !== SkillUseEnv.TRAINING ? books.get(skillNameKey(tpl.name)) : undefined;
  return {
    sid: tpl.id, nextSid: learned ? (next?.id ?? 0) : tpl.id, name: tpl.name, level: learned ? tpl.level : 0, useEnv: tpl.useEnv,
    kind: tpl.kind, type: tpl.type, iconCode: tpl.iconCode, learned,
    reqLevel: cost?.reqLevel ?? 0, reqCl: cost?.reqCl ?? 0, expSkill: cost?.expSkill ?? 0, price: cost?.price ?? 0,
    bookTid: book?.tid ?? 0, bookName: book?.name ?? '', description: (cost ?? tpl).description, useMp: tpl.useMp, targetType: tpl.targetType,
  };
}

const nextOf = (idx: SkillIndex, tpl: SkillTemplate): SkillTemplate | null =>
  (tpl.codeName ? idx.byCode.get(tpl.codeName)?.find((t) => t.level === tpl.level + 1) : undefined) ?? null;

export function buildLearnList(inp: ViewInput): SkillLearnView[] {
  const out: SkillLearnView[] = [];
  const ownedCodes = new Set<string>();
  for (const row of inp.learned) {
    const tpl = inp.lookup(row.skillId);
    if (!tpl) continue;
    if (tpl.codeName) ownedCodes.add(tpl.codeName);
    if (TABS.has(tpl.useEnv)) out.push(view(tpl, true, nextOf(inp.index, tpl), inp.books));
  }
  const seen = new Set<string>();
  const training: SkillTemplate[] = [];
  for (const tpl of inp.index.level1) {
    if (!TABS.has(tpl.useEnv) || tpl.reqCl === SKILL_REQ_REBIRTH) continue;
    const code = tpl.codeName || `#${tpl.id}`;
    if (ownedCodes.has(code) || seen.has(code)) continue;
    if (tpl.useEnv === SkillUseEnv.TRAINING) {
      if (TRAINING_SKILL_ORDER[code] !== undefined) {
        seen.add(code);
        training.push(tpl);
      }
      continue;
    }
    if (!tpl.reqClass.includes(inp.classId) || tpl.reqLevel > inp.level) continue;
    seen.add(code);
    out.push(view(tpl, false, null, inp.books));
  }
  training.sort((a, b) => (TRAINING_SKILL_ORDER[a.codeName] ?? 99) - (TRAINING_SKILL_ORDER[b.codeName] ?? 99));
  for (const tpl of training) out.push(view(tpl, false, null, inp.books));
  return out;
}
