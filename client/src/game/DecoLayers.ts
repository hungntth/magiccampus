// Hồn Khí look layers of one map character (legacy CreatureView haloOn / roundOn + roundMaskOn / footprintOn / tepeOn, M13 phase E1). Effect
// sheets (EFF_PLAYER_1020xx, a single "default" loop, no anchors): position 1 Hoàng Quan = halo above the head, 2 Thánh Quang = aura behind the
// body plus an optional mask in front, 3 Ấn Tích and 4 Pháp Trận = ground effects under the feet. `below` goes under every avatar layer, `above`
// over them. A missing sheet draws nothing.

import { Container } from 'pixi.js';
import type { DecoLook } from '@mc/shared';
import { SheetAnim, loadSheet } from './SheetAnim';

type Slot = 'p1' | 'p2b' | 'p2f' | 'p3' | 'p4';
const SLOTS: readonly Slot[] = ['p4', 'p3', 'p2b', 'p2f', 'p1'];
/** Gap in px between the top of the body and the bottom of the halo (the halo overlaps the head a little). */
const HALO_OVERLAP = 14;

interface Item {
  key: string;
  anim: SheetAnim | null;
  token: number;
  /** Sheet size (the effect sheets carry no anchors). */
  w: number;
  h: number;
}

export class DecoLayers {
  readonly below = new Container();
  readonly above = new Container();
  private readonly items: Record<Slot, Item> = {
    p1: { key: '', anim: null, token: 0, w: 0, h: 0 }, p2b: { key: '', anim: null, token: 0, w: 0, h: 0 }, p2f: { key: '', anim: null, token: 0, w: 0, h: 0 },
    p3: { key: '', anim: null, token: 0, w: 0, h: 0 }, p4: { key: '', anim: null, token: 0, w: 0, h: 0 },
  };
  /** Top of the body above the feet (negative px), from the body sheet. */
  private headY = -80;
  private destroyed = false;

  constructor(private readonly sheetName: (res: string) => string | null) {}

  /** Replaces the whole look (scene `av.deco`, null / empty = none). */
  setAll(looks: readonly DecoLook[] | undefined): void {
    for (const pos of [1, 2, 3, 4]) this.set(pos, looks?.find((l) => l.pos === pos) ?? null);
  }

  /** One position's look (onDeco<Pos>On) or null (onDeco<Pos>Off). */
  set(pos: number, look: DecoLook | null): void {
    const main = look && look.res !== '0' ? look.res : '';
    const mask = look && look.mask !== '0' && look.mask !== look.res ? look.mask : '';
    if (pos === 1) this.assign('p1', main);
    else if (pos === 2) {
      this.assign('p2b', main);
      this.assign('p2f', mask);
    } else if (pos === 3) this.assign('p3', main);
    else if (pos === 4) this.assign('p4', main);
  }

  setHeadY(y: number): void {
    this.headY = y;
    for (const slot of SLOTS) this.place(slot);
  }

  tick(dt: number): void {
    for (const slot of SLOTS) this.items[slot].anim?.tick(dt);
  }

  destroy(): void {
    this.destroyed = true;
    for (const slot of SLOTS) this.drop(this.items[slot]);
  }

  private assign(slot: Slot, res: string): void {
    const item = this.items[slot];
    if (item.key === res) return;
    item.key = res;
    const token = ++item.token;
    this.drop(item);
    if (res) void this.load(slot, item, token, res);
  }

  private drop(item: Item): void {
    item.anim?.destroy();
    item.anim = null;
  }

  private async load(slot: Slot, item: Item, token: number, res: string): Promise<void> {
    const name = this.sheetName(res);
    const sheet = name ? await loadSheet(name) : null;
    if (token !== item.token || this.destroyed || !sheet || Object.keys(sheet.data.anims).length === 0) return;
    const anim = new SheetAnim(sheet);
    anim.eventMode = 'none';
    anim.play(anim.firstLabel, true);
    item.anim = anim;
    item.w = sheet.data.width;
    item.h = sheet.data.height;
    (slot === 'p1' || slot === 'p2f' ? this.above : this.below).addChild(anim);
    this.place(slot);
  }

  private place(slot: Slot): void {
    const { anim, w, h } = this.items[slot];
    if (!anim) return;
    if (slot === 'p1') anim.position.set(-w / 2, this.headY - h + HALO_OVERLAP);
    else if (slot === 'p2b' || slot === 'p2f') anim.position.set(-w / 2, this.headY / 2 - h / 2);
    else anim.position.set(-w / 2, -h / 2 + 6);
  }
}
