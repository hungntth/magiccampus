// Guild client wiring (M6 phase A): owns GuildState, the guild window (HUD union button / E key) and every guild push
// (onInitViewGuildP, onInitGuildList, onAddGuild, onUpdateGuild, onAddGuildMember, onConfirmGuildApply, onDelGuildMember,
// onUpdateGuildMember, onDemise, onUpdateGuildRank, onUpdateGuildProperty, onChangeGuildName, onDelGuild, onUpdateNumProp,
// onUpdateGuildBankStock). Calls are fire-and-forget like Flash; refusals arrive as rejected calls and become toasts.
// Phase B (bank, skills, buildings) lives in GuildEstateController, owned here.

import type { Container } from 'pixi.js';
import {
  GuildLeaveType, GuildNumProp, GuildRank, GUILD_FLAGS,
  type ConfirmGuildApplyPush, type BagItem, type DelGuildMemberPush, type DemisePush, type GuildBankStock, type GuildListEntry,
  type GuildMember, type InitViewGuildP, type PlayerData, type PlayerUpdate, type UpdateGuildMemberPush, type UpdateNumProp,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { openCreateDialog } from '../ui/guild/guildCreateDialog';
import { GuildPanel } from '../ui/guild/guildPanel';
import { GuildState, type GuildActions } from '../ui/guild/guildState';
import { toast } from '../ui/screens';
import { GuildEstateController } from './GuildEstateController';
import type { GuildBuildingLayer } from './GuildBuildingLayer';

export interface GuildHost {
  client: GameClient;
  player: PlayerData;
  bagItems(): BagItem[];
  entities: Container;
}

export class GuildController {
  readonly state: GuildState;
  private readonly panel: GuildPanel;
  private readonly estate: GuildEstateController;
  private closeCreate: (() => void) | null = null;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: GuildHost) {
    const { client, player } = host;
    this.state = new GuildState(player.id);
    if (player.guild) this.state.myGuild = player.guild;
    this.estate = new GuildEstateController({
      client, state: this.state, entities: host.entities, render: () => this.panel.render(), showTab: (t) => this.panel.show(t),
    });
    this.panel = new GuildPanel(
      () => ({ state: this.state, actions: this.actions, estate: this.estate.actions, player, bagItems: () => host.bagItems(), rerender: () => this.panel.render() }),
      () => this.initView(),
      (tab) => {
        if (tab === 'list') this.actions.refreshList();
        else if (tab === 'bank') this.estate.actions.loadBank();
        else if (tab === 'skills') this.estate.actions.loadSkills();
      },
    );
    const on = (name: string, fn: (...a: unknown[]) => void): void => {
      this.offs.push(client.on(name, fn));
    };
    on('onInitViewGuildP', (d) => this.onInit(d as InitViewGuildP));
    on('onInitGuildList', (d) => this.onList(d as Record<string, GuildListEntry>));
    on('onAddGuild', (d) => this.onAddGuild(d as GuildListEntry));
    on('onUpdateGuild', (gid, key, value) => this.onUpdateGuild(Number(gid), String(key), String(value)));
    on('onAddGuildMember', (d) => this.onAddMember(d as GuildMember));
    on('onConfirmGuildApply', (d) => this.onConfirm(d as ConfirmGuildApplyPush));
    on('onDelGuildMember', (d) => this.onDelMember(d as DelGuildMemberPush));
    on('onUpdateGuildMember', (d) => this.onUpdateMember(d as UpdateGuildMemberPush));
    on('onDemise', (d) => this.onDemise(d as DemisePush));
    on('onUpdateGuildRank', (gid, obj) => this.onRank(Number(gid), obj as Record<string, unknown>));
    on('onUpdateGuildProperty', (d) => this.onProperty(d as Record<string, unknown>));
    on('onChangeGuildName', (name) => this.onRename(String(name)));
    on('onDelGuild', (gid) => this.onDelGuild(Number(gid)));
    on('onUpdateNumProp', (d) => this.onNum(d as UpdateNumProp));
    on('onUPP', (d) => this.onShopSpend(d as PlayerUpdate));
    on('onUpdateGuildBankStock', (d) => { this.state.bankStock = d as GuildBankStock[]; this.panel.render(); });
  }

  /** The guild building layer (GameScene hands it to the portal layer, which drives its scene lifecycle). */
  get buildings(): GuildBuildingLayer {
    return this.estate.buildings;
  }

  destroy(): void {
    this.estate.destroy();
    for (const off of this.offs) off();
    this.closeCreate?.();
    this.panel.close();
  }

  /** HUD union button / E key. */
  toggle(): void {
    if (this.panel.isOpen) this.panel.close();
    else this.panel.show();
  }

  private call(method: string, ...args: unknown[]): void {
    void this.host.client.call(method, ...args).catch((e) => toast((e as Error).message, true));
  }

  private initView(): void {
    this.call('initViewGuildP');
  }

  private readonly actions: GuildActions = {
    openCreate: () => {
      if (this.closeCreate) return;
      const p = this.host.player;
      this.closeCreate = openCreateDialog({
        level: p.level, money: p.money, moneyBind: p.moneyBind,
        submit: (name) => this.call('addGuild', { name }),
        onClose: () => { this.closeCreate = null; },
      });
    },
    refreshList: () => this.call('initGuildList'),
    apply: (gid) => askConfirm('Xác nhận xin gia nhập bang này?', () => this.call('addGuildMember', { gid })),
    confirm: (m) => askConfirm(`Xác nhận cho phép ${m.name} gia nhập?`, () =>
      this.call('confirmGuildApply', { tableId: m.id, newData: GuildRank.MEMBER, updateType: 'rank' })),
    refuse: (m) => this.call('refuseGuildMember', m.id),
    kick: (m) => askConfirm('Xác nhận trục xuất thành viên này?', () => this.call('kickGuildMember', m.id)),
    quit: () => {
      const me = this.state.me();
      if (!me) return;
      if (me.rank === GuildRank.APPLICANT) this.call('quitGuild', me.id);
      else askConfirm('Xác nhận rời khỏi bang hội? Điểm cống hiến sẽ về 0 (hoàn lại 90% khi gia nhập lại).', () => this.call('quitGuild', me.id));
    },
    disband: () => askConfirm('Xác nhận giải tán bang hội? Điểm cống hiến của mọi thành viên sẽ về 0.', () => this.call('delGuild')),
    demise: (m) => askConfirm(`Xác nhận cấp ${this.state.rankName(GuildRank.LEADER)} cho ${m.name}?`, () => this.call('demiseTo', m.cid)),
    appoint: (m, rank) => askConfirm(`Xác nhận Thăng làm ${this.state.rankName(rank)} ${m.name}?`, () =>
      this.call('updateGuildMember', { tableId: m.id, newData: rank, updateType: 'rank' })),
    setNotice: (text) => {
      const g = this.state.myGuild;
      if (g) this.call('updateGuildNotice', g.id, text);
    },
    rename: (name) => this.call('changeGuildName', name),
    saveRanks: (flat) => this.call('updateGuildRank', flat),
    donateMoney: (s, g) => askConfirm('Xác nhận quyên góp?', () => this.call('contribMoney', { s, g })),
    donateMaterial: (item, num) => askConfirm('Xác nhận quyên góp?', () => this.call('contribMaterial', { num, slotId: item.id })),
  };

  private onInit(p: InitViewGuildP): void {
    this.state.apply(p);
    this.host.player.guild = p.myGuild;
    this.host.player.gData = this.state.me();
    this.panel.render();
  }

  private onList(map: Record<string, GuildListEntry>): void {
    this.state.list = new Map(Object.values(map).map((g) => [g.id, g]));
    this.state.listLoaded = true;
    this.panel.render();
  }

  private onAddGuild(g: GuildListEntry): void {
    this.state.list.set(g.id, g);
    this.panel.render();
  }

  private onUpdateGuild(gid: number, key: string, value: string): void {
    const e = this.state.list.get(gid);
    if (e && key === 'name') e.name = value;
    if (this.state.myGuild?.id === gid && key === 'name') this.state.myGuild.name = value;
    this.panel.render();
  }

  private onAddMember(m: GuildMember): void {
    if (m.cid === this.state.selfCid) {
      this.initView();
      return;
    }
    if (this.state.myGuild?.id !== m.gid || this.state.applyList.some((a) => a.id === m.id)) return;
    this.state.applyList.push(m);
    this.panel.render();
  }

  private onConfirm(p: ConfirmGuildApplyPush): void {
    if (p.cid === this.state.selfCid) {
      toast('Bạn đã được nhận vào bang hội');
      this.initView();
      return;
    }
    if (this.state.myGuild?.id !== p.gid) return;
    this.state.applyList = this.state.applyList.filter((a) => a.id !== p.tableId);
    this.state.members.set(p.gData.id, p.gData);
    this.state.myGuild.memberNumber += 1;
    this.panel.render();
  }

  private onDelMember(p: DelGuildMemberPush): void {
    if (p.cid === this.state.selfCid) {
      toast(p.type === GuildLeaveType.REFUSE ? 'Lời xin gia nhập đã bị từ chối' : p.type === GuildLeaveType.KICK ? 'Bạn đã bị trục xuất khỏi bang hội' : 'Bạn đã rời bang hội');
      this.state.clear();
      this.host.player.guild = null;
      this.host.player.gData = null;
      this.initView();
      return;
    }
    if (this.state.myGuild?.id !== p.gid) return;
    this.state.members.delete(p.id);
    this.state.applyList = this.state.applyList.filter((a) => a.id !== p.id);
    if (p.type === GuildLeaveType.KICK || p.type === GuildLeaveType.QUIT) this.state.myGuild.memberNumber -= 1;
    this.panel.render();
  }

  private onUpdateMember(p: UpdateGuildMemberPush): void {
    const m = this.state.members.get(p.tableId);
    if (m) m.rank = p.newData;
    this.panel.render();
  }

  private onDemise(p: DemisePush): void {
    for (const m of this.state.members.values()) {
      if (m.cid === p.newCid) m.rank = GuildRank.LEADER;
      else if (m.cid === p.oldCid) m.rank = GuildRank.MEMBER;
    }
    if (this.state.myGuild) {
      this.state.myGuild.cid = p.newCid;
      this.state.myGuild.ln = p.ln;
    }
    toast(`${p.ln} đã trở thành bang chủ mới`);
    this.panel.render();
  }

  private onRank(gid: number, obj: Record<string, unknown>): void {
    if (this.state.myGuild?.id !== gid) return;
    for (const r of this.state.ranks) {
      if (typeof obj[`name${r.rank}`] === 'string') r.name = obj[`name${r.rank}`] as string;
      for (const f of GUILD_FLAGS) {
        const v = obj[`${f}${r.rank}`];
        if (v !== undefined) r[f] = Number(v) === 1 ? 1 : 0;
      }
    }
    this.panel.render();
  }

  private onProperty(o: Record<string, unknown>): void {
    if (this.state.myGuild) Object.assign(this.state.myGuild, o);
    this.panel.render();
  }

  private onRename(name: string): void {
    if (this.state.myGuild) this.state.myGuild.name = name;
    toast(`Bang đã đổi tên thành: ${name}.`);
    this.panel.render();
  }

  private onDelGuild(gid: number): void {
    this.state.list.delete(gid);
    if (this.state.myGuild?.id === gid) {
      toast('Bạn đã giải tán bang hội');
      this.state.clear();
      this.host.player.guild = null;
      this.host.player.gData = null;
    }
    this.panel.render();
  }

  /** Guild shop purchase (M11 phase E): onUPP carries the member contribution after the spend. */
  private onShopSpend(u: PlayerUpdate): void {
    const me = this.state.me();
    if (!me || (u.guildContrib === undefined && u.donateContrib === undefined)) return;
    if (u.guildContrib !== undefined) me.normalContrib = u.guildContrib;
    if (u.donateContrib !== undefined) me.donateContrib = u.donateContrib;
    this.panel.render();
  }

  private onNum(p: UpdateNumProp): void {
    const g = this.state.myGuild;
    const me = this.state.me();
    if (p.type === GuildNumProp.MONEY && g) g.money += p.num;
    else if (p.type === GuildNumProp.EXP && g) g.exp += p.num;
    else if (me && p.cid === this.state.selfCid) {
      if (p.type === GuildNumProp.DONATE) me.donateContrib += p.num;
      else if (p.type === GuildNumProp.NORMAL) me.normalContrib += p.num;
      if (p.num > 0) toast(`Bạn nhận ${p.num} điểm cống hiến`);
    }
    this.panel.render();
  }
}
