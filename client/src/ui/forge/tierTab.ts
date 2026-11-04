// Forge tab "Thăng cấp": pick an equipment piece with a next tier, fill the next template's materials (same colour) and
// upgrade with changeLevel. Cost next.req_level^2 * 10 silver; the piece keeps its slot and loses stars, holes, gems and rolls.

import type { BagItem, ChangeLevelReply, UpgradeInfo } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { toast } from '../screens';
import { el } from '../shopCell';
import { EquipPicker } from './equipPicker';
import { forgeCell } from './forgeCell';
import type { ForgeHost, ForgeTab, ForgeTabView } from './forgeTypes';
import { MaterialSlots } from './materialSlots';

class TierView implements ForgeTabView {
  private readonly picker: EquipPicker;
  private readonly detail = el('div', 'forge-detail');
  private readonly slots: MaterialSlots;
  private info: UpgradeInfo | null = null;
  private seq = 0;
  private busy = false;
  private disposed = false;

  constructor(private readonly host: ForgeHost, body: HTMLElement) {
    this.slots = new MaterialSlots(host, () => this.renderDetail());
    this.picker = new EquipPicker(host, () => this.load());
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
      this.detail.replaceChildren(el('div', 'forge-hint', 'Chọn trang bị để thăng cấp.'));
      return;
    }
    const next = this.info.next;
    if (!next) {
      this.detail.replaceChildren(el('div', 'forge-title', eq.name), el('div', 'forge-hint', 'Trang bị này đã đạt cấp tối đa.'));
      return;
    }
    this.slots.set(next.materials);
    const target = forgeCell({ iconCode: next.iconCode, name: next.name, color: 0, title: next.name }, 'forge-cell forge-slot');
    const head = el('div', 'forge-filter');
    head.append(target, el('span', 'forge-title', `${eq.name}  ->  ${next.name} (cấp ${next.reqLevel})`));
    const go = el('button', 'shop-btn forge-go', `Thăng cấp (${next.cost} bạc)`);
    go.disabled = this.busy || !this.slots.ready();
    go.onclick = () => askConfirm(
      `Thăng cấp ${eq.name} thành ${next.name}? Sao, lỗ và bảo thạch sẽ bị đặt lại.`, () => void this.upgrade(eq),
    );
    this.detail.replaceChildren(head, this.slots.root, el('div', 'forge-rates', `Chi phí: ${next.cost} bạc`), go);
  }

  private async upgrade(eq: BagItem): Promise<void> {
    const ids = this.slots.ids();
    if (!ids || this.busy) return;
    this.busy = true;
    this.renderDetail();
    const ref = (i: number): { idx: number; flag: boolean } => ({ idx: ids[i], flag: false });
    try {
      const r = await this.host.client.call<ChangeLevelReply>('changeLevel', { e: eq.id, i1: ref(0), i2: ref(1), i3: ref(2) });
      if (r.f) toast('Thăng cấp thành công!');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      this.busy = false;
      if (!this.disposed) this.refresh();
    }
  }
}

export const tierTab: ForgeTab = { id: 'tier', label: 'Thăng cấp', build: (host, body) => new TierView(host, body) };
