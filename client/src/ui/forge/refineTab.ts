// Forge tab "Tinh luyện": pick an equipment piece, choose a refinement (element / bind / soul / prefix / signature), fill the
// material slots from the bag and run it. Two-step results show a preview with Đồng ý / Từ chối (see refineKinds.ts).

import type { BagItem, UpgradeInfo } from '@mc/shared';
import { toast } from '../screens';
import { el } from '../shopCell';
import { EquipPicker } from './equipPicker';
import type { ForgeHost, ForgeTab, ForgeTabView } from './forgeTypes';
import { MaterialSlots } from './materialSlots';
import { REFINE_KINDS, type KindCtx, type Preview, type RefineKind } from './refineKinds';

class RefineView implements ForgeTabView {
  private readonly picker: EquipPicker;
  private readonly subRow = el('div', 'mall-tabs forge-subtabs');
  private readonly detail = el('div', 'forge-detail');
  private readonly slots: MaterialSlots;
  private kind: RefineKind = REFINE_KINDS[0];
  private info: UpgradeInfo | null = null;
  private preview: Preview | null = null;
  private seq = 0;
  private busy = false;
  private disposed = false;

  constructor(private readonly host: ForgeHost, body: HTMLElement) {
    this.slots = new MaterialSlots(host, () => this.renderDetail());
    this.picker = new EquipPicker(host, () => {
      this.preview = null;
      this.load();
    });
    body.append(this.subRow, this.picker.root, this.detail);
    this.renderSubtabs();
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

  private renderSubtabs(): void {
    this.subRow.replaceChildren(...REFINE_KINDS.map((k) => {
      const b = el('button', 'mall-tab', k.label);
      if (k.id === this.kind.id) b.classList.add('selected');
      b.onclick = () => {
        this.kind = k;
        this.preview = null;
        this.renderSubtabs();
        this.renderDetail();
      };
      return b;
    }));
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
      this.detail.replaceChildren(el('div', 'forge-hint', 'Chọn trang bị để tinh luyện.'));
      return;
    }
    const info = this.info;
    this.slots.set(this.kind.needs(info));
    const ctx: KindCtx = { host: this.host, eq, info, slots: this.slots, busy: this.busy || this.preview !== null, run: (fn) => void this.run(fn) };
    const kids: HTMLElement[] = [
      el('div', 'forge-title', `${eq.name}${eq.binded ? '  (đã khóa)' : ''}`),
      this.slots.root,
      el('div', 'forge-rates', `Chi phí: ${this.kind.cost(info)} bạc`),
    ];
    if (this.kind.needs(info).length === 0) kids.push(el('div', 'forge-hint', 'Trang bị này không dùng được cách tinh luyện này.'));
    const buttons = el('div', 'forge-buttons');
    buttons.append(...this.kind.buttons(ctx));
    kids.push(buttons);
    if (this.preview) kids.push(this.previewBox(this.preview));
    this.detail.replaceChildren(...kids);
  }

  private previewBox(p: Preview): HTMLElement {
    const box = el('div', 'forge-preview');
    for (const l of p.lines) box.appendChild(el('div', '', l));
    const yes = el('button', 'shop-btn forge-go', 'Đồng ý');
    const no = el('button', 'shop-btn forge-go', 'Từ chối');
    yes.onclick = () => void this.settle(p.yes);
    no.onclick = () => void this.settle(p.no);
    const row = el('div', 'forge-buttons');
    row.append(yes, no);
    box.appendChild(row);
    return box;
  }

  private async settle(fn: () => Promise<void>): Promise<void> {
    this.preview = null;
    await this.guard(fn);
  }

  private async run(fn: () => Promise<Preview | void>): Promise<void> {
    await this.guard(async () => {
      this.preview = (await fn()) ?? null;
    });
  }

  private async guard(fn: () => Promise<void>): Promise<void> {
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
}

export const refineTab: ForgeTab = { id: 'refine', label: 'Tinh luyện', build: (host, body) => new RefineView(host, body) };
