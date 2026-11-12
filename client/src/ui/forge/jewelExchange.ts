// Forge tab "Đổi bảo thạch" (JewelExchagePanel, pmJewelExchage): pick a Thượng Hạng (purple) or Hoàn Mỹ (orange) gem stack in the bag, pick
// another gem of the same group and swap the whole stack (free; the result is bound). The reply {flag, finalNum, finalNme} is awaited; a
// failure note comes from the server push.

import type { BagItem, JewelExchangeReply } from '@mc/shared';
import { JEWEL_EXCHANGE_GEMS, JEWEL_EXCHANGE_GROUPS, SlotType, jewelExchangeGroup } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { toast } from '../screens';
import { el } from '../shopCell';
import { forgeCell } from './forgeCell';
import type { ForgeTab, ForgeHost, ForgeTabView } from './forgeTypes';

class JewelExchangeView implements ForgeTabView {
  private selectedId: number | null = null;
  private target = 0;
  private busy = false;
  private disposed = false;
  private readonly grid = el('div', 'forge-grid');
  private readonly detail = el('div', 'forge-detail');

  constructor(private readonly host: ForgeHost, body: HTMLElement) {
    body.append(this.grid, this.detail);
    this.render();
  }

  dispose(): void {
    this.disposed = true;
  }

  refresh(): void {
    this.render();
  }

  accept(item: BagItem): boolean {
    if (!this.exchangeable(item)) return false;
    this.pick(item);
    return true;
  }

  private exchangeable(i: BagItem): boolean {
    return i.slotType === SlotType.BAG && i.itemType === 1 && i.stackNum > 0 && jewelExchangeGroup(i.tid) >= 0;
  }

  private stacks(): BagItem[] {
    return this.host.items().filter((i) => this.exchangeable(i)).sort((a, b) => a.tid - b.tid);
  }

  private pick(i: BagItem): void {
    this.selectedId = i.id;
    this.target = 0;
    this.render();
  }

  private render(): void {
    const stacks = this.stacks();
    if (this.selectedId !== null && !stacks.some((i) => i.id === this.selectedId)) this.selectedId = null;
    this.grid.replaceChildren(...(stacks.length === 0
      ? [el('div', 'forge-hint', 'Cần đặt bảo thạch vào ô\n(Cần là phẩm chất tím trở lên)')]
      : stacks.map((i) => {
        const cell = forgeCell({ iconCode: i.iconCode, name: i.name, color: i.color, count: `x${i.stackNum}`, title: `${i.name}  x${i.stackNum}` });
        if (i.id === this.selectedId) cell.classList.add('selected');
        cell.onclick = () => this.pick(i);
        return cell;
      })));
    this.renderDetail();
  }

  private renderDetail(): void {
    const src = stacksFind(this.stacks(), this.selectedId);
    if (!src) return this.detail.replaceChildren(el('div', 'forge-hint', 'Chọn bảo thạch cần đổi. Đổi xong sẽ khóa.'));
    const group = JEWEL_EXCHANGE_GROUPS[jewelExchangeGroup(src.tid)];
    const options = el('div', 'forge-grid');
    for (const tid of group.filter((t) => t !== src.tid)) {
      const gem = JEWEL_EXCHANGE_GEMS[tid];
      const cell = forgeCell({ iconCode: gem.iconCode, name: gem.name, color: gem.color, title: gem.name });
      if (tid === this.target) cell.classList.add('selected');
      cell.onclick = () => {
        this.target = tid;
        this.renderDetail();
      };
      options.appendChild(cell);
    }
    const go = el('button', 'shop-btn forge-go', 'Đổi');
    go.disabled = this.busy || this.target === 0;
    go.onclick = () => this.confirm(src);
    this.detail.replaceChildren(
      el('div', 'forge-title', `${src.name}  x${src.stackNum}`), el('div', 'forge-hint', 'Chọn bảo thạch muốn nhận (cùng phẩm chất):'), options,
      el('div', 'forge-hint', 'Đổi toàn bộ chồng, miễn phí. Đổi xong sẽ khóa.'), go,
    );
  }

  private confirm(src: BagItem): void {
    const gem = JEWEL_EXCHANGE_GEMS[this.target];
    if (!gem) return;
    askConfirm(`Xác nhận đổi ${src.stackNum} ${src.name} thành ${gem.name}？`, () => void this.run(src, this.target));
  }

  private async run(src: BagItem, target: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.renderDetail();
    try {
      const r = await this.host.client.call<JewelExchangeReply>('pmJewelExchage', src.id, target, false);
      if (r.flag) toast(`Đổi thành công ${r.finalNum ?? 0} ${r.finalNme ?? ''}`);
      else toast('Đổi thất bại', true);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      this.busy = false;
      this.selectedId = null;
      this.target = 0;
      if (!this.disposed) this.render();
    }
  }
}

const stacksFind = (list: readonly BagItem[], id: number | null): BagItem | undefined => list.find((i) => i.id === id);

export const jewelExchangeTab: ForgeTab = { id: 'jewelExchange', label: 'Đổi bảo thạch', group: 'jewel', build: (host, body) => new JewelExchangeView(host, body) };
