// Forge tab "Cường hóa" (legacy "Thăng tinh"): pick an equipment piece, choose stones per attempt (1..5) and star it once
// (starOne) or up to 10 stars (starAll). Stone item 5; a failed roll keeps the star. Replies are awaited and shown as toasts
// with the Flash strings; the bag push redraws the star level.

import type { BagItem, StarReply } from '@mc/shared';
import { MAX_STAR, SlotType, STAR_STONE_MAX, STAR_STONE_TID, starRate } from '@mc/shared';
import { toast } from '../screens';
import { el } from '../shopCell';
import { EquipPicker } from './equipPicker';
import { forgeCell } from './forgeCell';
import type { ForgeHost, ForgeTab, ForgeTabView } from './forgeTypes';

class StarView implements ForgeTabView {
  private readonly picker: EquipPicker;
  private readonly detail = el('div', 'forge-detail');
  private count = STAR_STONE_MAX;
  private busy = false;
  private disposed = false;

  constructor(private readonly host: ForgeHost, body: HTMLElement) {
    this.picker = new EquipPicker(host, () => this.renderDetail());
    body.append(this.picker.root, this.detail);
    this.refresh();
  }

  dispose(): void {
    this.disposed = true;
  }

  refresh(): void {
    this.picker.render();
    this.renderDetail();
  }

  accept(item: BagItem): boolean {
    return this.picker.accept(item);
  }

  private stone(): BagItem | undefined {
    return this.host.items().filter((i) => i.slotType === SlotType.BAG && i.tid === STAR_STONE_TID && i.itemType === 1)
      .sort((a, b) => b.stackNum - a.stackNum)[0];
  }

  private renderDetail(): void {
    const eq = this.picker.selected();
    if (!eq) {
      this.detail.replaceChildren(el('div', 'forge-hint', 'Chọn trang bị để thăng sao (nhấp vào trang bị hoặc nhấp đúp từ túi).'));
      return;
    }
    const star = eq.star ?? 0;
    const stone = this.stone();
    const count = Math.max(1, Math.min(this.count, stone?.stackNum ?? STAR_STONE_MAX));
    const select = el('select', 'forge-num');
    for (let n = 1; n <= STAR_STONE_MAX; n++) {
      const o = el('option', '', `${n} đá`);
      o.value = String(n);
      select.appendChild(o);
    }
    select.value = String(count);
    select.onchange = () => {
      this.count = Number(select.value);
      this.renderDetail();
    };
    const maxed = star >= MAX_STAR;
    const enough = !!stone && stone.stackNum >= count;
    const rate = maxed ? '-' : `${starRate(star, count)}%`;
    const info = el('div', 'forge-rates');
    info.append(
      el('span', 'forge-rate', `Sao hiện tại: ${star}/${MAX_STAR}`),
      el('span', 'forge-rate', `Tỷ lệ thành công: ${rate}`),
      el('span', '', 'Thất bại không mất sao.'),
    );
    const stoneCell = forgeCell({
      iconCode: stone?.iconCode ?? '0', name: 'Thăng Tinh Thạch', color: 0, count: `${stone?.stackNum ?? 0}/${count}`, lacking: !enough,
      title: 'Thăng Tinh Thạch',
    }, 'forge-cell forge-slot');
    if (!stone) stoneCell.classList.add('empty');
    const stoneRow = el('div', 'forge-filter');
    stoneRow.append(stoneCell, el('span', '', 'Đá mỗi lần:'), select);
    const one = el('button', 'shop-btn forge-go', 'Thăng sao');
    const all = el('button', 'shop-btn forge-go', `Tự động đến ${MAX_STAR} sao`);
    one.disabled = all.disabled = this.busy || maxed || !enough;
    one.onclick = () => void this.run(eq, stone, count, null);
    all.onclick = () => void this.run(eq, stone, count, MAX_STAR);
    const buttons = el('div', 'forge-buttons');
    buttons.append(one, all);
    this.detail.replaceChildren(el('div', 'forge-title', `${eq.name}  *${star}`), stoneRow, info, buttons);
  }

  private async run(eq: BagItem, stone: BagItem | undefined, count: number, target: number | null): Promise<void> {
    if (!stone || this.busy) return;
    this.busy = true;
    this.renderDetail();
    const before = eq.star ?? 0;
    try {
      const r = target === null
        ? await this.host.client.call<StarReply>('starOne', count, eq.id, stone.id)
        : await this.host.client.call<StarReply>('starAll', count, eq.id, target, stone.id);
      if (r.starNum > before) toast(`Thăng tinh thành công lên ${r.starNum} sao!`);
      else if (r.starNum > 0) toast('Thăng tinh thất bại!', true); // refusals answer starNum 0 (the server push says why)
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      this.busy = false;
      if (!this.disposed) this.refresh();
    }
  }
}

export const starTab: ForgeTab = { id: 'star', label: 'Cường hóa', build: (host, body) => new StarView(host, body) };
