// Transport gates (cổng dịch chuyển) of the current map: createSceneItems type-3 items drawn with their looping
// vector-anim sheet (tools/swf swfanim), alpha/mirror/depth as in the Flash SceneItemView, hover tooltip
// "Chuyển đến: <name>". Taps are reported to GameScene (walk onto the gate, then sceneChange).

import { Container, FederatedPointerEvent, Rectangle, Text, TextStyle } from 'pixi.js';
import { SceneItemType } from '@mc/shared';
import type { SceneItem } from '@mc/shared';
import { sheetNameFromResCode } from './Entity';
import { SheetAnim, loadSheet } from './SheetAnim';

// Player shadow radius (Entity): the legacy hit test is the shadow clip against the gate sprite bounds.
const SHADOW_RX = 18;
const SHADOW_RY = 8;

const tipStyle = new TextStyle({
  fontFamily: 'system-ui, sans-serif',
  fontSize: 14,
  fontWeight: '700',
  fill: '#ffffff',
  stroke: { color: '#000000', width: 3 },
});

export interface Portal {
  item: SceneItem;
  view: Container;
  anim: SheetAnim;
  /** Sprite bounding box in map pixels (SWF stage size at the item position). */
  bounds: Rectangle;
}

export class PortalLayer {
  private readonly portals = new Map<number, Portal>();
  private readonly tip = new Text({ text: '', style: tipStyle });
  private generation = 0;

  /** `layer` is the depth-sorted entity layer; `overlay` (the world) hosts the tooltip above everything. */
  constructor(
    private readonly layer: Container,
    overlay: Container,
    private readonly onTap: (portal: Portal, e: FederatedPointerEvent) => void,
  ) {
    this.tip.anchor.set(0.5, 1);
    this.tip.visible = false;
    this.tip.eventMode = 'none';
    overlay.addChild(this.tip);
  }

  /** Draws the transport gates among `items`; a stale load (scene changed meanwhile) is dropped. */
  async load(items: SceneItem[]): Promise<void> {
    const gen = ++this.generation;
    await Promise.all(
      items.filter((i) => i.type === SceneItemType.TRANSPORT).map(async (item) => {
        const name = sheetNameFromResCode(item.resCode);
        const sheet = name ? await loadSheet(name) : null;
        if (!sheet || gen !== this.generation || this.portals.has(item.id)) return;
        const { width, height, meta } = sheet.data;
        const anim = new SheetAnim(sheet);
        anim.play('default');
        if (item.posDir === 1) {
          anim.scale.x = -1;
          anim.x = width;
        }
        const view = new Container();
        view.addChild(anim);
        view.position.set(item.posX, item.posY);
        view.alpha = item.layer === 0 ? 1 : 0.6;
        view.zIndex = item.posY + (meta?.localizerY ?? height);
        view.eventMode = 'static';
        view.cursor = 'pointer';
        const portal: Portal = { item, view, anim, bounds: new Rectangle(item.posX, item.posY, width, height) };
        view.on('pointertap', (e: FederatedPointerEvent) => this.onTap(portal, e));
        view.on('pointerover', () => this.showTip(portal));
        view.on('pointerout', () => (this.tip.visible = false));
        this.portals.set(item.id, portal);
        this.layer.addChild(view);
      }),
    );
  }

  clear(): void {
    this.generation++;
    this.tip.visible = false;
    for (const p of this.portals.values()) p.view.destroy({ children: true });
    this.portals.clear();
  }

  tick(dt: number): void {
    for (const p of this.portals.values()) p.anim.tick(dt);
  }

  /** Legacy hitTestObject(player shadow): is the point (feet + shadow ellipse box) over the gate sprite? */
  contains(portal: Portal, x: number, y: number): boolean {
    const b = portal.bounds;
    return x + SHADOW_RX >= b.x && x - SHADOW_RX <= b.right && y + SHADOW_RY >= b.y && y - SHADOW_RY <= b.bottom;
  }

  private showTip(p: Portal): void {
    this.tip.text = `Chuyển đến: ${p.item.name}`;
    this.tip.position.set(p.bounds.x + p.bounds.width / 2, p.bounds.y);
    this.tip.visible = true;
  }
}
