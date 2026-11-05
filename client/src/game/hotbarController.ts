// Hotbar logic (legacy UserBarCanvas.useSlot / useSlotByNum, M9 phase C): slots from player.interfaceData (st/sid), the current
// page, lock and visibility, slot writes (skillSetUserBar / uif / us) and slot use. Skills fire only while the battle command
// menu is up (no map casting exists); items use the bag path on the map and the battle item command in battle.

import {
  HOTBAR_TEXT, HotbarKind, hotbarFromSettings, isBattleSkill, slotForKey, type BagItem, type HotbarSlot, type LearnedSkill,
  type PlayerData,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { toast } from '../ui/screens';

/** What the battle controller offers the hotbar (registered while it exists). */
export interface HotbarBattle {
  /** True while a battle is running (key / click rules switch to battle mode). */
  readonly inBattle: boolean;
  /** Uses a skill / bag item as this round's command; false when commands are not open. */
  hotbarUse(kind: 'skill' | 'item', id: number, item?: BagItem): boolean;
}

let battle: HotbarBattle | null = null;
export const setHotbarBattle = (b: HotbarBattle | null): void => void (battle = b);

export interface HotbarHost {
  client: GameClient;
  player(): PlayerData | null;
  bagItems(): BagItem[];
  useBagItem(item: BagItem): void;
}

export class HotbarController {
  page = 1;
  locked = false; // Flash: the bar always starts unlocked
  private skills: LearnedSkill[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: HotbarHost) {
    const refresh = (): void => void setTimeout(() => this.emit(), 0);
    for (const m of ['onAddCharactorSlot', 'onDelCharactorSlot', 'onUpChaSlotStackNum', 'onUPP']) this.offs.push(host.client.on(m, refresh));
    this.offs.push(host.client.on('onSkillUpdate', (list) => {
      this.skills = list as LearnedSkill[];
      this.emit();
    }));
  }

  destroy(): void {
    for (const off of this.offs) off();
  }

  async loadSkills(): Promise<void> {
    try {
      this.skills = await this.host.client.call<LearnedSkill[]>('initLearnedSkill');
      this.emit();
    } catch {
      /* the bar keeps generic icons */
    }
  }

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  /** Re-render (the bag finished loading: item slots get their names and counts). */
  refresh(): void {
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private settings(): Record<string, number | boolean> {
    return this.host.player()?.interfaceData ?? {};
  }

  slots(): HotbarSlot[] {
    return hotbarFromSettings(this.settings());
  }

  get visible(): boolean {
    return Number(this.settings().au ?? 0) === 0; // au 0 = shown (changeBarVisible)
  }

  skill(sid: number): LearnedSkill | undefined {
    return this.skills.find((s) => s.sid === sid);
  }

  petSkillName(sid: number): string | undefined {
    const p = this.host.player();
    const pet = p ? Object.values(p.petList).find((x) => x.state === 1) : undefined;
    return pet?.skillInfo?.[sid]?.name;
  }

  count(tid: number): number {
    return this.host.bagItems().filter((b) => b.tid === tid).reduce((n, b) => n + b.stackNum, 0);
  }

  firstItem(tid: number): BagItem | undefined {
    return this.host.bagItems().find((b) => b.tid === tid && b.stackNum > 0);
  }

  firstItemById(id: number): BagItem | undefined {
    return this.host.bagItems().find((b) => b.id === id);
  }

  private store(fields: Record<string, number | boolean>): void {
    const p = this.host.player();
    if (p) p.interfaceData = { ...(p.interfaceData ?? {}), ...fields };
    this.emit();
  }

  private fail = (e: Error): void => toast(e.message, true);

  /** Drop a learned skill on slot n (1..30). `from` = source slot when moving inside the bar (cleared). */
  async putSkill(n: number, sid: number, from = 0): Promise<void> {
    const sk = this.skill(sid);
    if (sk && !isBattleSkill(sk.type)) return void toast('Không thể sử dụng kỹ năng bị động', true);
    try {
      await this.host.client.call('skillSetUserBar', sid, sk?.level ?? 1, String(n));
      this.store({ [`st${n}`]: HotbarKind.SKILL, [`sid${n}`]: sid });
      if (from > 0 && from !== n) await this.clear(from);
    } catch (e) {
      this.fail(e as Error);
    }
  }

  /** Drop a bag item template on slot n. */
  async putItem(n: number, tid: number, from = 0): Promise<void> {
    try {
      await this.host.client.call('uif', `st${n}`, HotbarKind.ITEM, false);
      await this.host.client.call('uif', `sid${n}`, tid, false);
      this.store({ [`st${n}`]: HotbarKind.ITEM, [`sid${n}`]: tid });
      if (from > 0 && from !== n) await this.clear(from);
    } catch (e) {
      this.fail(e as Error);
    }
  }

  async clear(n: number): Promise<void> {
    try {
      await this.host.client.call('uif', `sid${n}`, 0, false);
      this.store({ [`sid${n}`]: 0 });
    } catch (e) {
      this.fail(e as Error);
    }
  }

  setVisible(on: boolean): void {
    this.store({ au: on ? 0 : 1 });
    this.host.client.call('uif', 'au', on ? 0 : 1, false).catch(this.fail);
  }

  setLocked(on: boolean): void {
    this.locked = on;
    this.host.client.call('us', { ubl: on }).catch(this.fail);
    this.emit();
  }

  turn(dir: number): void {
    this.page = ((this.page - 1 + dir + 3) % 3) + 1; // Up 1 -> 3 -> 2, Down 1 -> 2 -> 3
    this.emit();
  }

  /** Keys 1..9,0 (n 1..10): in battle any slot, on the map item slots only. */
  key(n: number): void {
    const inBattle = battle?.inBattle === true;
    const slot = slotForKey(n, this.page, this.settings().battleStExpan === true, inBattle);
    const s = this.slots()[slot - 1];
    if (!s || s.st === HotbarKind.NONE || (!inBattle && s.st !== HotbarKind.ITEM)) return;
    this.use(slot);
  }

  /** Click rules: single click in battle or when locked, double click always. */
  click(n: number, double: boolean): void {
    if (double || battle?.inBattle === true || this.locked) this.use(n);
  }

  use(n: number): void {
    const s = this.slots()[n - 1];
    if (!s || s.st === HotbarKind.NONE) return void toast(HOTBAR_TEXT.EMPTY.replace(/\r/g, ' '));
    const inBattle = battle?.inBattle === true;
    if (s.st === HotbarKind.ITEM) {
      const item = this.firstItem(s.sid);
      if (!item) return void toast(HOTBAR_TEXT.NO_ITEM, true);
      if (inBattle) battle?.hotbarUse('item', s.sid, item);
      else this.host.useBagItem(item);
      return;
    }
    if (!inBattle) return; // a skill slot does nothing on the map
    if (!battle?.hotbarUse('skill', s.sid)) toast('Chưa đến lượt ra lệnh');
  }
}
