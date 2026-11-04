// Guild skills (M6 phase B): wire types and pure rules. Skills are data_tbl_skill rows with use_env 4 (chain = code_name without a
// trailing "NO", levels 1..10). The leader develops a level with guild exp + money (developSkill, level <= guild level); members learn
// it with personal contribution (addGuildSkill for level 1, improveGuildSkill for the next). The passive effect is the row's buff.
// RPCs: developSkill, getGuildPrivateSkillData, addGuildSkill, improveGuildSkill. Push: onGuildSkillDeveloped({gid, sid, skillDevData}).

export const GUILD_SKILL = { USE_ENV: 4, MAX_LEVEL: 10 } as const;

export interface GuildSkillRow {
  id: number;
  chain: string;
  level: number;
  name: string;
  description: string;
  iconCode: string;
  devExp: number;
  devMoney: number;
  contrib: number;
  buffId: number;
  reqLevel: number;
  /** Empty = every class. */
  reqClasses: number[];
}

/** One learnable level in the skill catalog the client lists. */
export interface GuildSkillLevel {
  sid: number;
  level: number;
  devExp: number;
  devMoney: number;
  contrib: number;
  reqLevel: number;
  description: string;
}

export interface GuildSkillCatalogEntry {
  chain: string;
  name: string;
  iconCode: string;
  levels: GuildSkillLevel[];
}

/** Reply of `getGuildPrivateSkillData` (H5 shape): guild-developed levels, own learned levels (both `{templateId: level}`) and the catalog. */
export interface GuildSkillState {
  gid: number;
  skillDevData: Record<string, number>;
  learned: Record<string, number>;
  catalog: GuildSkillCatalogEntry[];
}

export interface GuildLearnedSkill {
  chain: string;
  sid: number;
  level: number;
}

/** Chain key of a skill code_name ("SKILL700101NO" and "SKILL700101" are one chain). */
export const skillChainKey = (codeName: string): string => codeName.replace(/NO$/, '');

export interface DevelopCheck {
  row: GuildSkillRow | undefined;
  guildLevel: number;
  developedLevel: number;
  guildExp: number;
  guildMoney: number;
}

/** Leader `developSkill` gate: next level only, level <= guild level, funds in guild exp and money. */
export function developError(c: DevelopCheck): string | null {
  const r = c.row;
  if (!r) return 'Kỹ năng không tồn tại';
  if (r.level !== c.developedLevel + 1) return 'Không thể mở kỹ năng mới';
  if (r.level > GUILD_SKILL.MAX_LEVEL || r.level > c.guildLevel) return 'Cấp bang hội chưa đủ';
  if (c.guildExp < r.devExp) return 'Kinh nghiệm bang hội không đủ';
  if (c.guildMoney < r.devMoney) return 'Tiền bang hội không đủ';
  return null;
}

export interface LearnCheck {
  row: GuildSkillRow | undefined;
  guildLevel: number;
  developedLevel: number;
  learnedLevel: number;
  contribTotal: number;
  charLevel: number;
  classId: number;
}

/** Member `addGuildSkill` / `improveGuildSkill` gate: next level only, up to the developed level and guild level, cost in contribution. */
export function learnError(c: LearnCheck): string | null {
  const r = c.row;
  if (!r) return 'Kỹ năng không tồn tại';
  if (r.level !== c.learnedLevel + 1) return 'Không thể học kỹ năng này';
  if (r.level > c.developedLevel) return 'Bang hội chưa mở cấp kỹ năng này';
  if (r.level > c.guildLevel) return 'Cấp bang hội chưa đủ';
  if (c.charLevel < r.reqLevel) return 'Cấp độ nhân vật chưa đủ';
  if (r.reqClasses.length > 0 && !r.reqClasses.includes(c.classId)) return 'Nghề nghiệp không phù hợp';
  if (c.contribTotal < r.contrib) return 'Điểm cống hiến không đủ';
  return null;
}

/** Pays a contribution cost from the normal points first, then the donate points; null when the total falls short. */
export function spendContribution(normal: number, donate: number, cost: number): { normal: number; donate: number } | null {
  if (normal + donate < cost) return null;
  const fromNormal = Math.min(normal, cost);
  return { normal: fromNormal, donate: cost - fromNormal };
}

/** The effect level of each learned skill: never above what the current guild has developed (a fresh guild gives nothing). */
export function effectiveSkills(learned: readonly GuildLearnedSkill[], developed: Readonly<Record<string, number>>): { chain: string; level: number }[] {
  const out: { chain: string; level: number }[] = [];
  for (const l of learned) {
    const level = Math.min(l.level, developed[l.chain] ?? 0);
    if (level > 0) out.push({ chain: l.chain, level });
  }
  return out;
}

/** `{templateId of the highest level: level}` per chain: the `skillDevData` / private data wire shape. */
export function skillDataMap(levels: Readonly<Record<string, number>>, sidOf: (chain: string, level: number) => number | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [chain, level] of Object.entries(levels)) {
    const sid = sidOf(chain, level);
    if (sid !== undefined && level > 0) out[String(sid)] = level;
  }
  return out;
}
