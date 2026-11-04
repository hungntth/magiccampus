// Guild wire types and pure rules shared by server and client (M6 phase A): ranks and permission flags, the 22-key guild
// object, member / list / snapshot payloads, push payloads, create-name validation and the contribution formulas.
// Push names are the GuildPanel.as consumers: onInitViewGuildP, onInitGuildList, onAddGuild, onAddGuildMember, onConfirmGuildApply,
// onDelGuildMember, onUpdateGuildMember, onDemise, onUpdateGuildRank(gid, obj), onUpdateGuildProperty, onUpdateGuild(gid, key, value),
// onChangeGuildName, onDelGuild, onUpdateNumProp, plus the H5-only onUpdateGuildBankStock (donated material totals).
// Phase B (bank, buildings, skills) types live in guildBank.ts / guildBuild.ts / guildSkill.ts.

import type { GuildSlot } from './guildBank.js';

export const GuildRank = { APPLICANT: -1, LEADER: 1, VICE: 2, MEMBER: 6 } as const;

/** Permission flags stored per rank (Flash UI checkboxes); rank 1 always has all, rank 6 none. */
export const GUILD_FLAGS = ['canAdd', 'canQuest', 'canSlot', 'canInfo', 'canDel', 'canDuty'] as const;
export type GuildFlag = (typeof GUILD_FLAGS)[number];

export const GuildLimits = {
  CREATE_LEVEL: 50,
  CREATE_COST: 1_000_000,
  NAME_MIN: 2,
  NAME_MAX: 10,
  START_MEMBERS: 50,
  RANK_NAME_MAX: 14,
  NOTICE_MAX: 200,
  /** Share of a member's contribution parked when they leave (restored on the next join). */
  RESTORE_PERCENT: 90,
  MONEY_STEP: 1000,
  GOLD_SILVER_RATE: 2000,
  CONTRIB_DIVISOR: 8,
} as const;

/** `onUpdateNumProp.type` (GamePredef GUILD_*): 1 donate contribution, 2 normal contribution, 3 guild money, 4 guild exp. */
export const GuildNumProp = { DONATE: 1, NORMAL: 2, MONEY: 3, EXP: 4 } as const;

/** `onDelGuildMember.type`: 1 kicked, 2 quit, 3 refused, 4 applicant gave up (no member count change). */
export const GuildLeaveType = { KICK: 1, QUIT: 2, REFUSE: 3, GIVE_UP: 4 } as const;

/** Guild material item templates (GamePredef GUILD_GENERAL_M / RARE_M / SPE_M). */
export const GuildMaterial = { GENERAL: 2026, RARE: 2027, SPECIAL: 2039 } as const;
export const COMMON_MATERIAL_TIDS: readonly number[] = [16, 7, 18, 22, 25, 27];
export const RARE_MATERIAL_TIDS: readonly number[] = [24, 21, 23, 26, 28];

export const GUILD_DEFAULT_RANK_NAMES = ['Bang chủ', 'Phó bang', 'Trưởng lão', 'Tinh anh', 'Thành viên cũ', 'Thành viên'] as const;

export interface GuildRankRow {
  id: number;
  rank: number;
  name: string;
  canAdd: 0 | 1;
  canQuest: 0 | 1;
  canSlot: 0 | 1;
  canInfo: 0 | 1;
  canDel: 0 | 1;
  canDuty: 0 | 1;
}

/** Member (and applicant, rank -1) row. `id` is the table id used by quit / kick / refuse / confirm; `note` is "name|classId|exp". */
export interface GuildMember {
  id: number;
  cid: number;
  gid: number;
  rank: number;
  status: number; // 1 online
  name: string;
  level: number;
  classId: number;
  note: string;
  normalContrib: number;
  donateContrib: number;
}

