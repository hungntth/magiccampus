// Forge tab "Phân giải": pick an unworn equipment piece of colour 1+ and disassemble it (equResolve) into its template
// materials (bound, colour -1 unless prefix 5). Stars, holes and gems are lost; no fee.

import type { BagItem, UpgradeInfo } from '@mc/shared';
import { SlotType } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { toast } from '../screens';
import { el } from '../shopCell';
import { EquipPicker } from './equipPicker';
import { forgeCell } from './forgeCell';
import type { ForgeHost, ForgeTab, ForgeTabView } from './forgeTypes';

class ResolveView implements ForgeTabView {
  private readonly picker: EquipPicker;
  private readonly detail = el('div', 'forge-detail');
  private info: UpgradeInfo | null = null;
  private seq = 0;
  private busy = false;
  private disposed = false;

  constructor(private readonly host: ForgeHost, body: HTMLElement) {
    this.picker = new EquipPicker(host, () => this.load(), (i) => i.itemType === 2 && i.slotType === SlotType.BAG);
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

  private renderDetail(): void {
    const eq = this.picker.selected();
    if (!eq || !this.info || this.info.id !== eq.id) {
      this.detail.replaceChildren(el('div', 'forge-hint', 'Chọn trang bị trong túi để phân giải (trang bị đang mặc phải tháo ra trước).'));
      return;
    }
    const outs = this.info.resolve;
    const cells = el('div', 'forge-slots');
    for (const o of outs) {
      const box = el('div', 'forge-slot-box');
      box.append(forgeCell({ iconCode: o.iconCode, name: o.name, color: o.color, count: `x${o.num}`, title: `${o.name} x${o.num}` }, 'forge-cell forge-slot'),
        el('div', 'forge-slot-name', o.name));
      cells.appendChild(box);
    }
    const ok = eq.color >= 1 && outs.length > 0;
    const go = el('button', 'shop-btn forge-go', 'Phân giải');
    go.disabled = this.busy || !ok;
    go.onclick = () => askConfirm('Xác nhận phân giải trang bị này?', () => void this.resolve(eq));
    this.detail.replaceChildren(
      el('div', 'forge-title', eq.name),
      el('div', 'forge-hint', ok ? 'Nhận được (đã khóa):' : 'Trang bị phẩm trắng không thể phân giải.'),
      ...(ok ? [cells] : []), go,
    );
  }

  private async resolve(eq: BagItem): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.renderDetail();
    try {
      if (await this.host.client.call<boolean>('equResolve', eq.id, '')) {
        toast(`Phân giải thành công, nhận ${this.info?.resolve.map((o) => `${o.num} ${o.name}`).join(', ') ?? 'nguyên liệu'}!`);
      }
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      this.busy = false;
      if (!this.disposed) this.refresh();
    }
  }
}

export const resolveTab: ForgeTab = { id: 'resolve', label: 'Phân giải', build: (host, body) => new ResolveView(host, body) };
