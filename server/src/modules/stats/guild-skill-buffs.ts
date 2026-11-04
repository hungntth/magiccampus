// Pure: which data_tbl_buff ids a member's learned guild skills give right now. The effect level of each skill never exceeds
// what the member's current guild developed (a fresh guild gives nothing); the buff is the skill row's `buff_id`.

import { effectiveSkills, type GuildLearnedSkill, type GuildSkillRow } from '@mc/shared';

export function guildSkillBuffIds(
  learned: readonly GuildLearnedSkill[], developed: Readonly<Record<string, number>>, chains: ReadonlyMap<string, readonly GuildSkillRow[]>,
): number[] {
  const out: number[] = [];
  for (const e of effectiveSkills(learned, developed)) {
    const row = chains.get(e.chain)?.find((r) => r.level === e.level);
    if (row && row.buffId > 0) out.push(row.buffId);
  }
  return out;
}
