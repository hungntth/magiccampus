// Tiểu Tinh Linh client flow (legacy FairyManagerPanel 838, opened by the fairy toggle of the HUD pet frame via PetController):
// initCharFairy + getFairyResAndList on open; fairyGrowUp / fairyRaise / addFairyExp / onSkill / upFairySkill answer Go-style fail objects
// toasted with the Flash texts; fairySkillConfigChange / changeFairyState / delFairy answer null; setFairyRes / setFairyResList drive Hoán đổi.
// Pushes: onUpdateFairy / onAddFairy / onDelFairy (roster), onUPP + bag slot pushes (re-render). Map art (onFairyOn / onFairyOff) is FairyLayer's.

import {
  FAIRY, FAIRY_SKIN_ITEM_TIDS, FAIRY_TEXT, fairyGrowLevel, fairyLevel, type BagItem, type FairyAddExpReply, type FairyGrowReply, type FairyInfo,
  type FairyRaiseReply, type FairyRoster, type FairySetResReply, type FairySkillReply, type FairySkin, type FairyUpdateKey, type PlayerData,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import type { FeatureWindow } from '../ui/feature/featureWindow';
import { configOf, draftOf, failText, sameDraft, skillFailText, type ConfigDraft } from '../ui/fairy/fairyConfig';
import { createFairyWindow } from '../ui/fairy/fairyPanel';
import { FAIRY_UI, type FairyUiHost } from '../ui/fairy/fairyTypes';
import { toast } from '../ui/screens';
import type { BagController } from './BagController';

export interface FairyControllerHost {
  client: GameClient;
  player: PlayerData;
  bag: BagController;
}

const UPDATE_KEYS: readonly string[] = ['gexp', 'exp', 'doh', 'state', 'binded'] satisfies readonly FairyUpdateKey[];

export class FairyController {
  private roster = new Map<number, FairyInfo>();
  private selId = 0;
  private pageNo = 1;
  private feedPage = 0;
  private pick = 0;
  private busyFlag = false;
  private note = '';
  private skinState: FairySkin | null = null;
  private draftCfg: ConfigDraft = draftOf(undefined);
  private readonly win: FeatureWindow;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: FairyControllerHost) {
    const { client, player, bag } = host;
    const ui: FairyUiHost = {
      fairies: () => [...this.roster.values()].sort((a, b) => a.id - b.id),
      current: () => this.cur(),
      select: (id) => this.select(id),
      page: () => this.pageNo,
      setPage: (p) => this.update(() => (this.pageNo = Math.max(1, p))),
      busy: () => this.busyFlag,
      growNote: () => this.note,
      items: () => bag.listTabs(),
      count: (tid) => bag.countOf(tid),
      silver: () => (player.selectedMoneyType === 2 ? player.money : player.moneyBind) ?? 0,
      gold: () => player.gold ?? 0,
      grow: (type) => this.grow(type),
      raise: (item) => this.raise(item),
      feed: (item) => this.feed(item),
      setGuard: (f, on) => this.setGuard(f, on),
      release: (f) => askConfirm(FAIRY_UI.RELEASE_CONFIRM(f.name), () => void this.send('delFairy', f.id)),
      feedTab: () => this.feedPage,
      setFeedTab: (t) => this.update(() => (this.feedPage = t)),
      skillPick: () => this.pick,
      pickSkill: (i) => this.update(() => (this.pick = i)),
      learn: (book) => this.learn(book),
      upgrade: (index) => this.upgrade(index),
      draft: () => this.draftCfg,
      editDraft: (fn) => this.update(() => fn(this.draftCfg)),
      draftDirty: () => this.dirty(),
      saveDraft: () => this.saveDraft(),
      skin: () => this.skinState,
      showSkin: (tid, show) => this.showSkin(tid, show),
      unlockSkin: (tid) => this.unlockSkin(tid),
    };
    this.win = createFairyWindow(ui, () => this.close());
    const rerender = (): void => void Promise.resolve().then(() => this.render()); // after BagController applied the push
    this.offs.push(
      client.on('onUpdateFairy', (id, key, value) => this.onUpdate(Number(id), String(key), Number(value))),
      client.on('onAddFairy', (d) => this.onAdd(d as FairyInfo)),
      client.on('onDelFairy', (id) => this.onDel(Number(id))),
      client.on('onUPP', rerender),
      client.on('onAddCharactorSlot', rerender),
      client.on('onDelCharactorSlot', rerender),
      client.on('onMoveItemNum', rerender),
    );
  }

  toggle(): void {
    if (this.win.isOpen) this.close();
    else this.open();
  }

  open(): void {
    if (this.win.isOpen) return;
    const { client } = this.host;
    Promise.all([client.call<FairyRoster>('initCharFairy'), client.call<FairySkin>('getFairyResAndList')]).then(([roster, skin]) => {
      this.roster = new Map(Object.values(roster ?? {}).map((f) => [f.id, f]));
      this.skinState = skin ?? null;
      this.select(this.roster.has(this.selId) ? this.selId : this.firstId(), false);
      if (!this.win.isOpen) this.win.show(0);
      else this.render();
    }).catch((e: unknown) => toast((e as Error).message, true));
  }

  /** Closing with an unsaved Thiết lập draft asks to save it first (U[106]). */
  close(): void {
    if (this.win.isOpen && this.dirty()) {
      const f = this.cur();
      askConfirm(FAIRY_UI.UNSAVED, () => f && this.sendConfig(f));
    }
    this.win.close();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.win.close();
  }

  private cur(): FairyInfo | null {
    return this.roster.get(this.selId) ?? null;
  }

  private render(): void {
    this.win.render();
  }

  private update(fn: () => void): void {
    fn();
    this.render();
  }

  private firstId(): number {
    return [...this.roster.keys()].sort((a, b) => a - b)[0] ?? 0;
  }

  private dirty(): boolean {
    const f = this.cur();
    return f !== null && !sameDraft(this.draftCfg, draftOf(f.skillConfig));
  }

  private select(id: number, render = true): void {
    if (id !== this.selId) {
      this.note = '';
      this.pick = 0;
    }
    this.selId = id;
    this.draftCfg = draftOf(this.roster.get(id)?.skillConfig);
    if (render) this.render();
  }

  /** One request at a time: the flag drops when the reply (or rejection) arrives. */
  private send<T>(method: string, ...args: unknown[]): Promise<T | undefined> {
    if (this.busyFlag) return Promise.resolve(undefined);
    this.busyFlag = true;
    this.render();
    return this.host.client.call<T>(method, ...args).catch((e: unknown) => {
      toast((e as Error).message, true);
      return undefined;
    }).finally(() => {
      this.busyFlag = false;
      setTimeout(() => this.render(), 0); // after the caller's reply handler patched the roster
    });
  }

  private onUpdate(id: number, key: string, value: number): void {
    const f = this.roster.get(id);
    if (!f || !UPDATE_KEYS.includes(key) || !Number.isFinite(value)) return;
    const k = key as FairyUpdateKey;
    if (k === 'exp' && fairyLevel(value) > fairyLevel(f.exp)) toast(FAIRY_UI.LEVEL_UP(f.name, fairyLevel(value)));
    if (k === 'state' && value === FAIRY.STATE.GUARD) for (const o of this.roster.values()) o.state = FAIRY.STATE.REST;
    f[k] = value;
    this.render();
  }

  private onAdd(f: FairyInfo): void {
    if (!f || !Number.isInteger(f.id)) return;
    this.roster.set(f.id, f);
    toast(FAIRY_TEXT.GOT(f.name));
    if (!this.roster.has(this.selId)) this.select(f.id, false);
    this.render();
  }

  private onDel(id: number): void {
    this.roster.delete(id);
    if (id === this.selId) this.select(this.firstId(), false);
    this.render();
  }

  /** Thủ hộ asks first when the fairy is still unbound (FAIRY_MANAGER_PANEL_S[0]: guarding binds it). */
  private setGuard(f: FairyInfo, on: boolean): void {
    const go = (): void => void this.send('changeFairyState', f.id, on ? FAIRY.STATE.GUARD : FAIRY.STATE.REST);
    if (on && !f.binded) askConfirm(FAIRY_TEXT.BIND_CONFIRM, go);
    else go();
  }

  private grow(type: number): void {
    const f = this.cur();
    if (!f) return;
    if (fairyGrowLevel(f.gexp) >= FAIRY.GROW_MAX) return toast(FAIRY_TEXT.MAX_LEVEL, true);
    const go = (): void => void this.send<FairyGrowReply>('fairyGrowUp', f.id, type).then((r) => {
      if (!r) return;
      if (!r.f) return toast(failText('grow', r.code, type), true);
      f.flag = { ...f.flag, gnum: r.gnum };
      this.note = r.cri === 1 ? `${FAIRY_TEXT.SMALL_CRIT} (+${r.exp})` : r.cri === 2 ? `${FAIRY_UI.BIG_CRIT} (+${r.exp})` : `${FAIRY_UI.GROW_POINTS} +${r.exp}`;
    });
    if (type === FAIRY.GROW_TYPE.BATCH) askConfirm(FAIRY_UI.BATCH_CONFIRM, go);
    else go();
  }

  private raise(item: BagItem): void {
    const f = this.cur();
    if (!f) return;
    if (f.doh >= FAIRY.DOH_MAX) return toast(FAIRY_TEXT.DOH_FULL, true);
    askConfirm(FAIRY_UI.RAISE_CONFIRM(item.name), () => void this.send<FairyRaiseReply>('fairyRaise', f.id, item.id, 1).then((r) => {
      if (r && !r.f) toast(failText('raise', r.code), true);
    }));
  }

  private feed(item: BagItem): void {
    const f = this.cur();
    if (!f) return;
    if (fairyLevel(f.exp) >= FAIRY.MAX_LEVEL) return toast(FAIRY_TEXT.MAX_LEVEL, true);
    if ((f.flag?.en ?? 0) <= 0) return toast(FAIRY_TEXT.NO_FEEDS, true);
    const before = f.exp; // onUpdateFairy(exp) arrives before the reply
    void this.send<FairyAddExpReply>('addFairyExp', f.id, [item.id], 1).then((r) => {
      if (!r) return;
      if (!r.f) return toast(failText('feed', r.code), true);
      f.flag = { ...f.flag, en: r.en };
      if (f.exp > before) toast(FAIRY_UI.EXP_GOT(f.name, f.exp - before));
    });
  }

  private onSkillReply(f: FairyInfo, r: FairySkillReply | undefined): void {
    if (!r) return;
    if (!r.flag) return toast(skillFailText(r.sindex), true);
    f.skillFlag = { ...f.skillFlag, [r.sindex]: r.skill };
    this.pick = Number(r.sindex.replace(/^s/, '')) || this.pick;
  }

  private learn(book: BagItem): void {
    const f = this.cur();
    if (f) void this.send<FairySkillReply>('onSkill', f.id, book.id).then((r) => this.onSkillReply(f, r));
  }

  private upgrade(index: number): void {
    const f = this.cur();
    if (f) void this.send<FairySkillReply>('upFairySkill', f.id, index).then((r) => this.onSkillReply(f, r));
  }

  private saveDraft(): void {
    const f = this.cur();
    if (f) this.sendConfig(f);
  }

  private sendConfig(f: FairyInfo): void {
    const cfg = configOf(this.draftCfg);
    void this.send<null>('fairySkillConfigChange', f.id, cfg).then(() => {
      f.skillConfig = cfg;
    });
  }

  private showSkin(tid: number, show: boolean): void {
    void this.send<FairySetResReply | null>('setFairyRes', tid, show ? FAIRY.SKIN.SHOW : FAIRY.SKIN.HIDE).then((r) => {
      const s = this.skinState;
      if (!r || !s) return;
      if (r.type === FAIRY.SKIN.SHOW) s.actFairy = r.tid;
      else if (s.actFairy === r.tid) s.actFairy = 0;
    });
  }

  private unlockSkin(tid: number): void {
    if (FAIRY_SKIN_ITEM_TIDS.includes(tid)) return toast(FAIRY_TEXT.SKIN_NEED_ITEM, true);
    askConfirm(FAIRY_TEXT.SKIN_CONFIRM, () => void this.send<FairySkin>('setFairyResList', tid).then((s) => {
      if (s) this.skinState = s;
    }));
  }
}
