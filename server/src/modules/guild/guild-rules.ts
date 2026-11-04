// Pure guild rules (no Nest, no Mongo): create gates incl. the single-wallet rule, who may kick / appoint, contribution parking
// and restore, member note, contribMoney argument parsing. Permission flags and formulas live in @mc/shared (guild.ts).

import { GuildLimits, GuildRank, rankCan, type GuildRankRow, type MoneyKey } from '@mc/shared';
import type { SkillLevel } from './guild.schema';

/** Bound silver first; one wallet alone must cover the cost (Go: the two are never summed). */
export function chooseCreateWallet(moneyBind: number, money: number): MoneyKey | null {
  if (moneyBind >= GuildLimits.CREATE_COST) return 'moneyBind';
  if (money >= GuildLimits.CREATE_COST) return 'money';
  return null;
}

export interface CreateState {
  level: number;
  moneyBind: number;
  money: number;
  isMember: boolean;
  hasApplication: boolean;
  nameTaken: boolean;
}

/** First failing create gate as player text, or null. Order follows Go (level, funds, name, already in a guild). */
export function createGate(s: CreateState): string | null {
  if (s.level < GuildLimits.CREATE_LEVEL) return `Cần đạt cấp ${GuildLimits.CREATE_LEVEL} để lập bang hội`;
  if (chooseCreateWallet(s.moneyBind, s.money) === null) return 'Bạc không đủ, không thể tạo!';
  if (s.isMember || s.hasApplication) return 'Bạn đã gửi lời xin gia nhập bang hoặc đã gia nhập bang, không thể tạo bang nữa!';
  if (s.nameTaken) return 'Tên bang bạn điền đã tồn tại, vui lòng điền lại!';
  return null;
}

export interface Contribution {
  normal: number;
  donate: number;
}

/** A parked contribution plus the guild skills the member had learned (restored on the next join). */
export interface Restore extends Contribution {
  skills: SkillLevel[];
}

/** 90 % of a leaving member's contribution is parked for the next join (floor). */
export function parkContribution(c: Contribution): Contribution {
  const keep = (v: number): number => Math.floor((Math.max(0, v) * GuildLimits.RESTORE_PERCENT) / 100);
  return { normal: keep(c.normal), donate: keep(c.donate) };
}

/** Adds a newly parked amount to one already waiting (a player can leave twice without joining in between). */
export function mergeParked(waiting: Contribution | null, add: Contribution): Contribution {
  return { normal: (waiting?.normal ?? 0) + add.normal, donate: (waiting?.donate ?? 0) + add.donate };
}

/** Kick: needs canDel, never the leader, never an applicant (refuse instead), only strictly lower ranks. */
export function canKick(rows: readonly GuildRankRow[], actorRank: number, targetRank: number): boolean {
  if (!rankCan(rows, actorRank, 'canDel')) return false;
  if (targetRank === GuildRank.LEADER || targetRank === GuildRank.APPLICANT) return false;
  return targetRank > actorRank;
}

/** Appoint (updateGuildMember rank): needs canDuty, new rank 2..6, the target is a member below the actor, and no rank above the actor's own. */
export function canAppoint(rows: readonly GuildRankRow[], actorRank: number, targetRank: number, newRank: number): boolean {
  if (!rankCan(rows, actorRank, 'canDuty')) return false;
  if (!Number.isInteger(newRank) || newRank < 2 || newRank > GuildRank.MEMBER) return false;
  if (targetRank === GuildRank.LEADER || targetRank === GuildRank.APPLICANT) return false;
  return targetRank > actorRank && newRank > actorRank;
}

/** Member `note` column of the wire row: "name|classId|exp". */
export function memberNote(name: string, classId: number, exp: number): string {
  return `${name}|${classId}|${exp}`;
}

/** Validates the `contribMoney` argument {s, g}: silver a multiple of 1000, gold >= 0, something donated. Returns the bad field name on failure. */
export function parseContribMoney(raw: unknown): { silver: number; gold: number } | string {
  if (typeof raw !== 'object' || raw === null) return 's';
  const o = raw as Record<string, unknown>;
  const silver = Number(o.s ?? 0);
  const gold = Number(o.g ?? 0);
  if (!Number.isInteger(silver) || silver < 0 || silver > 2_000_000_000) return 's';
  if (!Number.isInteger(gold) || gold < 0 || gold > 1_000_000) return 'g';
  if (silver % GuildLimits.MONEY_STEP !== 0) return 's';
  if (silver + gold === 0) return 's';
  return { silver, gold };
}
