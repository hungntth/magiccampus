// "Danh hiệu" window (legacy TitleSelectPanel, 260x385): tab 0 permanent titles (ct) with set / clear, tab 1 timed / special
// titles (cts) with show / hide. Selecting a row shows the description and the buff text. Pure view: TitleController owns the data.

import { parseTitleStyle, type TitleView } from '@mc/shared';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import './titlePanel.css';

export interface TitlePanelHost {
  /** Titles of each tab (permanent = ct, timed = cts) and which ids are active now. */
  data(): { perm: TitleView[]; timed: TitleView[]; active: number; actActive: number };
  onSet(tab: 0 | 1, id: number): void;
  onClear(tab: 0 | 1): void;
  onClose(): void;
}

const TABS = ['Danh hiệu vĩnh viễn', 'Danh hiệu có thời hạn'];

export class TitlePanel {
  private root: HTMLElement | null = null;
  private tab: 0 | 1 = 0;
  private selected = new Map<number, number>(); // tab -> selected title id
  private busy = false;
  private offs: (() => void)[] = [];

  constructor(private readonly host: TitlePanelHost) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(): void {
    if (this.root) return;
    const root = el('div', 'title-panel');
    const header = el('div', 'title-header');
    header.appendChild(el('div', 'title-name', 'Danh hiệu'));
    const x = el('button', 'title-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.host.onClose();
    root.append(header, x);
    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header), closeOnEscape(() => this.host.onClose()));
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
  }

  /** The server answered: buttons are usable again. */
  settle(): void {
    this.busy = false;
    this.render();
  }

  render(): void {
    const root = this.root;
    if (!root) return;
    root.querySelector('.title-body')?.remove();
    const d = this.host.data();
    const list = this.tab === 0 ? d.perm : d.timed;
    const activeId = this.tab === 0 ? d.active : d.actActive;
    const sel = this.selected.get(this.tab) ?? 0;
    const body = el('div', 'title-body');
    const tabs = el('div', 'title-tabs');
    TABS.forEach((label, i) => {
      const b = el('button', `title-tab${i === this.tab ? ' on' : ''}`, label);
      b.onclick = () => {
        this.tab = i as 0 | 1;
        this.render();
      };
      tabs.appendChild(b);
    });
    const rows = el('div', 'title-list');
    for (const t of list) {
      const st = parseTitleStyle(t.a);
      const row = el('div', `title-row${t.id === sel ? ' sel' : ''}`);
      row.appendChild(el('span', 'title-mark', t.id === activeId ? '●' : '○'));
      const name = el('span', 'title-text', `${st.prefix}${t.n}${st.suffix}`);
      name.style.color = st.color;
      row.appendChild(name);
      if (t.exp) row.title = `Hết hạn: ${new Date(t.exp).toLocaleString()}`;
      row.onclick = () => {
        this.selected.set(this.tab, t.id);
        this.render();
      };
      rows.appendChild(row);
    }
    if (list.length === 0) rows.appendChild(el('div', 'title-empty', 'Chưa có danh hiệu'));
    const info = el('div', 'title-info');
    const cur = list.find((t) => t.id === sel);
    info.appendChild(el('div', 'title-h', 'Giới Thiệu Danh Hiệu'));
    info.appendChild(el('div', 'title-desc', cur ? cur.i.replace(/\\n/g, '\n') : ''));
    info.appendChild(el('div', 'title-h', 'Thuộc Tính Danh Hiệu'));
    info.appendChild(el('div', 'title-desc', cur ? cur.bt || 'Không' : ''));
    const btns = el('div', 'title-btns');
    const set = el('button', 'title-btn', this.tab === 0 ? 'Thiết lập danh hiệu' : 'Hiển thị danh hiệu');
    set.disabled = this.busy || !cur || cur.id === activeId;
    set.onclick = () => this.fire(() => this.host.onSet(this.tab, sel));
    const clear = el('button', 'title-btn', this.tab === 0 ? 'Hủy danh hiệu hiện tại' : 'Hủy hiển thị');
    clear.disabled = this.busy || activeId <= 0;
    clear.onclick = () => this.fire(() => this.host.onClear(this.tab));
    btns.append(set, clear);
    body.append(tabs, rows, info, btns);
    root.appendChild(body);
  }

  private fire(action: () => void): void {
    this.busy = true;
    this.render();
    action();
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
