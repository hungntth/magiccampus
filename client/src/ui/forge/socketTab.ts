// Forge tab "Khảm" (legacy sockets): pick an equipment piece, see its holes. "Đục lỗ" digs the next hole (bound equipment,
// diamond item 16 of a sufficient ColorCode, 2000 silver); a bag gem (type 503) goes into the selected empty hole with
// jewelSet; clicking a socketed gem removes it (jewelDel, fee shown in the confirm); "Khóa trang bị" binds the item (bindItem).

import type { BagItem, HoleDigReply, UpgradeInfo } from '@mc/shared';
import { DIAMOND_TID, GEM_ITEM_TYPE, HOLE_DIG_COST, MAX_HOLES, SlotType, diamondColorNeeded, EQUIP_PROP_LABELS } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { toast } from '../screens';
import { el } from '../shopCell';
import { EquipPicker } from './equipPicker';
import { forgeCell } from './forgeCell';
import type { ForgeHost, ForgeTab, ForgeTabView } from './forgeTypes';

class SocketView implements ForgeTabView {
  private readonly picker: EquipPicker;
  private readonly detail = el('div', 'forge-detail');
  private info: UpgradeInfo | null = null;
  private hole: number | null = null;
  private gemId: number | null = null;
  private seq = 0;
  private busy = false;
  private disposed = false;

  constructor(private readonly host: ForgeHost, body: HTMLElement) {
    this.picker = new EquipPicker(host, () => {
      this.hole = null;
      this.load();
    });
    body.append(this.picker.root, this.detail);
    this.refresh();
  }

  dispose(): void {
    this.disposed = true;
  }

  refresh(): void {
    this.picker.render();
    this.load();
  }

  accept(item: BagItem): boolean {
    if (item.itemType === 1 && item.tplType === GEM_ITEM_TYPE && item.slotType === SlotType.BAG) {
      this.gemId = item.id;
      this.renderDetail();
      return true;
    }
    return this.picker.accept(item);
  }

  private load(): void {
    const eq = this.picker.selected();
    const seq = ++this.seq;
    if (!eq) {
      this.info = null;
      this.renderDetail();
      return;
    }
    void this.host.client.call<UpgradeInfo>('getUpgradeInfo', eq.id).then((info) => {
      if (this.disposed || seq !== this.seq) return;
      this.info = info;
      this.renderDetail();
    }, () => undefined); // the item may be gone already (its delete push is on the way)
  }

  private gems(): BagItem[] {
    return this.host.items().filter((i) => i.slotType === SlotType.BAG && i.itemType === 1 && i.tplType === GEM_ITEM_TYPE);
  }

  private diamond(holes: number): BagItem | undefined {
    const need = diamondColorNeeded(holes + 1);
    return this.host.items().filter((i) => i.slotType === SlotType.BAG && i.itemType === 1 && i.tid === DIAMOND_TID && i.color >= need)
      .sort((a, b) => a.color - b.color)[0];
  }

