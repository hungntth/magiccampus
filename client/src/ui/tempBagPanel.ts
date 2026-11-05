// "Túi Tiện Dụng" window (legacy TempBagSlot): two tabs (normal / Túi Ma Tâm tạm thời), five holder slots (Mở + gold cost, drop a
// type-517 bag item on an opened one), a 24-slot paged grid of the usable capacity, Sắp xếp, Mở nhanh (Ma Tâm tab), and the
// "Trực tiếp đặt vào túi tiện dụng" checkbox. Pure view: TempBagController owns the data and the RPCs.
// Interactions: drop a bag item on a slot = addtItemFromBag, drag between slots = moveItemBtwTemp, double-click = back to the bag,
// right-click = destroy the stack, drag onto the bag window = addItemFromTemp (Shift splits).

import { TEMP_BAG, type BagItem, type TBag, type TempSubBag } from '@mc/shared';
import { iconUrl } from '../assets';
import { dragging, endDrag, fillItemCell, startDrag } from './itemCell';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import './bag.css';
import './tempBag.css';

export interface TempBagPanelHost {
  tBag(): TBag;
  bagItem(id: number): BagItem | undefined;
  playerLevel(): number;
  onPutFromBag(mx: boolean, item: BagItem, pos: number): void;
  onMove(mx: boolean, from: number, to: number): void;
  onTake(mx: boolean, pos: number): void;
  onDestroy(mx: boolean, pos: number): void;
  onPlaceHolder(mx: boolean, item: BagItem, holderIdx: number): void;
  onOpenSlot(mx: boolean): void;
  onSort(mx: boolean): void;
  onQuickOpen(): void;
  onDire(on: boolean): void;
  onClose(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class TempBagPanel {
  private root: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private mx = false;
  private readonly pages = { normal: 0, mx: 0 };

  constructor(private readonly host: TempBagPanelHost) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(): void {
    if (this.root) return this.render();
    const root = el('div', 'bag-panel temp-bag-panel');
    const header = el('div', 'bag-header');
    header.appendChild(el('div', 'bag-title', 'Túi Tiện Dụng'));
    const x = el('button', 'bag-close');
    x.title = 'Đóng';
    x.onclick = () => this.host.onClose();
    this.body = el('div', 'tb-body');
    root.append(header, x, this.body);
    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header, 'tempBagPanel'), closeOnEscape(() => this.host.onClose()));
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
    this.body = null;
  }

  render(): void {
    if (!this.root || !this.body) return;
    const tb = this.host.tBag();
    const sub: TempSubBag = this.mx ? tb.mx : tb;
    this.body.replaceChildren(this.tabs(), this.holders(sub), this.grid(sub), this.footer(tb, sub));
  }

  private tabs(): HTMLElement {
    const row = el('div', 'bag-tab-row tb-tabs');
    for (const [mx, label] of [[false, 'Túi Tiện Dụng'], [true, 'Túi Ma Tâm']] as const) {
      const b = el('button', mx === this.mx ? 'bag-tab wide selected' : 'bag-tab wide', label);
      if (mx) b.title = 'Túi Ma Tâm tạm thời';
      b.onclick = () => {
        this.mx = mx;
        this.render();
      };
      row.appendChild(b);
    }
    return row;
  }

  /** Five holder slots: placed holder icon, an empty opened slot (drop target), the next one to buy (Mở) or locked. */
  private holders(sub: TempSubBag): HTMLElement {
    const box = el('div', 'bag-box tb-holders');
    box.appendChild(el('div', 'tb-label', 'Mở rộng túi tiện dụng'));
    const row = el('div', 'tb-holder-row');
    for (let idx = 1; idx <= TEMP_BAG.HOLDERS; idx++) {
      const placed = sub.tempBag[String(idx)];
      const cell = el('div', 'bag-cell tb-holder');
      if (idx <= sub.tempbagNum) {
        cell.ondragover = (e) => {
          if (dragging()?.from === 'bag') e.preventDefault();
        };
        cell.ondrop = (e) => {
          e.preventDefault();
          const d = dragging();
          endDrag();
          const item = d?.from === 'bag' ? this.host.bagItem(d.id) : undefined;
          if (item) this.host.onPlaceHolder(this.mx, item, idx);
        };
        if (placed) this.fillHolder(cell, placed);
        else cell.title = 'Kéo Túi Tiện Dụng từ túi đồ vào đây';
      } else if (idx === sub.tempbagNum + 1) {
        const open = el('button', 'tb-open', 'Mở');
        open.title = `${TEMP_BAG.HOLDER_COST[sub.tempbagNum]} vàng`;
        open.onclick = () => this.host.onOpenSlot(this.mx);
        cell.appendChild(open);
      } else {
        cell.classList.add('locked');
      }
      row.appendChild(cell);
    }
    box.appendChild(row);
    return box;
  }

