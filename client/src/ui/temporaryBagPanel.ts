// "Túi tạm thời" window (legacy TemporaryBagPanel): the volatile overflow list (max 30 entries) in a 6 x 5 grid; double-click an
// entry = addSingleItemToBag(index), "Nhận toàn bộ" = addAllToBag. Pure view: TempBagController owns the list and the RPCs.

import { TEMP_BAG, type TemporaryEntry } from '@mc/shared';
import { iconUrl } from '../assets';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import './bag.css';
import './tempBag.css';

export interface TemporaryBagHost {
  entries(): readonly TemporaryEntry[];
  onTake(index: number): void;
  onTakeAll(): void;
  onClose(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class TemporaryBagPanel {
  private root: HTMLElement | null = null;
  private grid: HTMLElement | null = null;
  private count: HTMLElement | null = null;
  private offs: (() => void)[] = [];

  constructor(private readonly host: TemporaryBagHost) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(): void {
    if (this.root) return this.render();
    const root = el('div', 'bag-panel temporary-bag-panel');
    const header = el('div', 'bag-header');
    header.appendChild(el('div', 'bag-title', 'Túi tạm thời'));
    const x = el('button', 'bag-close');
    x.title = 'Đóng';
    x.onclick = () => this.host.onClose();
    root.append(header, x, el('div', 'tmp-note', '*Nhấp đôi vào vật phẩm để bỏ vào túi tạm thời'));
    const box = el('div', 'bag-box bag-items');
    this.grid = el('div', 'bag-grid');
    box.appendChild(this.grid);
    root.appendChild(box);
    const foot = el('div', 'tmp-foot');
    this.count = el('span', 'tb-cur');
    const all = el('button', 'tb-btn', 'Nhận toàn bộ');
    all.onclick = () => this.host.onTakeAll();
    foot.append(this.count, all);
    root.append(foot, el('div', 'tmp-warn', 'Khi offline, đổi kênh hoặc đổi nhân vật, hệ thống sẽ tự hủy các vật phẩm trong túi tạm thời!'));
    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header, 'temporaryBagPanel'), closeOnEscape(() => this.host.onClose()));
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
    this.grid = null;
    this.count = null;
  }

  render(): void {
    if (!this.root || !this.grid) return;
    const list = this.host.entries();
    const cells: HTMLElement[] = [];
    for (let i = 0; i < TEMP_BAG.TEMPORARY_MAX; i++) {
      const c = el('div', 'bag-cell');
      const e = list[i];
      if (e) {
        c.classList.add('filled');
        c.title = `${e.name}${e.stackNum > 1 ? ` x${e.stackNum}` : ''}`;
        if (e.iconCode && e.iconCode !== '0') {
          const img = document.createElement('img');
          img.src = iconUrl(e.iconCode);
          img.alt = '';
          img.draggable = false;
          img.onerror = () => img.remove();
          c.appendChild(img);
        }
        if (e.stackNum > 1) c.appendChild(el('span', 'bag-count', String(e.stackNum)));
        c.ondblclick = () => this.host.onTake(i);
      }
      cells.push(c);
    }
    this.grid.replaceChildren(...cells);
    if (this.count) this.count.textContent = `${list.length}/${TEMP_BAG.TEMPORARY_MAX}`;
  }
}