/** The 22-key guild object (Go Guild.ToDTO); ids and counters are numbers here (the Flash client accepts both). */
export interface GuildInfo {
  id: number;
  name: string;
  cid: number; // leader character id
  ln: string; // leader name
  level: number;
  exp: number;
  iconCode: string | null;
  money: number;
  guildInfo: string; // notice
  bagSlotNum: number;
  memLimit: number;
  dailyProduce: string;
  daliyCost: string; // sic
  moneyLimit: string;
  time: string | null;
  timeStamp: null;
  totalExp: number;
  skillData: string; // JSON string {"skillId": level}
  announcement: string;
  joinLevelReq: number;
  memberNumber: number;
  members: GuildMember[];
}

export interface GuildListEntry {
  id: number;
  name: string;
  ln: string;
  cid: number;
  memberNumber: number;
}

/** Donated guild materials counted per template (shown in the donate tab; derived from the bank slots since phase B). */
export interface GuildBankStock {
  tid: number;
  count: number;
}

/** Push `onInitViewGuildP`: `myGuild` is null when the character has no guild and no pending application. */
export interface InitViewGuildP {
  myGuild: GuildInfo | null;
  memberList: Record<string, GuildMember>;
  guildRank: GuildRankRow[];
  applyList: GuildMember[];
  skillDevData: Record<string, number>;
  bankStock: GuildBankStock[];
}

/** Extra login payload keys (research §5): own guild, own member row and the guild bank map. */
export interface GuildLoginInfo {
  guild: GuildInfo | null;
  gData: GuildMember | null;
  gi: Record<string, GuildSlot>;
}

export interface UpdateNumProp {
  type: number;
  num: number;
  cid: number;
}

export interface ConfirmGuildApplyPush {
  gid: number;
  tableId: number;
  cid: number;
  gData: GuildMember;
}

export interface DelGuildMemberPush {
  gid: number;
  id: number;
  cid: number;
  name: string;
  type: number;
}

export interface UpdateGuildMemberPush {
  tableId: number;
  updateType: 'rank';
  newData: number;
}

export interface DemisePush {
  gid: number;
  newCid: number;
  oldCid: number;
  ln: string;
}

/** `addGuildMember({gid})`, `addGuild({name})`. */
export interface AddGuildArgs {
  name: string;
}
export interface ConfirmGuildApplyArgs {
  tableId: number;
  newData: number;
  updateType: 'rank';
}
export interface UpdateGuildMemberArgs {
  tableId: number;
  newData: number;
  updateType: 'rank';
}
/** `contribMoney({g, s})`, `contribMaterial({num, slotId})`. */
export interface ContribMoneyArgs {
  g: number;
  s: number;
}
export interface ContribMaterialArgs {
  num: number;
  slotId: number;
}

