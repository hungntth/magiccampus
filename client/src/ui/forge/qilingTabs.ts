// Forge tabs "Kỳ Linh" (updateQiLingProp) and "Trùng Chú" (updateChongZhu) = QiLingPanel (activity 68): pick gear above level 150, see its three
// lines with the Flash colour bands, the candidate props of its slot, the stone cost and the set bonus of the full lines of every worn piece.
// The roll answers true and pushes the result (onQiLingRes / onChongZhuRes); the refreshed lines arrive with the item push.

import type { BagItem, ChongZhuResPush, QilingLine, UpgradeMaterial } from '@mc/shared';
import {
  QILING_COST, QILING_LABELS, QILING_LINE_COUNT, QILING_LOCK_COST, QILING_PLANS, QILING_REBUILD_COST, QILING_STONE, QILING_STONE_GOLD, SlotType,
  qilingColorOf, qilingFullCount, qilingLineText, qilingSetBonusPercent,
} from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { toast } from '../screens';
import { el } from '../shopCell';
import { isEquipment } from './equipPicker';
import type { ForgeHost, ForgeTab } from './forgeTypes';
import { bagCount, PetGearView } from './petGearTab';

const TEXT = {
  fullAsk: 'Trang bị đã đầy dòng thuộc tính, xác định Kỳ Linh lại từ đầu?',
  unlockedAsk: 'Dòng thuộc tính chưa khóa, xác nhận Trùng Chú?',
  newLine: 'Chúc mừng bạn đã tạo ra 1 dòng thuộc tính mới.',
  auto: 'Kỳ Linh Thạch không đủ tự động mua (6 vàng 1 cái)',
  limit: 'Điều kiện: trang bị trên cấp 150 mới có thể Kỳ Linh. Mỗi lần Kỳ Linh cho ra 3 dòng thuộc tính ngẫu nhiên.',
} as const;

const stone = (num: number): UpgradeMaterial => ({ slot: 1, tid: QILING_STONE, name: 'Kỳ Linh Thạch', num });
const colored = (l: QilingLine): HTMLElement => {
  const row = el('div', 'forge-rate', qilingLineText(l));
  row.style.color = qilingColorOf(l);
  return row;
};

/** "Số dòng đầy ... All T.Tính+x%" from the lines of every worn piece (Go counts every worn Kỳ Linh item). */
function setBonusLine(host: ForgeHost): HTMLElement {
  const worn = host.items().filter((i) => i.slotType === SlotType.EQUIP).flatMap((i) => i.qiling ?? []);
  const full = qilingFullCount(worn);
  const pct = qilingSetBonusPercent(full);
  return el('div', 'forge-hint', `Dòng đạt MAX trên trang bị đang mặc: ${full}${pct > 0 ? `  →  All T.Tính +${pct}%` : '  (MAX2: +2%, MAX4: +5%, MAX6: +8%, MAX8: +12%, MAX10: +16%, MAX12: +20%)'}`);
}

abstract class QilingBase extends PetGearView {
  protected auto = false;

  protected constructor(host: ForgeHost, body: HTMLElement) {
    super(host, body, { items: () => host.items(), allow: (i) => isEquipment(i) && i.qilingSlot !== undefined });
  }

  protected autoBox(): HTMLElement {
    const box = el('input', '');
    box.type = 'checkbox';
    box.checked = this.auto;
    box.onchange = () => {
      this.auto = box.checked;
    };
    const row = el('label', 'forge-check');
    row.append(box, document.createTextNode(` ${TEXT.auto}`));
    return row;
  }

  protected stoneRow(need: number): HTMLElement {
    this.slots.set([stone(need)]);
    const have = bagCount(this.host, QILING_STONE);
    return el('div', 'forge-rates', `Kỳ Linh Thạch cần: ${need}   đang có: ${have}${have < need ? `  (thiếu ${need - have}: ${(need - have) * QILING_STONE_GOLD} vàng nếu tự mua)` : ''}`);
  }

  protected lines(eq: BagItem): HTMLElement {
    const box = el('div', 'forge-detail');
    box.append(...(eq.qiling && eq.qiling.length === QILING_LINE_COUNT ? eq.qiling.map(colored) : [el('div', 'forge-hint', 'Chưa có thuộc tính Kỳ Linh.')]));
    return box;
  }

  protected async call(method: string, ...args: unknown[]): Promise<void> {
    await this.host.client.call<boolean>(method, ...args);
  }
}

