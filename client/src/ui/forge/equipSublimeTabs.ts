// Forge tabs "Thăng hoa" (sublimeEquip / onValidateSublime) and "Khắc chế" (restrainEquip / onValidateRestrain, push validateRestrain) for the
// character's own gear (bag and worn). Missing dust is bought with gold only after a confirm: the sublime Yes calls onValidateSublime, the
// restrain Yes answers the validateRestrain push with onValidateRestrain. State comes from BagItem.sublime; costs from the shared table.

import type { BagItem, EquipSublimeReply, PetSublimeState } from '@mc/shared';
import {
  EQUIP_RESTRAIN_GOLD, EQUIP_RESTRAIN_ITEM, EQUIP_RESTRAIN_ITEM_NUM, EQUIP_SUBLIME_DUST_GOLD, EQUIP_SUBLIME_ELEMENTS, EQUIP_SUBLIME_ITEM,
  EQUIP_SUBLIME_MAX_LEVEL, EQUIP_PROP_LABELS, equipDisplayColor, equipSublimeBlocker, equipSublimeStep, isEquipSublimeAttack,
} from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { toast } from '../screens';
import { el } from '../shopCell';
import { isEquipment } from './equipPicker';
import type { ForgeHost, ForgeTab } from './forgeTypes';
import { bagCount, bigStack, material, PetGearView } from './petGearTab';

const HINT = 'Điều kiện：\n1.Trang bị phải khóa\n2.Cấp độ trang bị>=50\n3.Phẩm chất trang bị là trác việt cam';

const stateOf = (eq: BagItem): PetSublimeState => eq.sublime ?? { id: 0, add: 0, element: 0 };
const elementName = (e: number): string => EQUIP_SUBLIME_ELEMENTS[e] ?? 'Chưa có';
/** Same gate as the server (equipSublimeBlocker); null when the piece qualifies. */
const blocker = (eq: BagItem): string | null => {
  const quality = eq.quality ?? 0;
  const prefix = eq.prefix || (quality > 0 ? (quality % 5 === 0 ? 5 : quality % 5) : 0);
  return equipSublimeBlocker({ bound: eq.binded, reqLevel: eq.reqLevel, prefix, color: equipDisplayColor(eq.color, quality) }) && HINT;
};
const own = (host: ForgeHost) => ({ items: () => host.items(), allow: isEquipment });

class SublimeView extends PetGearView {
  constructor(host: ForgeHost, body: HTMLElement) {
    super(host, body, own(host));
    this.start();
  }

  protected renderDetail(): void {
    const eq = this.picker.selected();
    if (!eq) return this.hint(`Đặt trang bị cần thăng hoa (nhấp vào trang bị hoặc nhấp đúp từ túi). Tối đa cấp ${EQUIP_SUBLIME_MAX_LEVEL}, thất bại cộng dồn tỷ lệ.`);
    const s = stateOf(eq);
    const step = equipSublimeStep(s.id + 1, isEquipSublimeAttack(eq.position));
    const head = [this.title(eq), el('div', 'forge-rates', `Cấp thăng hoa: ${s.id}/${EQUIP_SUBLIME_MAX_LEVEL}   Nguyên tố: ${elementName(s.element)}`)];
    const blocked = blocker(eq);
    if (blocked) return this.detail.replaceChildren(...head, el('div', 'forge-hint', blocked));
    if (!step) return this.detail.replaceChildren(...head, el('div', 'forge-hint', 'Trang bị đã đạt cấp thăng hoa cao nhất'));
    this.slots.set([material(EQUIP_SUBLIME_ITEM, step.dust)]);
    const have = bagCount(this.host, EQUIP_SUBLIME_ITEM);
    const rate = Math.min(100, step.rate + s.add);
    const lines = step.lines.map((l) => `${EQUIP_PROP_LABELS[l.prop] ?? `#${l.prop}`}+${l.num}`).join('  ');
    const go = el('button', 'shop-btn forge-go', 'Thăng hoa');
    go.disabled = this.busy;
    go.onclick = () => this.begin(eq, step.dust, have);
    this.detail.replaceChildren(
      ...head, this.slots.root,
      el('div', 'forge-rates', `Bụi Vô Hạn cần: ${step.dust}   Tỉ lệ thành công: ${rate}%${s.add > 0 ? ` (đã cộng dồn +${s.add}%)` : ''}`),
      el('div', 'forge-rates', `Thuộc tính sau cấp ${step.level}: ${lines || 'Không'}`),
      el('div', 'forge-hint', 'Bụi Vô Hạn không đủ sẽ tự động mua bằng vàng (có xác nhận).'), go,
    );
  }

  private begin(eq: BagItem, need: number, have: number): void {
    const dust = bigStack(this.host, EQUIP_SUBLIME_ITEM)?.id ?? 0;
    if (have >= need) return void this.act(() => this.run('sublimeEquip', eq, dust, false));
    const gold = (need - have) * EQUIP_SUBLIME_DUST_GOLD;
    askConfirm(`Thiếu ${need - have} Bụi Vô Hạn, thăng hoa sẽ mất ${gold} vàng để mua phần thiếu, xác nhận tiếp tục?`,
      () => void this.act(() => this.run('onValidateSublime', eq, dust, true)));
  }

  /** The server pushes the result note and the new item view; null = refused (its note was pushed). */
  private async run(method: string, eq: BagItem, dust: number, autoBuy: boolean): Promise<void> {
    await this.host.client.call<EquipSublimeReply | null>(method, ...(method === 'sublimeEquip' ? [eq.id, dust, autoBuy] : [eq.id, dust]));
  }
}

class RestrainView extends PetGearView {
  private element = 0;
  private readonly off: () => void;

