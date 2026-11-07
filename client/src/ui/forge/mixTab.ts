// Forge tabs "Ng.liệu" and "Bảo thạch" (legacy EquiptFuncPanel tabBtnA2 / A3): pick a material stack or a gem stack,
// choose how many units per attempt (2..5) and mix once or all. Both RPCs are awaited and reply
// {slotId, num, flag, finalNum}; the success toasts are the Flash strings, failures come from the server push.

import type { BagItem, MaterialMixReply } from '@mc/shared';
import { jewelRate, MAX_MATERIAL_COLOR, MIX_MAX, MIX_MIN, mixRate, SlotType } from '@mc/shared';
import { toast } from '../screens';
import { el } from '../shopCell';
import { forgeCell } from './forgeCell';
import type { ForgeHost, ForgeTab, ForgeTabView } from './forgeTypes';

const GEM_TYPE = 503;
type Mode = 'mix' | 'jewel';

class MixView implements ForgeTabView {
  private selectedId: number | null = null;
  private num = MIX_MAX;
  private busy = false;
  private disposed = false;
  private readonly grid = el('div', 'forge-grid');
  private readonly info = el('div', 'forge-rates');
  private readonly numSel = el('select', 'forge-num');
  private readonly one = el('button', 'shop-btn forge-go', 'Ghép 1 lần');
  private readonly all = el('button', 'shop-btn forge-go', 'Ghép tất cả');

  constructor(private readonly host: ForgeHost, body: HTMLElement, private readonly mode: Mode) {
    for (let n = MIX_MIN; n <= MIX_MAX; n++) {
      const o = el('option', '', `${n} cái`);
      o.value = String(n);
      this.numSel.appendChild(o);
    }
    this.numSel.value = String(this.num);
    this.numSel.onchange = () => {
      this.num = Number(this.numSel.value);
      this.renderInfo();
    };
    const numRow = el('div', 'forge-filter');
    numRow.append(el('span', '', 'Số lượng mỗi lần:'), this.numSel);
    const buttons = el('div', 'forge-buttons');
    this.one.onclick = () => void this.run(false);
    this.all.onclick = () => void this.run(true);
    buttons.append(this.one, this.all);
    body.append(this.grid, numRow, this.info, buttons);
    this.render();
  }

  dispose(): void {
    this.disposed = true;
  }

  refresh(): void {
    this.render();
  }

  accept(item: BagItem): boolean {
    if (this.modeOf(item) !== this.mode) return false;
    this.selectedId = item.id;
    this.render();
    return true;
  }

  private modeOf(i: BagItem): Mode | null {
    if (i.slotType !== SlotType.BAG || i.itemType !== 1) return null;
    if (i.tplType === GEM_TYPE) return 'jewel';
    return i.tplKind === 6 ? 'mix' : null;
  }

  private stacks(): BagItem[] {
    return this.host.items().filter((i) => this.modeOf(i) === this.mode).sort((a, b) => a.tid - b.tid || a.color - b.color);
  }

  private selected(): BagItem | undefined {
    return this.stacks().find((i) => i.id === this.selectedId);
  }

  private render(): void {
    const stacks = this.stacks();
    if (this.selectedId !== null && !stacks.some((i) => i.id === this.selectedId)) this.selectedId = null;
    this.grid.replaceChildren(...(stacks.length === 0 ? [el('div', 'forge-hint', this.mode === 'mix'
      ? 'Trong túi không có nguyên liệu nào.' : 'Trong túi không có bảo thạch nào.')] : stacks.map((i) => {
      const cell = forgeCell({
        iconCode: i.iconCode, name: i.name, color: i.color, count: `x${i.stackNum}`,
        title: `${i.name}\nCấp ${i.color + 1}  -  x${i.stackNum}`,
      });
      if (i.id === this.selectedId) cell.classList.add('selected');
      cell.onclick = () => {
        this.selectedId = i.id;
        this.render();
      };
      return cell;
    })));
    this.renderInfo();
  }

  private renderInfo(): void {
    const it = this.selected();
    const capped = !!it && this.mode === 'mix' && it.color >= MAX_MATERIAL_COLOR;
    const enough = !!it && it.stackNum >= this.num;
    if (!it) this.info.textContent = 'Chọn một chồng vật phẩm để ghép.';
    else if (capped) this.info.textContent = 'Nguyên liệu đã đạt cấp tối đa.';
    else {
      const rate = this.mode === 'mix' ? mixRate(this.num, it.color) : jewelRate(this.num);
      this.info.textContent = `${this.num} ${it.name} -> tỷ lệ thành công ${rate}%`
        + (enough ? '' : `  (cần ít nhất ${this.num}, đang có ${it.stackNum})`);
    }
    const off = this.busy || !it || capped || !enough;
    this.one.disabled = this.all.disabled = off;
  }

  private async run(all: boolean): Promise<void> {
    const it = this.selected();
    if (!it || this.busy) return;
    this.busy = true;
    this.renderInfo();
    const method = this.mode === 'mix' ? (all ? 'materialMixAll' : 'materialMixOne') : (all ? 'jewelUpdateAll' : 'jewelUpdateOne');
    try {
      const r = await this.host.client.call<MaterialMixReply>(method, this.num, it.id, false);
      if (r.flag) toast(this.successText(all, r.finalNum));
      // Failure: the server push already announced the reason.
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      this.busy = false;
      if (!this.disposed) this.render();
    }
  }

  private successText(all: boolean, finalNum: number): string {
    const what = this.mode === 'mix' ? 'nguyên liệu' : 'bảo thạch';
    const verb = this.mode === 'mix' ? 'Dung hợp' : 'Thăng cấp';
    return all && finalNum > 0 ? `${verb} thành công ${finalNum} ${what}!` : `${verb} thành công 1 ${what}!`;
  }
}

export const mixTab: ForgeTab = {
  id: 'mix', label: 'Ng.liệu', group: 'mix', build: (host, body) => new MixView(host, body, 'mix'),
};
export const jewelTab: ForgeTab = {
  id: 'jewel', label: 'Bảo thạch', group: 'jewel', build: (host, body) => new MixView(host, body, 'jewel'),
};
