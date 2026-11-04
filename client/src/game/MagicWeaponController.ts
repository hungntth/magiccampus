// Thần khí on the client: the operation window opened from the character panel's "Thần khí" tab. Tabs: Thăng cấp (mWeaponUpgrade,
// getMWPanel, bindItem), Phân giải (magicWeaponResolve), Sửa chữa (magicWeaponRepair / AllRepair), Kỹ năng (magicWeaponResetSkill),
// Chuyển TT (MWTrans), Tái lập TT (queryMWResetPropMax / magicWeaponResetProp, push updateMWResetView) and Tẩy luyện (activateMWPro).
// Refusals arrive as server toasts (onSystemMidMsgOrNote); reply messages are toasted here. getMWPanel is the H5 read for the numbers.

import {
  isMwPosition, MW, MW_STONE_TID, SlotType, type BagItem, type MWActivateReply, type MWPanelInfo, type MWRepairReply, type MWResetMaxReply,
  type MWResetPropReply, type MWResetSkillReply, type MWResolveReply, type MWTransReply, type MWUpgradeReply, type PlayerData,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { FeatureWindow } from '../ui/feature/featureWindow';
import { toast } from '../ui/screens';
import { renderRepair, renderResolve, renderUpgrade } from '../ui/mw/mwTabs';
import { renderResetProp, renderSkill, renderSuccinct, renderTrans } from '../ui/mw/mwTabs2';
import { MW_TABS, type MwCtx } from '../ui/mw/mwTypes';
import '../ui/mw/mw.css';

export interface MagicWeaponHost {
  client: GameClient;
  player: PlayerData;
  /** Bag and worn equipment (the controller keeps the magic weapons). */
  items(): BagItem[];
}

export class MagicWeaponController {
  private readonly win: FeatureWindow;
  private readonly offs: (() => void)[] = [];
  private selId: number | null = null;
  private sel: MWPanelInfo | null = null;
  private secondId: number | null = null;
  private second: MWPanelInfo | null = null;
  private resetMax: { n1: number; n2: number } | null = null;
  private skillPos = 1;
  private busy = false;
  private note = '';
  private seq = 0;

  constructor(private readonly host: MagicWeaponHost) {
    this.win = new FeatureWindow(
      { renderTab: (tab, body) => this.renderTab(tab, body), onTab: () => { this.note = ''; void this.load(); }, onClose: () => this.win.close() },
      { title: 'Thần khí', tabs: MW_TABS, cls: 'mw-window' },
    );
    this.offs.push(
      host.client.on('updateMWResetView', () => void this.load()),
      host.client.on('onUPP', () => this.win.render()),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.win.close();
  }

  get isOpen(): boolean {
    return this.win.isOpen;
  }

  toggle(): void {
    if (this.win.isOpen) this.win.close();
    else this.win.show();
    if (this.win.isOpen) this.refresh();
  }

  /** The bag / equipment changed: drop vanished selections, re-read the numbers. */
  refresh(): void {
    if (!this.win.isOpen) return;
    const ids = new Set(this.weapons().map((i) => i.id));
    if (this.selId !== null && !ids.has(this.selId)) this.selId = null;
    if (this.secondId !== null && !ids.has(this.secondId)) this.secondId = null;
    if (this.selId === null) this.selId = this.weapons()[0]?.id ?? null;
    void this.load();
  }

  /** Character panel "Sửa": repairs every worn magic weapon. */
  repairWorn(): void {
    const worn = this.weapons().filter((i) => i.slotType === SlotType.EQUIP);
    if (worn.length === 0) {
      toast('Chưa có thần khí nào đang mặc.', true);
      return;
    }
    void this.host.client.call('magicWeaponAllRepair', worn.map((i) => i.id), [this.stackId(MW_STONE_TID.repair)]).catch(() => undefined);
  }

  private weapons(): BagItem[] {
    return this.host.items().filter((i) => i.itemType === 2 && isMwPosition(i.position)).sort((a, b) => b.slotType - a.slotType || a.position - b.position);
  }

  private stackId(tid: number): number {
    return this.host.items().find((i) => i.itemType === 1 && i.tid === tid)?.id ?? 1;
  }

  private ctx(): MwCtx {
    return {
      player: this.host.player, items: this.weapons(), selId: this.selId, sel: this.sel, secondId: this.secondId, second: this.second,
      resetMax: this.resetMax, skillPos: this.skillPos, busy: this.busy, note: this.note,
      pick: (id) => { this.selId = id; this.note = ''; void this.load(); },
      pickSecond: (id) => { this.secondId = id; this.note = ''; void this.load(); },
      setSkillPos: (p) => { this.skillPos = p; this.win.render(); },
      act: {
        bind: () => this.run(async (id) => { await this.host.client.call('bindItem', id); this.say('Đã khóa thần khí.'); }),
        upgrade: () => this.run((id) => this.upgrade(id)),
        resolve: () => this.run(async (id) => {
          const r = await this.host.client.call<MWResolveReply>('magicWeaponResolve', id, '', 0);
          if (r.succ) { this.selId = null; this.say('Phân giải thành công, nhận 1 Thâm Lam Tinh!'); }
        }),
        repair: (all) => this.run(async (id) => {
          if (all) {
            const worn = this.weapons().filter((i) => i.slotType === SlotType.EQUIP).map((i) => i.id);
            await this.host.client.call('magicWeaponAllRepair', worn, [this.stackId(MW_STONE_TID.repair)]);
            this.say('Đã sửa chữa thần khí đang mặc.');
          } else {
            const r = await this.host.client.call<MWRepairReply>('magicWeaponRepair', id, this.stackId(MW_STONE_TID.repair));
            if (r.succ) this.say(`Sửa chữa thành công, còn ${r.num} Thâm Lam Tinh.`);
          }
        }, !all),
        resetSkill: () => this.run(async (id) => {
          const r = await this.host.client.call<MWResetSkillReply>('magicWeaponResetSkill', id, this.stackId(MW_STONE_TID.skillReset), this.skillPos);
          if (r.succ) this.say(`Tái thiết lập kỹ năng thần khí thành công, nhận được kỹ năng: ${r.name ?? `#${r.sid}`}`);
        }),
        trans: () => this.run(async (id) => {
          if (this.secondId === null) return;
          const r = await this.host.client.call<MWTransReply>('MWTrans', id, this.secondId, this.stackId(MW_STONE_TID.trans), '');
          if (r.succ) { this.selId = this.secondId; this.secondId = null; this.say(r.msg ?? 'Chuyển thuộc tính thành công!'); }
        }),
        resetProp: () => this.run(async (id) => {
          const r = await this.host.client.call<MWResetPropReply>('magicWeaponResetProp', id, this.stackId(MW_STONE_TID.propReset));
          if (r.succ) this.say(`Tái lập thành công: ${r.mainPropNum1} / ${r.mainPropNum2}`);
        }),
        activate: (index) => this.run(async (id) => {
          const r = await this.host.client.call<MWActivateReply>('activateMWPro', id, index);
          if (!('f' in r)) this.say(`Đã kích hoạt dòng ${r.index + 1}.`);
        }),
      },
    };
  }

  private renderTab(tab: number, body: HTMLElement): void {
    const c = this.ctx();
    [renderUpgrade, renderResolve, renderRepair, renderSkill, renderTrans, renderResetProp, renderSuccinct][tab](body, c);
  }

  private async upgrade(id: number): Promise<void> {
    const r = await this.host.client.call<MWUpgradeReply>('mWeaponUpgrade', id);
    if (r.succ) this.say(`Thăng cấp thần khí thành công lên cấp ${r.level}!`);
    else if (r.msg) this.say(r.msg, true);
  }

  private say(text: string, danger = false): void {
    this.note = text;
    toast(text, danger);
  }

  /** One server action on the selected weapon with the buttons disabled; the numbers are re-read afterwards. */
  private run(action: (id: number) => Promise<void>, needSel = true): void {
    if (this.busy || (needSel && this.selId === null)) return;
    const id = this.selId ?? 0;
    this.busy = true;
    this.win.render();
    void action(id)
      .catch(() => undefined) // refusals are already toasted by the server
      .finally(async () => {
        this.busy = false;
        await this.load();
      });
  }

  private async load(): Promise<void> {
    const seq = ++this.seq;
    const client = this.host.client;
    const read = async (id: number | null): Promise<MWPanelInfo | null> => (id === null ? null : client.call<MWPanelInfo>('getMWPanel', id).catch(() => null));
    const [sel, second] = await Promise.all([read(this.selId), read(this.secondId)]);
    const max = sel?.main && this.win.activeTab === 5
      ? await client.call<MWResetMaxReply>('queryMWResetPropMax', sel.equipId).catch(() => null) : null;
    if (seq !== this.seq) return;
    this.sel = sel;
    this.second = second;
    this.resetMax = max?.succ ? { n1: max.maxMainPropNum1, n2: max.maxMainPropNum2 } : null;
    if (this.skillPos > MW.SKILL_SLOTS || !sel?.skills.some((k) => k.pos === this.skillPos)) this.skillPos = sel?.skills[0]?.pos ?? 1;
    this.win.render();
  }
}
