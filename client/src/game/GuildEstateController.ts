// Guild phase B client wiring: the bank / skills / extension actions behind the guild window, the guild building layer on the
// guild map and the pushes that feed them (onAddGuildSlot, onDelGuildSlot, onGuildSkillDeveloped, onCreateBuild, reloadBuild,
// onShowGuildWarehouse, onShowDonatePanel, onShowGuildSkillPanel, onShowExtInfo, onShowBuildProcess). Calls are fire-and-forget;
// a refusal arrives as a rejected call and becomes a toast. GuildController owns this and exposes `buildings` to GameScene.

import type { Container } from 'pixi.js';
import {
  GUILD_MAP_ID, GuildExtend, type BuildExtInfo, type BuildProcess, type BuildingObj, type GuildSkillState, type GuildSlot,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { closeBuildDialog, openExtInfo, openProcess, type BuildActions } from '../ui/guild/guildBuildDialog';
import type { EstateActions, GuildState } from '../ui/guild/guildState';
import { toast } from '../ui/screens';
import { GuildBuildingLayer } from './GuildBuildingLayer';

export interface EstateHost {
  client: GameClient;
  state: GuildState;
  entities: Container;
  render(): void;
  showTab(tab: 'bank' | 'donate' | 'skills'): void;
}

export class GuildEstateController {
  readonly buildings: GuildBuildingLayer;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: EstateHost) {
    const { client, state } = host;
    this.buildings = new GuildBuildingLayer(client, host.entities);
    const on = (name: string, fn: (...a: unknown[]) => void): void => {
      this.offs.push(client.on(name, fn));
    };
    on('onAddGuildSlot', (s) => { state.slots.set((s as GuildSlot).id, s as GuildSlot); host.render(); });
    on('onDelGuildSlot', (id) => { state.slots.delete(Number(id)); host.render(); });
    on('onGuildSkillDeveloped', (d) => this.onDeveloped((d as { skillDevData: Record<string, number> }).skillDevData));
    on('onShowGuildWarehouse', () => host.showTab('bank'));
    on('onShowDonatePanel', () => host.showTab('donate'));
    on('onShowGuildSkillPanel', (s) => { state.skillState = s as GuildSkillState; host.showTab('skills'); });
    on('onShowExtInfo', (i) => openExtInfo(i as BuildExtInfo, this.buildActions));
    on('onShowBuildProcess', (p) => openProcess(p as BuildProcess, this.buildActions));
    on('onCreateBuild', (o) => this.buildings.upsert(o as BuildingObj));
    on('reloadBuild', (o) => this.buildings.upsert(o as BuildingObj));
  }

  destroy(): void {
    for (const off of this.offs) off();
    closeBuildDialog();
    this.buildings.clear();
  }

  private call(method: string, ...args: unknown[]): Promise<unknown> {
    return this.host.client.call(method, ...args).catch((e) => {
      toast((e as Error).message, true);
      return null;
    });
  }

  private onDeveloped(dev: Record<string, number>): void {
    const { state } = this.host;
    state.skillDev = dev;
    if (state.skillState) state.skillState.skillDevData = dev;
    this.host.render();
  }

  private readonly buildActions: BuildActions = {
    construct: (bid, tid, mode) => void this.call('constructBuild', bid, tid, mode, GUILD_MAP_ID),
    finish: (bid, create) => void this.call(create ? 'finishCreate' : 'finishUpgrade', bid),
    reset: (bid) => void this.call('resetConstruction', bid),
  };

  readonly actions: EstateActions = {
    loadBank: () => void this.call('getInitGuildSlot').then((m) => {
      if (!m) return;
      this.host.state.slots = new Map(Object.values(m as Record<string, GuildSlot>).map((s) => [s.id, s]));
      this.host.state.bankLoaded = true;
      this.host.render();
    }),
    moveSlot: (from, to) => void this.call('moveGuildItem', from, to),
    dropSlot: (s) => askConfirm('Xác nhận hủy vật phẩm này?', () => void this.call('dropGuildItem', s.id)),
    withdraw: (s, num) => void this.call('withdrawGuildItem', s.id, num),
    levelUp: () => this.leaderCall('Xác nhận thăng cấp bang hội (nâng cấp Đại sảnh)?', 'guildLevelUp'),
    addMembers: () => this.leaderCall(`Xác nhận mở thêm ${GuildExtend.MEMBER_STEP} chỗ thành viên?`, 'addMaxGuildMemberNum'),
    addBankPage: () => this.leaderCall('Xác nhận mở thêm một trang kho bang?', 'addGuildBankSlotNum'),
    loadSkills: () => void this.call('getGuildPrivateSkillData').then((s) => {
      if (!s) return;
      this.host.state.skillState = s as GuildSkillState;
      this.host.render();
    }),
    develop: (sid) => {
      const gid = this.host.state.myGuild?.id;
      if (gid) void this.call('developSkill', { gid, sid });
    },
    learn: (sid) => {
      const level = this.host.state.skillState?.catalog.flatMap((c) => c.levels).find((l) => l.sid === sid)?.level ?? 1;
      void this.call(level <= 1 ? 'addGuildSkill' : 'improveGuildSkill', sid).then(() => this.actions.loadSkills());
    },
  };

  private leaderCall(text: string, method: string): void {
    const gid = this.host.state.myGuild?.id;
    if (gid) askConfirm(text, () => void this.call(method, gid));
  }
}
