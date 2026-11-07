// Long buff bar (legacy LongBuffCanvas, left 2 / top 115): 16x16 icons from initLongBuff / upLongBuff / delBuff.
// Tooltip = name, description and time left; clicking a removable buff asks to remove it (delBuffClient). A 10 s timer
// drops expired timed buffs locally and tells the server (delBuffClient), like the Flash client.

import { BuffType, PM_TRANSFORM_BUFF_ID, type InitLongBuff, type LongBuff } from '@mc/shared';
import { iconUrl } from '../../assets';
import type { GameClient } from '../../net/client';
import { askConfirm } from '../confirmDialog';
import { toast } from '../screens';
import { div, place } from './skin';

const REFRESH_MS = 10_000; // GamePredef.LONG_BUFF_REFRESH_INTERVAL
// VIP right-13 transform buff: its template text is the Halloween one, so the tooltip and the remove prompt get their own wording.
const TRANSFORM_INFO = 'Biến hình VIP trong ngày. Nhấn để hủy hiệu ứng.';
const TRANSFORM_ASK = 'Bạn có muốn hủy hiệu ứng biến hình không?';

export class BuffBar {
  private readonly root: HTMLDivElement;
  private readonly buffs = new Map<number, LongBuff>();
  private readonly offs: (() => void)[] = [];
  private readonly timer: number;

  constructor(parent: HTMLElement, private readonly client: GameClient) {
    this.root = place(div('hud-buffbar', parent), 2, 115, 200) as HTMLDivElement;
    this.offs.push(
      client.on('initLongBuff', (d) => this.init(d as InitLongBuff)),
      client.on('upLongBuff', (d) => this.add(d as LongBuff)),
      client.on('delBuff', (id) => this.remove(Number(id))),
    );
    this.timer = window.setInterval(() => this.expire(), REFRESH_MS);
  }

  destroy(): void {
    for (const off of this.offs) off();
    window.clearInterval(this.timer);
    this.root.remove();
  }

  private init(map: InitLongBuff): void {
    this.buffs.clear();
    for (const b of Object.values(map ?? {})) if (b) this.buffs.set(b.id, b);
    this.render();
  }

  private add(b: LongBuff): void {
    if (!b) return;
    this.buffs.delete(b.id);
    // Type 10 is unique per template group: the legacy client matches the code name, H5 matches the name.
    if (b.type === BuffType.UNIQUE) {
      for (const [id, o] of this.buffs) if (o.type === BuffType.UNIQUE && o.name === b.name) this.buffs.delete(id);
    }
    this.buffs.set(b.id, b);
    this.render();
  }

  private remove(id: number): void {
    if (this.buffs.delete(id)) this.render();
  }

  private expire(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, b] of this.buffs) {
      if (b.type !== BuffType.TIMED || b.ineffectiveTime === undefined || b.ineffectiveTime > now) continue;
      this.buffs.delete(id);
      changed = true;
      void this.client.call('delBuffClient', id).catch(() => undefined);
    }
    if (changed) this.render();
  }

  private render(): void {
    this.root.replaceChildren(...[...this.buffs.values()].map((b) => this.icon(b)));
  }

  private icon(b: LongBuff): HTMLElement {
    const img = document.createElement('img');
    img.className = 'hud-buff';
    img.alt = '';
    img.draggable = false;
    img.src = iconUrl(b.iconCode);
    img.onerror = () => img.classList.add('missing');
    img.title = this.tip(b);
    img.onmouseenter = () => {
      img.title = this.tip(b);
    };
    img.onclick = () => {
      if (!b.removable) return void toast('BUFF xấu không thể bị xóa.');
      askConfirm(b.bid === PM_TRANSFORM_BUFF_ID ? TRANSFORM_ASK : 'Xác nhận xóa BUFF này?', () => {
        void this.client.call('delBuffClient', b.id).catch(() => undefined);
        this.remove(b.id);
      });
    };
    return img;
  }

  private tip(b: LongBuff): string {
    const info = b.bid === PM_TRANSFORM_BUFF_ID ? TRANSFORM_INFO : b.info;
    const head = [b.name, info].filter(Boolean).join('\n');
    if (b.type === BuffType.PERMANENT || b.type === BuffType.UNIQUE) return `${head}\nDuy trì: Vĩnh viễn`;
    if (b.type === BuffType.BATTLE) return `${head}\nSố trận đấu còn lại: ${b.battleLeft ?? 0}`;
    const left = b.ineffectiveTime === undefined ? (b.timeLeft ?? 0) : Math.max(0, Math.floor((b.ineffectiveTime - Date.now()) / 1000));
    return `${head}\nCòn lại: ${timeText(left)}`;
  }
}

function timeText(s: number): string {
  if (s >= 86400) return `${Math.floor(s / 86400)} ngày `;
  return `${Math.floor(s / 3600)} giờ ${Math.floor((s % 3600) / 60)} phút ${s % 60} giây`;
}
