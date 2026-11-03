// A player or NPC on the map. Uses the converted SWF spritesheet when one exists for its resCode
// (8-direction stand/run animations), otherwise falls back to portrait icon + marker.
// Linear interpolation along a route; direction/behavior switch automatically while moving.

import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { decodeResCode } from '@mc/shared';
import { iconUrl } from '../assets';
import { Behavior, SheetAnim, dirFromDelta, loadSheet } from './SheetAnim';

const MOVE_SPEED = 220;
const BUBBLE_MS = 5000;
const BUBBLE_WRAP = 220;

const nameStyle = new TextStyle({
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  fill: '#ffffff',
  stroke: { color: '#000000', width: 3 },
});

const bubbleStyle = new TextStyle({
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  fill: '#ffffff',
  wordWrap: true,
  wordWrapWidth: BUBBLE_WRAP,
});

const markerStyle = (fill: string): TextStyle =>
  new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 22, fontWeight: '700', fill, stroke: { color: '#000000', width: 4 } });

// H5 placeholder for the Flash STATE_ICON art (not in the dump): 102 '!', 103 grey '?', 104 yellow '?'.
const QUEST_MARKERS: Record<number, { text: string; style: TextStyle }> = {
  102: { text: '!', style: markerStyle('#ffd23f') },
  103: { text: '?', style: markerStyle('#b0b6c2') },
  104: { text: '?', style: markerStyle('#ffd23f') },
};

export type EntityKind = 'self' | 'player' | 'npc';

export function sheetNameFromResCode(resCode: string): string | null {
  if (!resCode || resCode === '0') return null;
  const d = decodeResCode(resCode);
  if (!d.path) return null;
  return d.path.replace(/\.swf$/, '');
}

export class Entity extends Container {
  private route: { x: number; y: number }[] = [];
  private onArrive: (() => void) | null = null;
  private anim: SheetAnim | null = null;
  private fallback: Container;
  private marker: Graphics;
  private nameText: Text;
  dir = 0;
  private behavior: number = Behavior.STAND;
  private bubble: Container | null = null;
  private bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  private questMarker: Text | null = null;

  constructor(
    readonly entityId: number,
    readonly kind: EntityKind,
    displayName: string,
    iconCode: string,
    resCode: string,
    x: number,
    y: number,
    dir = 0,
    readonly npcType = 0,
  ) {
    super();
    this.position.set(x, y);
    this.dir = dir;
    const color = kind === 'self' ? 0xe0a944 : kind === 'npc' ? 0x4ba3e3 : 0x8fd18f;

    const shadow = new Graphics().ellipse(0, 0, 18, 8).fill({ color: 0x000000, alpha: 0.35 });
    this.addChild(shadow);

    this.fallback = new Container();
    this.marker = new Graphics().circle(0, -22, 16).fill({ color, alpha: 0.9 }).stroke({ color: 0x000000, width: 2 });
    this.fallback.addChild(this.marker);
    this.addChild(this.fallback);

    this.nameText = new Text({ text: displayName, style: nameStyle });
    this.nameText.anchor.set(0.5, 1);
    this.nameText.position.set(0, -44);
    this.addChild(this.nameText);

    if (kind === 'npc') {
      this.eventMode = 'static';
      this.cursor = 'pointer';
    }

    void this.loadVisual(resCode, iconCode);
  }

  /** Speech bubble above the name label (legacy NPC greeting); empty text shows nothing. */
  say(text: string): void {
    this.clearBubble();
    if (!text.trim() || this.destroyed) return;
    const label = new Text({ text, style: bubbleStyle });
    label.anchor.set(0.5, 1);
    const pad = 8;
    const bg = new Graphics()
      .roundRect(-label.width / 2 - pad, -label.height - pad, label.width + pad * 2, label.height + pad * 2, 8)
      .fill({ color: 0x1b1f2a, alpha: 0.9 })
      .stroke({ color: 0x4a5163, width: 1 });
    const bubble = new Container();
    bubble.addChild(bg, label);
    bubble.eventMode = 'none';
    const above = this.questMarker ? this.questMarker.height : 0;
    bubble.position.set(0, this.nameText.y - this.nameText.height - above - 6 - pad);
    this.addChild(bubble);
    this.bubble = bubble;
    this.bubbleTimer = setTimeout(() => this.clearBubble(), BUBBLE_MS);
  }

