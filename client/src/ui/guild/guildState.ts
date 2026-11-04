// Client-side guild model (own guild, members, ranks, applicants, list) and the context the tab renderers share.
// Pure data + helpers; GuildController fills it from onInitViewGuildP and the incremental pushes.

import {
  GuildRank, rankCan, type BagItem, type GuildBankStock, type GuildFlag, type GuildInfo, type GuildListEntry, type GuildMember,
  type GuildRankRow, type GuildSkillState, type GuildSlot, type InitViewGuildP, type PlayerData,
} from '@mc/shared';

export class GuildState {
  myGuild: GuildInfo | null = null;
  members = new Map<number, GuildMember>();
  applyList: GuildMember[] = [];
  ranks: GuildRankRow[] = [];
  bankStock: GuildBankStock[] = [];
  /** Phase B: bank slots (slot id -> slot; loaded with getInitGuildSlot), guild-developed skills and the own skill state. */
  slots = new Map<number, GuildSlot>();
  bankLoaded = false;
  skillDev: Record<string, number> = {};
  skillState: GuildSkillState | null = null;
  list = new Map<number, GuildListEntry>();
  listLoaded = false;

  constructor(private readonly selfId: number) {}

  get selfCid(): number {
    return this.selfId;
  }

  apply(p: InitViewGuildP): void {
    this.myGuild = p.myGuild;
    this.members = new Map(Object.values(p.memberList).map((m) => [m.id, m]));
    this.applyList = p.applyList;
    this.ranks = p.guildRank;
    this.bankStock = p.bankStock;
    this.skillDev = p.skillDevData;
  }

  clear(): void {
    this.myGuild = null;
    this.members.clear();
    this.applyList = [];
    this.ranks = [];
    this.bankStock = [];
    this.slots.clear();
    this.bankLoaded = false;
    this.skillDev = {};
    this.skillState = null;
  }

  /** Own member row (rank -1 while only an applicant). */
  me(): GuildMember | null {
    for (const m of this.members.values()) if (m.cid === this.selfId) return m;
    return null;
  }

  myRank(): number {
    return this.me()?.rank ?? 0;
  }

  isMember(): boolean {
    return this.myRank() >= GuildRank.LEADER;
  }

  isLeader(): boolean {
    return this.myRank() === GuildRank.LEADER;
  }

  can(flag: GuildFlag): boolean {
    return rankCan(this.ranks, this.myRank(), flag);
  }

  rankName(rank: number): string {
    return this.ranks.find((r) => r.rank === rank)?.name ?? `Cấp ${rank}`;
  }

  /** Members ordered leader first, then by rank and id. */
  sortedMembers(): GuildMember[] {
    return [...this.members.values()].filter((m) => m.rank !== GuildRank.APPLICANT).sort((a, b) => a.rank - b.rank || a.id - b.id);
  }
}

export interface GuildActions {
  openCreate(): void;
  refreshList(): void;
  apply(gid: number): void;
  confirm(m: GuildMember): void;
  refuse(m: GuildMember): void;
  kick(m: GuildMember): void;
  quit(): void;
  disband(): void;
  demise(m: GuildMember): void;
  appoint(m: GuildMember, rank: number): void;
  setNotice(text: string): void;
  rename(name: string): void;
  saveRanks(flat: Record<string, string | number>): void;
  donateMoney(silver: number, gold: number): void;
  donateMaterial(item: BagItem, num: number): void;
}

/** Phase B actions (bank, extensions, skills); the controller implements them with the guild RPCs. */
export interface EstateActions {
  loadBank(): void;
  moveSlot(fromSid: number, toSid: number): void;
  dropSlot(slot: GuildSlot): void;
  withdraw(slot: GuildSlot, num: number): void;
  levelUp(): void;
  addMembers(): void;
  addBankPage(): void;
  loadSkills(): void;
  develop(sid: number): void;
  learn(sid: number): void;
}

export interface GuildCtx {
  state: GuildState;
  actions: GuildActions;
  estate: EstateActions;
  player: PlayerData;
  bagItems(): BagItem[];
  rerender(): void;
}

export const el = <K extends 'div' | 'button' | 'span' | 'input' | 'textarea' | 'table' | 'tr' | 'td' | 'th' | 'label'>(
  tag: K, cls = '', text?: string,
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function button(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = el('button', 'guild-btn', label);
  b.disabled = disabled;
  b.onclick = onClick;
  return b;
}

/** Text input that keeps game hotkeys quiet while typing. */
export function field(placeholder: string, max: number, value = ''): HTMLInputElement {
  const i = el('input', 'guild-input');
  i.placeholder = placeholder;
  i.maxLength = max;
  i.value = value;
  i.onkeydown = (e) => e.stopPropagation();
  return i;
}
