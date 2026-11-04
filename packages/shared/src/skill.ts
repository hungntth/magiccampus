// Skill wire types (M2 phase C): the LearnedSkill DTO returned by initLearnedSkill() and the pure rules both sides share
// (skill type -> battle category, MP cost fraction vs absolute, the pre-check message).

/** One learned skill (legacy skillList entry); `sid` is the data_tbl_skill id. */
export interface LearnedSkill {
  sid: number;
  level: number;
  position: number; // hotbar position, 0 = none
  kind: number;
  name: string;
  type: number; // data_tbl_skill.type (GamePredef skill types: 1 close, 2 remote, 3 magic, 4 bullet, 5 recover, 11 passive ...)
  useMp: number; // < 1 = fraction of max MP, >= 1 absolute
  iconCode: string;
  targetType: number; // Battle.as TARGET_*: 4 enemy, 2 self player, 8 team ...
}

export const SKILL_TYPE_PASSIVE = 11;

/** How a skill resolves in a solo battle (Go skill_adapter mapping, server research 3.7). */
export type SkillCategory = 'melee' | 'ranged' | 'magic' | 'heal' | 'buff' | 'passive';

export function skillCategory(type: number): SkillCategory {
  switch (type) {
    case 1: return 'melee'; // physical, approaches the target
    case 2:
    case 8: return 'ranged'; // physical, cast in place
    case 3:
    case 4: return 'magic';
    case 5:
    case 9: return 'heal';
    case 6:
    case 7:
    case 10: return 'buff'; // status effects are out of M2
    case SKILL_TYPE_PASSIVE: return 'passive';
    default: return 'ranged'; // Go: any other type is physical, range 2
  }
}

/** Skills the battle menu offers and the server accepts as a -50 command. */
export const isBattleSkill = (type: number): boolean => {
  const c = skillCategory(type);
  return c !== 'passive' && c !== 'buff';
};

/** Skills that pick an enemy target (the rest act on the caster). */
export const skillTargetsEnemy = (type: number): boolean => {
  const c = skillCategory(type);
  return c === 'melee' || c === 'ranged' || c === 'magic';
};

/** MP spent by a cast: `useMp` in (0, 1) is a fraction of the final max MP (at least 1), >= 1 is absolute. */
export function skillMpCost(useMp: number, mpMax: number): number {
  if (!(useMp > 0)) return 0;
  if (useMp < 1) return Math.max(1, Math.ceil(useMp * mpMax));
  return Math.floor(useMp);
}

/** Tooltip text: "10" or "5%". */
export const skillMpLabel = (useMp: number): string => (useMp > 0 && useMp < 1 ? `${Math.round(useMp * 100)}%` : String(Math.floor(useMp)));

/** Language.as CORE_S[6] + name + CORE_S[7]. */
export const skillNoMpMessage = (name: string): string => `MP không đủ, không thể sử dụng kỹ năng [${name}] `;
