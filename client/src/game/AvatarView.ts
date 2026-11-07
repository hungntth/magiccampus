// Layered sprite of one map character (legacy CreatureView layers, M13 phase A). Bottom to top: flyer (only while airborne), body
// (class body, costume or transform; the mount sheet replaces it while riding), weapon (class body only), flyer front overlay (wav_code,
// airborne only). Every layer is a SheetAnim anchored at (-midX, -footY) and played in lockstep. A missing sheet falls back to the
// class body (`base`), then to nothing (the Entity shows its portrait marker).

import { Container } from 'pixi.js';
import { decodeResCode, type AvatarBody } from '@mc/shared';
import { CHAR_SELECTED_GLOW } from './GlowFilter';
import { Behavior, SheetAnim, loadSheet } from './SheetAnim';

/** Sheet name (path without .swf) of a resource code, null for none / unknown codes. */
export function sheetNameFromResCode(resCode: string): string | null {
  if (!resCode || resCode === '0') return null;
  const d = decodeResCode(resCode);
  if (!d.path) return null;
  return d.path.replace(/\.swf$/, '');
}

type Slot = 'flyer' | 'body' | 'weapon' | 'front';
const ORDER: readonly Slot[] = ['flyer', 'body', 'weapon', 'front'];
// Mounted behaviours of the mount sheets (rider + mount in one clip): breath 8, run fast 9, run 10.
const MOUNT_BEHAVIOR: Record<number, number> = { [Behavior.STAND]: 8, [Behavior.RUN_FAST]: 9, [Behavior.RUN]: 10 };
const MOUNT_STAND = 8;

interface Layer {
  key: string;
  anim: SheetAnim | null;
  token: number;
}

const none = (v: string | null | undefined): string => (v && v !== '0' && v !== '-1' ? v : '');

/** Plays the first available clip for `dir` and the behaviors in order (dir 0 of most sheets is stored under Chinese names); the label played or null. */
function playFirst(anim: SheetAnim, dir: number, behaviors: number[], restart: boolean): string | null {
  for (const b of behaviors) {
    const labels = dir === 0 && b < 8 ? [`${dir}-${b}`, anim.orderLabel(b)] : [`${dir}-${b}`];
    const hit = labels.find((l) => l && anim.play(l, restart));
    if (hit) return hit;
  }
  return null;
}

export class AvatarView extends Container {
  private readonly layers: Record<Slot, Layer> = {
    flyer: { key: '', anim: null, token: 0 }, body: { key: '', anim: null, token: 0 },
    weapon: { key: '', anim: null, token: 0 }, front: { key: '', anim: null, token: 0 },
  };
  private bodyRes = '';
  private baseRes = '';
  private kind: AvatarBody = 'class';
  private weaponRes = '';
  private flyerRes = '';
  private frontRes = '';
  private mountRes = '';
  private airborne = false;
  private hovered = false;
  private dir = 0;
  private behavior: number = Behavior.STAND;

  /** `onBody(headY)` runs when a body sheet is shown (headY = top of the sprite above the feet) or with null when none loaded. */
  constructor(private readonly onBody: (headY: number | null) => void) {
    super();
  }

  get hasBody(): boolean {
    return this.layers.body.anim !== null;
  }

  /** Body art (class body, costume or transform) and its kind; `base` = class body fallback. */
  setBody(res: string, kind: AvatarBody, base?: string): void {
    this.bodyRes = none(res);
    this.kind = kind;
    if (base !== undefined) this.baseRes = none(base);
    this.refresh();
  }

  setWeapon(res: string | null | undefined): void {
    this.weaponRes = none(res);
    this.refresh();
  }

  setFlyer(res: string | null | undefined, front?: string | null): void {
    this.flyerRes = none(res);
    this.frontRes = none(front);
    this.refresh();
  }

  setMount(res: string | null | undefined): void {
    this.mountRes = none(res);
    this.refresh();
  }

  /** The flyer layers are drawn while not on the ground (take-off, in the air, landing). */
  setAirborne(on: boolean): void {
    if (this.airborne === on) return;
    this.airborne = on;
    this.refresh();
    this.applyAnim(true);
  }

