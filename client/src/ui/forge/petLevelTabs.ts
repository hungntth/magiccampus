// Forge tabs "Thăng cấp" (petEquLevelUp) and "Đổi màu" (petEquModColor) for pet gear. Both answer {flag, msg}; the server
// pushes the slot / item / wallet changes. Shard counts come from the shared plan helpers (spec positions 56-57 use 2529 / 2528).

import type { BagItem, PetEquLevelUpReply, PetEquModColorReply } from '@mc/shared';
import { isSpecialPetEquipPosition, petEquipColor, petEquipColorPlan, petEquipLevelUpPlan } from '@mc/shared';
import { toast } from '../screens';
import { el } from '../shopCell';
import type { ForgeHost, ForgeTab } from './forgeTypes';
import { material, PetGearView } from './petGearTab';

const COLOR_NAMES = ['trắng', 'xanh lá', 'xanh dương', 'tím', 'cam'] as const;

class LevelView extends PetGearView {
  constructor(host: ForgeHost, body: HTMLElement) {
    super(host, body);
    this.start();
  }

  protected renderDetail(): void {
    const eq = this.picker.selected();
    if (!eq) return this.hint('Chọn trang bị pet để thăng cấp (nhấp vào trang bị hoặc nhấp đúp từ túi). Chỉ trang bị pet khóa mới thăng cấp được.');
    const plan = petEquipLevelUpPlan(eq.reqLevel, isSpecialPetEquipPosition(eq.position));
    if (!plan) return this.detail.replaceChildren(this.title(eq), el('div', 'forge-hint', 'Trang bị này không thể thăng cấp tiếp.'));
    this.slots.set([material(plan.itemId, plan.num)]);
    const go = el('button', 'shop-btn forge-go', 'Thăng cấp');
    go.disabled = this.busy || !this.slots.ready() || !eq.binded;
    go.onclick = () => void this.act(() => this.run(eq));
    this.detail.replaceChildren(
      this.title(eq), this.slots.root,
      el('div', 'forge-rates', `Cần ${plan.num} nguyên liệu và bạc theo cấp mới (cấp x cấp x 10). Số sao và màu được giữ lại.`),
      ...(eq.binded ? [] : [el('div', 'forge-hint', 'Chỉ trang bị pet khóa mới thăng cấp được.')]), go,
    );
  }

  private async run(eq: BagItem): Promise<void> {
    const ids = this.slots.ids();
    if (!ids) return;
    const r = await this.host.client.call<PetEquLevelUpReply>('petEquLevelUp', eq.id, ids[0]);
    if (r.flag) toast('Thăng cấp thành công!');
    else toast(r.msg || 'Thăng cấp thất bại', true);
  }
}

class ColorView extends PetGearView {
  constructor(host: ForgeHost, body: HTMLElement) {
    super(host, body);
    this.start();
  }

  protected renderDetail(): void {
    const eq = this.picker.selected();
    if (!eq) return this.hint('Chọn trang bị pet để đổi màu (nhấp vào trang bị hoặc nhấp đúp từ túi). Chỉ trang bị pet khóa mới đổi màu được.');
    const color = petEquipColor(eq.color);
    const plan = petEquipColorPlan(color, isSpecialPetEquipPosition(eq.position));
    if (!plan) return this.detail.replaceChildren(this.title(eq), el('div', 'forge-hint', 'Phẩm chất trang bị của bạn đã là tối đa!'));
    this.slots.set([material(plan.itemId, plan.num)]);
    const go = el('button', 'shop-btn forge-go', 'Đổi màu');
    go.disabled = this.busy || !this.slots.ready() || !eq.binded;
    go.onclick = () => void this.act(() => this.run(eq));
    const info = el('div', 'forge-rates');
    info.append(
      el('span', 'forge-rate', `Màu hiện tại: ${COLOR_NAMES[color]}  ->  ${COLOR_NAMES[color + 1]}`),
      el('span', 'forge-rate', `Tỷ lệ thành công: ${plan.rate}%`),
      el('span', '', 'Thất bại vẫn mất nguyên liệu. Tốn bạc cấp x cấp x 10.'),
    );
    this.detail.replaceChildren(this.title(eq), this.slots.root, info, ...(eq.binded ? [] : [el('div', 'forge-hint', 'Chỉ trang bị pet khóa mới đổi màu được.')]), go);
  }

  private async run(eq: BagItem): Promise<void> {
    const ids = this.slots.ids();
    if (!ids) return;
    const r = await this.host.client.call<PetEquModColorReply>('petEquModColor', eq.id, ids[0]);
    // The server pushes the success / roll-failure note itself; a refusal charges nothing (num 0) and only carries msg.
    if (!r.flag && r.num === 0) toast(r.msg || 'Đổi màu thất bại', true);
  }
}

export const petLevelTab: ForgeTab = { id: 'petLevel', label: 'Thăng cấp', build: (host, body) => new LevelView(host, body) };
export const petColorTab: ForgeTab = { id: 'petColor', label: 'Đổi màu', build: (host, body) => new ColorView(host, body) };
