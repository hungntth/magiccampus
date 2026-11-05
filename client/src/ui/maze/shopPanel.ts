// Mê Trận discount shop (Flash MazeShopPanel, MAZE_SHOP_PANEL_U): the push opens it, getMazeShopItem fills the two offers (original
// price crossed out, sale price in vàng), Mua confirms and sends buyMazeShopItem({sid, index}); the bare-int reply is the bought slot.

import type { MazeShopItem, MazeShopItems } from '@mc/shared';
import type { GameClient } from '../../net/client';
import { iconUrl } from '../../assets';
import { button, el, openActWindow, type ActWindow } from '../actWindow';
import { askConfirm } from '../confirmDialog';
import { toast } from '../screens';
import './maze.css';

export class MazeShopPanel {
  private win: ActWindow | null = null;
  private readonly bought = new Set<number>();

  constructor(private readonly client: GameClient) {}

  async show(): Promise<void> {
    this.close();
    this.bought.clear();
    const win = openActWindow('Giảm giá vật phẩm', 'mz-shop', () => this.close());
    this.win = win;
    try {
      const items = await this.client.call<MazeShopItems | Record<string, never>>('getMazeShopItem');
      if (this.win !== win) return;
      if (!('item1' in items) || !('item2' in items)) return this.close();
      win.body.replaceChildren(this.slot(items.item1, 1), this.slot(items.item2, 2), button('Hủy', () => this.close()));
    } catch (e) {
      toast((e as Error).message, true);
      this.close();
    }
  }

  private slot(it: MazeShopItem, index: number): HTMLElement {
    const box = el('mz-slot');
    const icon = document.createElement('img');
    icon.className = 'mz-icon';
    icon.src = iconUrl(it.iconCode ?? 0);
    const name = it.name ?? `#${it.itemId}`;
    const buy = button('Mua', () => askConfirm(`Xác nhận mua ${name} giá ${it.goldAfter} (giá gốc ${it.goldBefore})?`, () => this.buy(it, index, buy)), 'act-btn', this.bought.has(index));
    box.append(icon, el('mz-slot-name', name), el('mz-old', `Gốc: ${it.goldBefore} Vàng`), el('mz-line', `Bán: ${it.goldAfter} Vàng`), buy);
    return box;
  }

  private buy(it: MazeShopItem, index: number, btn: HTMLButtonElement): void {
    this.client.call<number>('buyMazeShopItem', { sid: it.sid, index }).then((r) => {
      if (r) {
        this.bought.add(r);
        btn.disabled = true;
      }
    }).catch((e) => toast((e as Error).message, true));
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }
}