  private renderDetail(): void {
    const eq = this.picker.selected();
    if (!eq || !this.info || this.info.id !== eq.id) {
      this.detail.replaceChildren(el('div', 'forge-hint', 'Chọn trang bị để đục lỗ và khảm bảo thạch.'));
      return;
    }
    const holes = eq.holeNum ?? 0;
    const cap = Math.min(MAX_HOLES, this.info.holeCapacity);
    const row = el('div', 'forge-grid forge-holes');
    for (let slot = 1; slot <= cap; slot++) row.appendChild(this.holeCell(slot, holes, eq));
    const dia = this.diamond(holes);
    const dig = el('button', 'shop-btn forge-go', `Đục lỗ (${HOLE_DIG_COST} bạc)`);
    dig.disabled = this.busy || holes >= cap || !dia || !eq.binded;
    dig.title = !eq.binded ? 'Chỉ có trang bị khóa mới có thể đục lỗ!'
      : dia ? `Dùng Kim Cương cấp ${dia.color + 1}` : `Cần Kim Cương cấp ${diamondColorNeeded(holes + 1) + 1} trở lên`;
    dig.onclick = () => dia && void this.dig(eq, dia);
    const set = el('button', 'shop-btn forge-go', 'Khảm');
    const gem = this.gems().find((g) => g.id === this.gemId);
    set.disabled = this.busy || !gem || this.hole === null;
    set.onclick = () => gem && this.hole !== null && void this.set(eq, this.hole, gem);
    const buttons = el('div', 'forge-buttons');
    buttons.append(dig, set);
    if (!eq.binded) {
      const bind = el('button', 'shop-btn forge-go', 'Khóa trang bị');
      bind.onclick = () => askConfirm(`Khóa ${eq.name}? Vật phẩm đã khóa không thể giao dịch.`, () => void this.bind(eq));
      buttons.appendChild(bind);
    }
    const gemRow = el('div', 'forge-grid forge-gems');
    const list = this.gems();
    gemRow.append(...(list.length === 0 ? [el('div', 'forge-hint', 'Trong túi không có bảo thạch.')] : list.map((g) => {
      const c = forgeCell({ iconCode: g.iconCode, name: g.name, color: g.color, count: `x${g.stackNum}`, title: g.name });
      if (g.id === this.gemId) c.classList.add('selected');
      c.onclick = () => {
        this.gemId = g.id;
        this.renderDetail();
      };
      return c;
    })));
    this.detail.replaceChildren(
      el('div', 'forge-title', `${eq.name}  -  lỗ: ${holes}/${cap}`), row,
      el('div', 'forge-hint', 'Chọn lỗ trống, chọn bảo thạch trong túi rồi nhấn Khảm. Nhấp vào bảo thạch đã khảm để tháo.'), gemRow, buttons,
    );
  }

  private holeCell(slot: number, holes: number, eq: BagItem): HTMLElement {
    const socketed = this.info?.gems.find((g) => g.slot === slot);
    if (slot > holes) {
      const c = forgeCell({ iconCode: '0', name: '', color: 0, title: slot === holes + 1 ? 'Lỗ tiếp theo (đục lỗ)' : 'Chưa đục' }, 'forge-cell empty');
      c.textContent = slot === holes + 1 ? '+' : '';
      return c;
    }
    if (socketed) {
      const label = `${socketed.name}  +${socketed.propNum} ${EQUIP_PROP_LABELS[socketed.propType] ?? `#${socketed.propType}`}`;
      const c = forgeCell({ iconCode: socketed.iconCode, name: socketed.name, color: 0, title: `${label}\nNhấp để tháo (phí ${socketed.fee} bạc)` });
      c.onclick = () => askConfirm(`Xác định dùng ${socketed.fee} bạc để tháo gỡ: ${socketed.name}?`, () => void this.remove(eq, slot));
      return c;
    }
    const c = forgeCell({ iconCode: '0', name: '', color: 0, title: `Lỗ ${slot} (trống)` });
    if (slot === this.hole) c.classList.add('selected');
    c.onclick = () => {
      this.hole = slot;
      this.renderDetail();
    };
    return c;
  }

  private async act(fn: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.renderDetail();
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      this.busy = false;
      if (!this.disposed) this.load();
    }
  }

  private dig(eq: BagItem, dia: BagItem): Promise<void> {
    return this.act(async () => {
      const r = await this.host.client.call<HoleDigReply>('holeDig', dia.id, eq.id);
      if (r.flag) toast('Đục lỗ thành công!');
    });
  }

  private set(eq: BagItem, hole: number, gem: BagItem): Promise<void> {
    return this.act(async () => {
      const n = await this.host.client.call<number>('jewelSet', eq.id, { [hole]: { idx: gem.id, tempBagFlag: false } });
      if (n > 0) {
        toast(`Khảm nạm thành công ${n} bảo thạch!`);
        this.hole = null;
      }
    });
  }

  private remove(eq: BagItem, slot: number): Promise<void> {
    return this.act(async () => {
      if (await this.host.client.call<boolean>('jewelDel', eq.id, slot)) toast('Tháo bảo thạch thành công!');
    });
  }

  private bind(eq: BagItem): Promise<void> {
    return this.act(async () => {
      await this.host.client.call('bindItem', eq.id);
      toast('Đã khóa trang bị.');
    });
  }
}

export const socketTab: ForgeTab = { id: 'socket', label: 'Khảm nạm', build: (host, body) => new SocketView(host, body) };
