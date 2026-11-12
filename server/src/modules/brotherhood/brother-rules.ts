// Pure rules for Kết bái (Go application/brotherhood swear.go + handlers/brotherhood/npc_menu.go teamOnMap): team presence on the
// leader's map, swear / join / disband planning (size, level, groups, pair relations, fee), the silver split and the leave plan.
// No Mongo or sockets; Vietnamese refusal texts are the Go ones.

import { BROTHER, BrotherKind, RelationType, brotherFee } from '@mc/shared';

export interface Participant {
  id: number;
  name: string;
  /** Already a member of the group the ceremony adds to (or of the group being disbanded). */
  existing: boolean;
}

export interface TeamMember {
  id: number;
  name: string;
  level: number;
  /** Id of the group the character is in, null when none. */
  groupId: number | null;
}

/** A relationship row owned by `a` toward `b` (RelationType wire values). */
export interface PairRow {
  a: number;
  b: number;
  type: number;
}

export interface Presence {
  id: number;
  name: string;
  /** Map of the online session, null when offline. */
  mapId: number | null;
}

export type Planned<T> = ({ ok: true } & T) | { ok: false; text: string };

export interface SwearPlan {
  kind: typeof BrotherKind.SWEAR | typeof BrotherKind.JOIN;
  groupId: number;
  participants: Participant[];
  newcomers: Participant[];
  fee: number;
}

export interface DisbandPlan {
  kind: typeof BrotherKind.DISBAND;
  groupId: number;
  participants: Participant[];
}

export const TEXT = {
  noTeam: 'Hãy lập đội cùng những người bạn muốn kết bái, rồi để đội trưởng đến gặp ta.',
  notLeader: 'Chỉ đội trưởng mới có thể nói chuyện kết bái với ta.',
  offline: (name: string) => `${name} không trực tuyến.`,
  farAway: (name: string) => `${name} phải cùng có mặt ở đây.`,
  size: `Cần lập đội từ ${BROTHER.minMembers} đến ${BROTHER.maxMembers} người mới có thể kết bái.`,
  level: (name: string) => `${name} chưa đạt cấp ${BROTHER.minLevel}, chưa thể kết bái.`,
  mixedGroups: 'Trong đội có thành viên thuộc các nhóm kết bái khác nhau.',
  joinNeedsAll: 'Muốn thêm thành viên kết bái, tất cả huynh đệ trong nhóm phải cùng trong đội và có mặt ở đây.',
  already: 'Các ngươi đã là huynh đệ kết bái rồi.',
  disbandNeedsAll: 'Muốn giải tán nhóm kết bái, tất cả huynh đệ phải cùng trong đội và có mặt ở đây.',
  notFriends: (a: string, b: string) => `${a} và ${b} chưa là bạn bè, hãy kết bạn trước khi kết bái.`,
  hostile: (a: string, b: string) => `${a} và ${b} đang là kẻ thù hoặc đã chặn nhau, không thể kết bái.`,
  tutor: (a: string, b: string) => `${a} và ${b} đang là sư đồ, không thể kết bái.`,
  couple: (a: string, b: string) => `${a} và ${b} đang là vợ chồng, không thể kết bái.`,
  fee: (silver: number, n: number) => `Đội trưởng cần ${silver} bạc (2 triệu bạc x ${n} thành viên) để kết bái.`,
  noSilver: 'Đội trưởng không đủ bạc để kết bái.',
  noGold: 'Không đủ vàng.',
  taken: 'Có thành viên đã kết bái với nhóm khác.',
  notMember: 'Ngươi chưa kết bái với ai.',
  badTitle: 'Danh hiệu kết bái phải dài 1-8 ký tự và không chứa ký tự đặc biệt.',
} as const;

/** Leader-only presence check of the NPC handler: the caller leads the party, every member is online on the leader's map. */
export function checkTeamOnMap(
  callerId: number, partyLeaderId: number | null, team: readonly Presence[], leaderMap: number,
): Planned<{ ids: number[] }> {
  if (partyLeaderId === null) return { ok: false, text: TEXT.noTeam };
  if (partyLeaderId !== callerId) return { ok: false, text: TEXT.notLeader };
  for (const m of team) {
    if (m.mapId === null) return { ok: false, text: TEXT.offline(m.name) };
    if (m.mapId !== leaderMap || m.mapId <= 0) return { ok: false, text: TEXT.farAway(m.name) };
  }
  return { ok: true, ids: team.map((m) => m.id) };
}

const pairKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** Relationship checks of the newcomer pairs: a hostile / tutor / couple row refuses, every pair needs a friend or brother row. */
function checkPairs(participants: readonly Participant[], rows: readonly PairRow[]): string | null {
  const name = (id: number): string => participants.find((p) => p.id === id)?.name ?? String(id);
  const friends = new Set<string>();
  for (const r of rows) {
    if (r.type === RelationType.FRIEND || r.type === RelationType.BROTHER) friends.add(pairKey(r.a, r.b));
    else if (r.type === RelationType.ENEMY || r.type === RelationType.BLACK) return TEXT.hostile(name(r.a), name(r.b));
    else if (r.type === RelationType.TUTOR) return TEXT.tutor(name(r.a), name(r.b));
    else if (r.type === RelationType.COUPLE) return TEXT.couple(name(r.a), name(r.b));
  }
  for (const [i, p] of participants.entries()) {
    for (const q of participants.slice(i + 1)) {
      if (p.existing && q.existing) continue;
      if (!friends.has(pairKey(p.id, q.id))) return TEXT.notFriends(p.name, q.name);
    }
  }
  return null;
}

export interface SwearInput {
  leaderId: number;
  team: readonly TeamMember[];
  /** Members of every group any team member belongs to (the planner refuses more than one group). */
  groups: ReadonlyMap<number, readonly number[]>;
  /** Rows between the team members (both directions). */
  rows: readonly PairRow[];
  /** Leader's moneyBind + money. */
  leaderSilver: number;
}

/** Swear (new group) or join (newcomers into the one existing group); `ok` carries who pays what. */
export function planSwear(input: SwearInput): Planned<SwearPlan> {
  const { team, leaderId } = input;
  if (team.length < BROTHER.minMembers || team.length > BROTHER.maxMembers) return { ok: false, text: TEXT.size };
  if (!team.some((m) => m.id === leaderId)) return { ok: false, text: TEXT.size };
  let groupId = 0;
  for (const m of team) {
    if (m.level < BROTHER.minLevel) return { ok: false, text: TEXT.level(m.name) };
    if (m.groupId !== null) {
      if (groupId !== 0 && groupId !== m.groupId) return { ok: false, text: TEXT.mixedGroups };
      groupId = m.groupId;
    }
  }
  const inTeam = new Set(team.map((m) => m.id));
  if (groupId !== 0) {
    const all = input.groups.get(groupId) ?? [];
    if (all.some((id) => !inTeam.has(id))) return { ok: false, text: TEXT.joinNeedsAll };
    if (team.length === all.length) return { ok: false, text: TEXT.already };
  }
  const participants = team.map((m): Participant => ({ id: m.id, name: m.name, existing: m.groupId !== null }));
  const bad = checkPairs(participants, input.rows);
  if (bad) return { ok: false, text: bad };
  const newcomers = participants.filter((p) => !p.existing);
  const fee = brotherFee(newcomers.length);
  if (input.leaderSilver < fee) return { ok: false, text: TEXT.fee(fee, newcomers.length) };
  return { ok: true, kind: groupId === 0 ? BrotherKind.SWEAR : BrotherKind.JOIN, groupId, participants, newcomers, fee };
}

/** Disband: every member of the leader's group must stand in the team. */
export function planDisband(group: { id: number; members: readonly { id: number; name: string }[] } | null, teamIds: readonly number[]): Planned<DisbandPlan> {
  if (!group) return { ok: false, text: TEXT.notMember };
  const inTeam = new Set(teamIds);
  if (group.members.some((m) => !inTeam.has(m.id))) return { ok: false, text: TEXT.disbandNeedsAll };
  return {
    ok: true, kind: BrotherKind.DISBAND, groupId: group.id,
    participants: group.members.map((m) => ({ id: m.id, name: m.name, existing: true })),
  };
}

/** moneyBind first, then money; null when the two together cannot cover the fee. */
export function silverSplit(moneyBind: number, money: number, fee: number): { bind: number; money: number } | null {
  if (moneyBind + money < fee) return null;
  const bind = Math.min(moneyBind, fee);
  return { bind, money: fee - bind };
}

export interface LeavePlan {
  dissolved: boolean;
  /** Characters that lose title 153: the leaver, or everybody when the group falls below two. */
  revokeIds: number[];
}

export function planLeave(memberIds: readonly number[], leaverId: number): LeavePlan {
  const dissolved = memberIds.length - 1 < BROTHER.minMembers;
  return { dissolved, revokeIds: dissolved ? [...memberIds] : [leaverId] };
}