class QilingView extends QilingBase {
  constructor(host: ForgeHost, body: HTMLElement) {
    super(host, body);
    this.start();
  }

  protected renderDetail(): void {
    const eq = this.picker.selected();
    if (!eq) return this.hint(`${TEXT.limit}\nĐặt trang bị (nhấp vào trang bị hoặc nhấp đúp từ túi).`);
    const plan = QILING_PLANS[eq.qilingSlot ?? -1] ?? [];
    const go = el('button', 'shop-btn forge-go', 'Kỳ Linh');
    go.disabled = this.busy;
    go.onclick = () => this.begin(eq);
    this.detail.replaceChildren(
      this.title(eq), this.lines(eq), this.slots.root, this.stoneRow(QILING_COST), this.autoBox(),
      el('div', 'forge-hint', `Thuộc tính có thể Kỳ Linh: ${plan.map((c) => QILING_LABELS[c.t] ?? `#${c.t}`).join(', ')}`),
      setBonusLine(this.host), go,
    );
  }

  private begin(eq: BagItem): void {
    const run = (): void => void this.act(() => this.call('updateQiLingProp', eq.id, this.auto ? 'auto' : ''));
    const full = eq.qiling !== undefined && eq.qiling.length > 0 && qilingFullCount(eq.qiling) === eq.qiling.length;
    if (full) askConfirm(TEXT.fullAsk, run);
    else run();
  }
}

class ChongZhuView extends QilingBase {
  private readonly locks = [false, false, false];
  private readonly off: () => void;

  constructor(host: ForgeHost, body: HTMLElement) {
    super(host, body);
    // Flash newPropAlert: an unlocked line that reached its cap.
    this.off = host.client.on('onChongZhuRes', (payload) => {
      const res = payload as ChongZhuResPush | null;
      const use = res?.use;
      if (use && [0, 1, 2].some((i) => !this.locks[i] && use[String(i)] && use[String(i)].v === use[String(i)].max)) toast(TEXT.newLine);
    });
    this.start();
  }

  dispose(): void {
    this.off();
    super.dispose();
  }

  protected renderDetail(): void {
    const eq = this.picker.selected();
    if (!eq) return this.hint(`Trùng Chú chỉ đổi giá trị thuộc tính Kỳ Linh, dòng đã khóa được giữ nguyên.\nĐặt trang bị đã Kỳ Linh (nhấp vào trang bị hoặc nhấp đúp từ túi).`);
    if (!eq.qiling || eq.qiling.length !== QILING_LINE_COUNT) return this.detail.replaceChildren(this.title(eq), el('div', 'forge-hint', 'Trang bị chưa Kỳ Linh: hãy Kỳ Linh trước ở tab Kỳ Linh.'));
    const locked = this.locks.filter(Boolean).length;
    const need = QILING_REBUILD_COST + locked * QILING_LOCK_COST;
    const rows = eq.qiling.map((l, i) => {
      const box = el('input', '');
      box.type = 'checkbox';
      box.checked = this.locks[i];
      box.onchange = () => {
        this.locks[i] = box.checked;
        this.renderDetail();
      };
      const row = el('label', 'forge-check');
      row.append(box, document.createTextNode(' Khóa  '), colored(l));
      return row;
    });
    const go = el('button', 'shop-btn forge-go', 'Trùng Chú');
    go.disabled = this.busy || locked >= QILING_LINE_COUNT;
    go.onclick = () => this.begin(eq, locked);
    this.detail.replaceChildren(
      this.title(eq), ...rows, this.slots.root, this.stoneRow(need), this.autoBox(),
      el('div', 'forge-hint', `Mỗi dòng khóa tốn thêm ${QILING_LOCK_COST} Kỳ Linh Thạch.`), setBonusLine(this.host), go,
    );
  }

  private begin(eq: BagItem, locked: number): void {
    const run = (): void => void this.act(() => this.call('updateChongZhu', eq.id, ...this.locks.map((l) => (l ? 'lock' : '')), this.auto ? 'auto' : ''));
    if (locked < QILING_LINE_COUNT && locked === 0) askConfirm(TEXT.unlockedAsk, run);
    else run();
  }
}

export const qilingTab: ForgeTab = { id: 'qiling', label: 'Kỳ Linh', build: (host, body) => new QilingView(host, body) };
export const chongZhuTab: ForgeTab = { id: 'chongzhu', label: 'Trùng Chú', build: (host, body) => new ChongZhuView(host, body) };
