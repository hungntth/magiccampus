// World map window (legacy compMain/WorldMap, M9 phase G; M key / minimap Earth button): two 900x570 pages with a pin per
// teleportable map (current map highlighted, maps above the player's level greyed), a TipMap-like hover title and a corner
// button that flips the page. A pin click runs the scroll / gold transport confirm (ItemFuncs.travelTo).

import type { TransportMapEntry, TransportMapsReply } from '@mc/shared';
import type { GameClient } from '../../net/client';
import { el, openActWindow, type ActWindow } from '../actWindow';
import { toast } from '../screens';
import { pageOf, WORLD_MAP_H, WORLD_MAP_W, WORLD_PINS } from './pins';
import './worldMap.css';

export interface WorldMapHost {
  client: GameClient;
  level(): number;
  travel(mapId: number, group: boolean): void;
}

export class WorldMapPanel {
  private win: ActWindow | null = null;
  private page: 1 | 2 = 1;
  private info: TransportMapsReply | null = null;

  constructor(private readonly host: WorldMapHost) {}

  toggle(): void {
    if (this.win) this.close();
    else void this.open();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  private async open(): Promise<void> {
    try {
      this.info = await this.host.client.call<TransportMapsReply>('getTransportMaps');
    } catch (e) {
      return void toast((e as Error).message, true);
    }
    this.page = pageOf(this.info.current);
    this.win ??= openActWindow('Bản đồ thế giới', 'wm-win', () => this.close());
    this.render();
  }

  private render(): void {
    const info = this.info;
    if (!this.win || !info) return;
    const map = el('wm-map');
    map.style.width = `${WORLD_MAP_W}px`;
    map.style.height = `${WORLD_MAP_H}px`;
    map.style.backgroundImage = `url(/ui/world/WorldMap${this.page}.jpg)`;
    const byId = new Map<number, TransportMapEntry>(info.maps.map((m) => [m.id, m]));
    for (const [key, [page, x, y]] of Object.entries(WORLD_PINS)) {
      const id = Number(key);
      const m = byId.get(id);
      if (page !== this.page || (!m && id !== info.current)) continue;
      const current = id === info.current;
      const locked = !!m && m.level > this.host.level();
      const pin = el(`wm-pin${current ? ' current' : ''}${locked ? ' locked' : ''}`);
      pin.style.left = `${x}px`;
      pin.style.top = `${y}px`;
      pin.title = m ? `${m.name}\nCấp độ tối thiểu: ${m.level}` : 'Vị trí hiện tại';
      if (m && !current) pin.onclick = () => this.pick(m);
      map.appendChild(pin);
    }
    const flip = el('wm-flip', this.page === 1 ? 'Trang 2 ›' : '‹ Trang 1', 'button');
    flip.onclick = () => {
      this.page = this.page === 1 ? 2 : 1;
      this.render();
    };
    map.appendChild(flip);
    this.win.body.replaceChildren(map);
  }

  private pick(m: TransportMapEntry): void {
    if (m.level > this.host.level()) return void toast(`Cấp độ tối thiểu: ${m.level}`, true);
    const group = this.info?.leader ?? false;
    this.close();
    this.host.travel(m.id, group);
  }
}