  private fillHolder(cell: HTMLElement, h: NonNullable<TempSubBag['tempBag'][string]>): void {
    cell.classList.add('filled');
    if (h.ot) cell.classList.add('expired');
    if (h.iconCode && h.iconCode !== '0') {
      const img = document.createElement('img');
      img.src = iconUrl(h.iconCode);
      img.alt = '';
      img.draggable = false;
      img.onerror = () => img.remove();
      cell.appendChild(img);
    }
    const when = h.t > 0 ? `${h.ot ? 'Đã hết hạn' : 'Hạn dùng'}: ${new Date(h.t).toLocaleString('vi-VN')}` : 'Vĩnh viễn';
    cell.title = `${h.name ?? `#${h.tid}`}\n${h.slots ?? 0} ô\n${when}`;
  }

  private grid(sub: TempSubBag): HTMLElement {
    const box = el('div', 'bag-box tb-items');
    const grid = el('div', 'bag-grid');
    const key = this.mx ? 'mx' : 'normal';
    const maxPos = Math.max(0, ...Object.keys(sub.tempList).map(Number));
    const total = Math.max(sub.tempSlotNum, maxPos, 1);
    const pages = Math.ceil(total / TEMP_BAG.PAGE);
    const page = Math.min(this.pages[key], pages - 1);
    this.pages[key] = page;
    for (let i = 0; i < TEMP_BAG.PAGE; i++) {
      const pos = page * TEMP_BAG.PAGE + i + 1;
      grid.appendChild(pos > total ? el('div', 'bag-cell locked') : this.cell(sub, pos));
    }
    const pager = el('div', 'tb-pager');
    const prev = el('button', 'tb-page', '‹');
    const next = el('button', 'tb-page', '›');
    prev.disabled = page <= 0;
    next.disabled = page >= pages - 1;
    prev.onclick = () => {
      this.pages[key] = page - 1;
      this.render();
    };
    next.onclick = () => {
      this.pages[key] = page + 1;
      this.render();
    };
    pager.append(prev, el('span', 'tb-page-no', `${page + 1}/${pages}`), next);
    box.append(grid);
    const wrap = el('div', 'tb-items-wrap');
    wrap.append(box, pager);
    return wrap;
  }

  private cell(sub: TempSubBag, pos: number): HTMLElement {
    const c = el('div', pos > sub.tempSlotNum ? 'bag-cell locked' : 'bag-cell');
    const from = this.mx ? 'mx' : 'temp';
    c.ondragover = (e) => {
      const d = dragging();
      if (d && (d.from === 'bag' || d.from === from)) e.preventDefault();
    };
    c.ondrop = (e) => {
      e.preventDefault();
      const d = dragging();
      endDrag();
      if (!d) return;
      if (d.from === 'bag') {
        const item = this.host.bagItem(d.id);
        if (item) this.host.onPutFromBag(this.mx, item, pos);
      } else if (d.from === from && d.pos !== undefined && d.pos !== pos) {
        this.host.onMove(this.mx, d.pos, pos);
      }
    };
    const item = sub.tempList[String(pos)]?.item;
    if (!item) return c;
    fillItemCell(c, item, { level: this.host.playerLevel() }, from);
    c.ondragstart = (e) => startDrag(e, { from, id: item.id, sid: 0, pos });
    c.ondblclick = () => this.host.onTake(this.mx, pos);
    c.oncontextmenu = (e) => {
      e.preventDefault();
      this.host.onDestroy(this.mx, pos);
    };
    return c;
  }

  private footer(tb: TBag, sub: TempSubBag): HTMLElement {
    const foot = el('div', 'tb-foot');
    foot.appendChild(el('span', 'tb-cur', `${sub.curNum}/${sub.tempSlotNum}`));
    const sort = el('button', 'tb-btn', 'Sắp xếp');
    sort.title = 'Sắp xếp: hệ thống sẽ sắp xếp theo thứ tự các vật phẩm trong túi tiện dụng';
    sort.onclick = () => this.host.onSort(this.mx);
    foot.appendChild(sort);
    if (this.mx) {
      const quick = el('button', 'tb-btn', 'Mở nhanh');
      quick.title = 'Mở nhanh: Mở nhanh tất cả Ma Tâm trong túi';
      quick.onclick = () => this.host.onQuickOpen();
      foot.appendChild(quick);
    }
    const label = el('label', 'tb-dire');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = tb.dire === 1;
    cb.onchange = () => this.host.onDire(cb.checked);
    label.append(cb, ' Trực tiếp đặt vào túi tiện dụng');
    const hint = el('div', 'tb-hint', this.mx
      ? 'Ma Tâm rơi khi đánh quái sẽ vào Túi Ma Tâm tạm thời trước. Nhấp đôi để lấy ra túi đồ, nhấp phải để hủy.'
      : 'Chỉ đặt được bảo thạch, lông vũ, nguyên liệu. Nhấp đôi để lấy ra túi đồ, nhấp phải để hủy.');
    const wrap = el('div', 'tb-foot-wrap');
    wrap.append(foot, label, hint);
    return wrap;
  }
}