  constructor(host: ForgeHost, body: HTMLElement) {
    super(host, body, own(host));
    this.off = host.client.on('validateRestrain', (equipId, element) => this.confirmGold(Number(equipId), Number(element)));
    this.start();
  }

  dispose(): void {
    this.off();
    super.dispose();
  }

  protected renderDetail(): void {
    const eq = this.picker.selected();
    if (!eq) return this.hint('Đặt trang bị đã thăng hoa (nhấp vào trang bị hoặc nhấp đúp từ túi). Tốn 1 Bụi Ma Pháp để đổi nguyên tố khắc chế.');
    const s = stateOf(eq);
    const head = [this.title(eq), el('div', 'forge-rates', `Cấp thăng hoa: ${s.id}   Nguyên tố hiện tại: ${elementName(s.element)}`)];
    if (s.id <= 0) return this.detail.replaceChildren(...head, el('div', 'forge-hint', 'Đặt trang bị đã thăng hoa'));
    this.slots.set([material(EQUIP_RESTRAIN_ITEM, EQUIP_RESTRAIN_ITEM_NUM)]);
    const select = el('select', 'forge-num');
    const options: [number, string][] = [[0, 'Chọn Nguyên Tố'], ...Object.entries(EQUIP_SUBLIME_ELEMENTS).map(([k, v]): [number, string] => [Number(k), v])];
    for (const [value, label] of options) {
      const o = el('option', '', label);
      o.value = String(value);
      select.appendChild(o);
    }
    select.value = String(this.element);
    select.onchange = () => {
      this.element = Number(select.value);
      this.renderDetail();
    };
    const go = el('button', 'shop-btn forge-go', 'Đổi');
    go.disabled = this.busy || this.element === 0 || this.element === s.element;
    go.onclick = () => void this.act(() => this.run(eq));
    const pick = el('div', 'forge-filter');
    pick.append(el('span', '', 'Chọn Nguyên Tố khắc chế:'), select);
    this.detail.replaceChildren(
      ...head, this.slots.root, pick,
      el('div', 'forge-rates', `Bụi Ma Pháp cần: ${EQUIP_RESTRAIN_ITEM_NUM}   (thiếu sẽ tự mua bằng ${EQUIP_RESTRAIN_GOLD} vàng, có xác nhận)`), go,
    );
  }

  private async run(eq: BagItem): Promise<void> {
    const dust = bigStack(this.host, EQUIP_RESTRAIN_ITEM);
    const have = bagCount(this.host, EQUIP_RESTRAIN_ITEM) >= EQUIP_RESTRAIN_ITEM_NUM;
    // Missing dust: autoBuy makes the server answer null and push validateRestrain(equipId, element), handled by confirmGold.
    const r = await this.host.client.call<EquipSublimeReply | null>('restrainEquip', eq.id, dust?.id ?? 0, this.element, !have);
    if (r) toast(`Thay đổi nguyên tố thành công thành: ${elementName(this.element)}`);
  }

  private confirmGold(equipId: number, element: number): void {
    askConfirm(`Đổi nguyên tố sẽ mất ${EQUIP_RESTRAIN_GOLD} vàng, xác nhận tiếp tục?`, () => void this.act(async () => {
      const r = await this.host.client.call<EquipSublimeReply | null>('onValidateRestrain', equipId, element);
      if (r) toast(`Thay đổi nguyên tố thành công thành: ${elementName(element)}`);
    }));
  }
}

export const sublimeTab: ForgeTab = { id: 'sublime', label: 'Thăng hoa', build: (host, body) => new SublimeView(host, body) };
export const restrainTab: ForgeTab = { id: 'restrain', label: 'Khắc chế', build: (host, body) => new RestrainView(host, body) };