  /** Quest marker above the name (QuestState 102/103/104); any other value hides it. */
  setQuestState(state: number): void {
    this.questMarker?.destroy();
    this.questMarker = null;
    const m = QUEST_MARKERS[state];
    if (!m || this.destroyed) return;
    this.questMarker = new Text({ text: m.text, style: m.style });
    this.questMarker.anchor.set(0.5, 1);
    this.questMarker.eventMode = 'none';
    this.addChild(this.questMarker);
    this.layoutMarker();
  }

  private layoutMarker(): void {
    this.questMarker?.position.set(0, this.nameText.y - this.nameText.height - 2);
  }

  private clearBubble(): void {
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    this.bubbleTimer = null;
    this.bubble?.destroy({ children: true });
    this.bubble = null;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    this.bubbleTimer = null;
    super.destroy(options);
  }

  private async loadVisual(resCode: string, iconCode: string): Promise<void> {
    const sheetName = sheetNameFromResCode(resCode);
    const sheet = sheetName ? await loadSheet(sheetName) : null;
    if (this.destroyed) return;
    if (sheet && Object.keys(sheet.data.anims).length > 0) {
      const anim = new SheetAnim(sheet);
      const { width, height, meta } = sheet.data;
      // Feet anchor from the resource's own metrics, like the Flash client's (-midX, -footY);
      // sheets converted before `meta` existed fall back to the old frame-based guess.
      const midX = meta?.midX ?? width / 2;
      const footY = meta?.footY ?? height - 8;
      anim.position.set(-midX, -footY);
      this.anim = anim;
      this.addChildAt(anim, 1);
      this.fallback.visible = false;
      const top = meta?.bodyY ?? meta?.headY ?? 0;
      this.nameText.position.set(0, top - footY - 4);
      this.layoutMarker();
      this.applyAnim(true);
      return;
    }
    await this.loadPortrait(iconCode);
  }

  private async loadPortrait(iconCode: string): Promise<void> {
    if (!iconCode || iconCode === '0') return;
    try {
      const texture = (await Assets.load<Texture>({ src: iconUrl(iconCode), loadParser: 'loadTextures' })) as Texture;
      if (this.destroyed) return;
      const sprite = new Sprite(texture);
      const size = 40;
      const scale = size / Math.max(texture.width, texture.height);
      sprite.scale.set(scale);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(0, -4);
      const mask = new Graphics().roundRect(-size / 2, -4 - size, size, size, 6).fill(0xffffff);
      sprite.mask = mask;
      this.fallback.addChild(mask, sprite);
      this.marker.visible = false;
    } catch {
      /* keep marker */
    }
  }

  private applyAnim(restart = false): void {
    if (!this.anim) return;
    if (!this.anim.playDir(this.dir, this.behavior, restart)) {
      if (!this.anim.playDir(this.dir, Behavior.STAND, restart)) this.anim.play(this.anim.firstLabel, restart);
    }
  }

  setBehavior(behavior: number): void {
    if (this.behavior === behavior) return;
    this.behavior = behavior;
    this.applyAnim(true);
  }

  face(dir: number): void {
    if (this.dir === dir) return;
    this.dir = dir;
    this.applyAnim();
  }

  moveAlong(route: number[][], onArrive?: () => void): void {
    this.route = route.map(([x, y]) => ({ x, y }));
    this.onArrive = onArrive ?? null;
    if (this.route.length > 0) {
      this.face(dirFromDelta(this.route[0].x - this.x, this.route[0].y - this.y, this.dir));
      this.setBehavior(Behavior.RUN);
    }
  }

  teleport(x: number, y: number): void {
    this.route = [];
    this.position.set(x, y);
    this.setBehavior(Behavior.STAND);
  }

  get moving(): boolean {
    return this.route.length > 0;
  }

  tick(dtSeconds: number): void {
    let budget = MOVE_SPEED * dtSeconds;
    while (budget > 0 && this.route.length > 0) {
      const target = this.route[0];
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= budget) {
        this.position.set(target.x, target.y);
        this.route.shift();
        budget -= dist;
        if (this.route.length === 0) {
          this.setBehavior(Behavior.STAND);
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        } else {
          this.face(dirFromDelta(this.route[0].x - this.x, this.route[0].y - this.y, this.dir));
        }
      } else {
        this.position.set(this.x + (dx / dist) * budget, this.y + (dy / dist) * budget);
        budget = 0;
      }
    }
    this.anim?.tick(dtSeconds);
    this.zIndex = this.y;
  }
}