const BAD_NAME_CHARS = /[&'"\-\\/|%\r\n\t\b\f\v<>@*]/;

/** Client Core.haveSpecialStr characters. */
export function hasSpecialChars(text: string): boolean {
  return BAD_NAME_CHARS.test(text);
}

/** Guild name gate (client AddGuildPanel + Core.haveSpecialStr): returns the refusal text or null when valid. */
export function guildNameError(raw: string): string | null {
  if (hasSpecialChars(raw)) return 'Chứa ký tự không hợp lệ, vui lòng điền lại!';
  const len = [...raw].length;
  if (len < GuildLimits.NAME_MIN) return 'Tên quá ngắn, vui lòng điền lại!';
  if (len > GuildLimits.NAME_MAX) return 'Tên quá dài, vui lòng điền lại!';
  return null;
}

/** Donated silver/gold to guild money (silver + gold * 2000). */
export function donateMoneyOf(silver: number, gold: number): number {
  return silver + gold * GuildLimits.GOLD_SILVER_RATE;
}

/** Member donate contribution (and guild exp) for silver/gold: floor((silver + gold*2000)/8) (client formula). */
export function donateContribOf(silver: number, gold: number): number {
  return Math.floor(donateMoneyOf(silver, gold) / GuildLimits.CONTRIB_DIVISOR);
}

export interface MaterialGrant {
  /** Guild material template that receives the stock (2026 common, 2027 rare, 2039 special). */
  guildTid: number;
  guildCount: number;
  contrib: number;
}

/** Client GuildContribPanel formulas; null when the template is not donatable. Colour is clamped to 1..8 (every seed has -1). */
export function materialGrant(tid: number, color: number, num: number): MaterialGrant | null {
  if (!Number.isInteger(num) || num <= 0) return null;
  const factor = Math.min(8, Math.max(1, Math.trunc(color))) ** 5;
  const d = GuildLimits.CONTRIB_DIVISOR;
  if (tid === GuildMaterial.SPECIAL) return { guildTid: tid, guildCount: num, contrib: num * 100 };
  if (COMMON_MATERIAL_TIDS.includes(tid)) {
    return { guildTid: GuildMaterial.GENERAL, guildCount: Math.floor((num * factor) / d), contrib: Math.floor((num * factor * 50) / d) };
  }
  if (RARE_MATERIAL_TIDS.includes(tid)) {
    return { guildTid: GuildMaterial.RARE, guildCount: Math.floor((num * factor) / d), contrib: Math.floor((num * factor * 100) / d) };
  }
  return null;
}

/** Rank settings a new guild starts with (Go DefaultRankSettings): ranks 1-2 all flags, 3 all but del/duty, 4 add/quest/info, 5 quest, 6 none. */
export function defaultRankRows(): GuildRankRow[] {
  const f = (a: number, q: number, s: number, i: number, d: number, u: number): Pick<GuildRankRow, GuildFlag> => ({
    canAdd: a as 0 | 1, canQuest: q as 0 | 1, canSlot: s as 0 | 1, canInfo: i as 0 | 1, canDel: d as 0 | 1, canDuty: u as 0 | 1,
  });
  const flags = [f(1, 1, 1, 1, 1, 1), f(1, 1, 1, 1, 1, 1), f(1, 1, 1, 1, 0, 0), f(1, 1, 0, 1, 0, 0), f(0, 1, 0, 0, 0, 0), f(0, 0, 0, 0, 0, 0)];
  return flags.map((fl, i) => ({ id: i + 1, rank: i + 1, name: GUILD_DEFAULT_RANK_NAMES[i], ...fl }));
}

/** True when `rank` may use `flag`: the leader always, applicants never, others by their rank row. */
export function rankCan(rows: readonly GuildRankRow[], rank: number, flag: GuildFlag): boolean {
  if (rank === GuildRank.LEADER) return true;
  if (rank < GuildRank.LEADER || rank > GuildRank.MEMBER) return false;
  return rows.find((r) => r.rank === rank)?.[flag] === 1;
}

/**
 * Parses the flat `updateGuildRank` object (name1..6, canAdd2..5 ...) over the current rows. Rank 1 keeps all flags and rank 6 none
 * (the Flash UI never edits them); names are trimmed, limited to 10 chars and fall back to the current name. Null on a non-object.
 */
export function parseRankUpdate(raw: unknown, current: readonly GuildRankRow[]): GuildRankRow[] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  return current.map((row) => {
    const n = o[`name${row.rank}`];
    const name = typeof n === 'string' && n.trim() ? [...n.trim()].slice(0, GuildLimits.RANK_NAME_MAX).join('') : row.name;
    if (row.rank === GuildRank.LEADER || row.rank === GuildRank.MEMBER) {
      const all = row.rank === GuildRank.LEADER ? 1 : 0;
      return { ...row, name, ...Object.fromEntries(GUILD_FLAGS.map((k) => [k, all])) } as GuildRankRow;
    }
    const flags = Object.fromEntries(GUILD_FLAGS.map((k) => [k, Number(o[`${k}${row.rank}`] ?? row[k]) === 1 ? 1 : 0]));
    return { ...row, name, ...flags } as GuildRankRow;
  });
}

/** The `onUpdateGuildRank` object (name1..6 and can*2..6) for a set of rows. */
export function rankRowsToPayload(rows: readonly GuildRankRow[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const r of rows) {
    out[`name${r.rank}`] = r.name;
    for (const k of GUILD_FLAGS) out[`${k}${r.rank}`] = r[k];
  }
  return out;
}