  setHover(on: boolean): void {
    this.hovered = on;
    for (const l of Object.values(this.layers)) if (l.anim) l.anim.filters = on ? [CHAR_SELECTED_GLOW] : [];
  }

  play(dir: number, behavior: number, restart = false): void {
    this.dir = dir;
    this.behavior = behavior;
    this.applyAnim(restart);
  }

  tick(dt: number): void {
    for (const l of Object.values(this.layers)) l.anim?.tick(dt);
  }

  private get mountShown(): boolean {
    return this.mountRes !== '' && this.kind === 'class' && !this.airborne;
  }

  /** Sheet candidates per slot, best first ('' filtered out). The mount sheet is the whole rider + mount body. */
  private wanted(): Record<Slot, string[]> {
    const mounted = this.mountShown;
    const list = (...v: string[]): string[] => [...new Set(v.filter(Boolean))];
    return {
      flyer: list(this.airborne ? this.flyerRes : ''),
      body: list(mounted ? this.mountRes : '', this.bodyRes, this.baseRes),
      weapon: list(this.kind === 'class' && !mounted ? this.weaponRes : ''),
      front: list(this.airborne ? this.frontRes : ''),
    };
  }

  private refresh(): void {
    const want = this.wanted();
    for (const slot of ORDER) {
      const layer = this.layers[slot];
      const key = want[slot].join('|');
      if (layer.key === key) continue;
      layer.key = key;
      const token = ++layer.token;
      if (slot !== 'body') this.drop(layer); // the body stays until its replacement is ready
      void this.load(slot, layer, token, want[slot]);
    }
  }

  private drop(layer: Layer): void {
    layer.anim?.destroy();
    layer.anim = null;
  }

  private async load(slot: Slot, layer: Layer, token: number, candidates: string[]): Promise<void> {
    let sheet = null;
    for (const res of candidates) {
      const name = res ? sheetNameFromResCode(res) : null;
      sheet = name ? await loadSheet(name) : null;
      if (token !== layer.token || this.destroyed) return;
      if (sheet && Object.keys(sheet.data.anims).length > 0) break;
      sheet = null;
    }
    const old = layer.anim;
    layer.anim = null;
    if (!sheet) {
      old?.destroy();
      if (slot === 'body') this.onBody(null);
      return;
    }
    const anim = new SheetAnim(sheet);
    const { width, height, meta } = sheet.data;
    const footY = meta?.footY ?? height - 8;
    anim.position.set(-(meta?.midX ?? width / 2), -footY);
    if (slot !== 'body') anim.eventMode = 'none';
    if (this.hovered) anim.filters = [CHAR_SELECTED_GLOW];
    old?.destroy();
    layer.anim = anim;
    for (const s of ORDER) if (this.layers[s].anim) this.addChild(this.layers[s].anim!); // re-stack: addChild moves to the top in order
    if (slot === 'body') this.onBody((meta?.bodyY ?? meta?.headY ?? 0) - footY - 4);
    this.applyAnim(true);
  }

  private applyAnim(restart: boolean): void {
    const { body, weapon, flyer, front } = this.layers;
    const b = this.behavior;
    const mounted = this.mountShown;
    // Flash: in the air the body breathes while the flyer plays the walk loop (behavior % 8).
    const bodyB = mounted ? (MOUNT_BEHAVIOR[b] ?? MOUNT_STAND) : this.airborne && b === Behavior.RUN ? Behavior.STAND : b;
    const standB = mounted ? MOUNT_STAND : Behavior.STAND;
    if (body.anim) {
      const label = playFirst(body.anim, this.dir, [bodyB, standB, Behavior.STAND], restart) ?? (body.anim.play(body.anim.firstLabel, restart) ? body.anim.firstLabel : null);
      if (label && weapon.anim) weapon.anim.play(label, restart);
    }
    if (flyer.anim) playFirst(flyer.anim, this.dir, [b % 8, Behavior.STAND], restart);
    if (front.anim) playFirst(front.anim, this.dir, [Behavior.STAND], restart);
  }
}
