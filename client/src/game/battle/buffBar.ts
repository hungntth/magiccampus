// Buff icon row of one battle unit (M10 E2.0, BattleCreatureView buffAdd / buffDel / buffClear): TBL_BUFF icons above the
// HP bars, one per buff id, laid out left to right and centred. The server sends the icon code with buffAdd (H5 extension).

import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { iconUrl } from '../../assets';

const SIZE = 18;
const GAP = 1;

export class BuffBar extends Container {
  private readonly icons = new Map<number, Container>();

  add(id: number, icon: string | undefined): void {
    if (this.icons.has(id)) return;
    const box = new Container();
    box.addChild(new Graphics().rect(0, 0, SIZE, SIZE).fill({ color: 0x000000, alpha: 0.4 }).stroke({ color: 0xdddddd, width: 1 }));
    this.icons.set(id, box);
    this.addChild(box);
    this.layout();
    if (!icon || icon === '0') return;
    void Assets.load<Texture>({ src: iconUrl(icon), loadParser: 'loadTextures' }).then((tex) => {
      if (box.destroyed || !this.icons.has(id)) return;
      const s = new Sprite(tex);
      s.width = SIZE;
      s.height = SIZE;
      box.addChild(s);
    }, () => undefined);
  }

  remove(ids: number | readonly number[]): void {
    for (const id of typeof ids === 'number' ? [ids] : ids) {
      this.icons.get(id)?.destroy({ children: true });
      this.icons.delete(id);
    }
    this.layout();
  }

  clear(): void {
    this.remove([...this.icons.keys()]);
  }

  private layout(): void {
    const n = this.icons.size;
    let x = -((n * (SIZE + GAP) - GAP) / 2);
    for (const box of this.icons.values()) {
      box.position.set(Math.round(x), -SIZE);
      x += SIZE + GAP;
    }
  }
}
