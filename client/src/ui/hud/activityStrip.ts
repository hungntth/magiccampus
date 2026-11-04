// Activity icon strip (legacy ActivityCanvas): 48x48 icons, 8 per row, two rows, paged by one row, sorted by sortType then id,
// gated per entry type (shared visibleStrip) and hidden when the system has no H5 panel. A red dot stays on an icon until it is
// clicked (H5 shows it on every icon of the session; Flash only on icons added after the first list).

import {
  ACTIVITY_LABEL, stripTabCount, stripWindow, visibleStrip, type ActivityStripList,
} from '@mc/shared';
import { stageEl } from '../stage';
import '../activity.css';

export interface StripHost {
  level(): number;
  /** rebirth exp (type 4 gate); H5 has no rebirth yet */
  expRe(): number;
  /** Whether the activity opens an H5 panel; icons of unported systems stay hidden. */
  has(id: number): boolean;
  open(id: number): void;
}

const el = (cls: string, text?: string, tag = 'div'): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class ActivityStrip {
  private readonly root = el('act-strip');
  private list: ActivityStripList = {};
  private tab = 1;
  private readonly seen = new Set<number>();

  constructor(private readonly host: StripHost, parent: HTMLElement = stageEl()) {
    parent.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }

  /** Login list or an updateActivityList push. */
  setList(list: ActivityStripList): void {
    this.list = list;
    this.render();
  }

  /** updateActivityState push: a type 3 entry's state code. */
  setState(id: number, sortType: number, flag: number): void {
    const e = this.list[String(id)];
    if (e) this.list[String(id)] = { ...e, flag, sortType };
    this.render();
  }

  /** Re-evaluate the gates (a level-up can reveal level-gated icons). */
  refresh(): void {
    this.render();
  }

  /** Ids currently drawn (tests / debugging). */
  shownIds(): number[] {
    return [...this.root.querySelectorAll<HTMLElement>('.act-icon')].map((e) => Number(e.dataset.id));
  }

  private render(): void {
    const icons = visibleStrip(this.list, { level: this.host.level(), expRe: this.host.expRe() }).filter((i) => this.host.has(i.id));
    const tabs = stripTabCount(icons.length);
    this.tab = Math.min(Math.max(1, this.tab), tabs);
    const collapsed = this.root.classList.contains('collapsed');
    this.root.replaceChildren();
    if (icons.length === 0) return;
    for (const { icon, x, y } of stripWindow(icons, this.tab)) this.root.appendChild(this.iconEl(icon.id, icon.label, 50 + x, y));
    if (tabs > 1) this.addPager(tabs);
    const toggle = el('act-toggle', collapsed ? '»' : '«', 'button');
    toggle.style.right = '0';
    toggle.style.top = '12px';
    toggle.title = collapsed ? 'Hiện biểu tượng hoạt động' : 'Ẩn biểu tượng hoạt động';
    toggle.onclick = () => {
      this.root.classList.toggle('collapsed');
      this.render();
    };
    this.root.appendChild(toggle);
  }

  private iconEl(id: number, label: string | undefined, left: number, top: number): HTMLElement {
    const e = el('act-icon', ACTIVITY_LABEL[id] ?? `#${id}`);
    e.dataset.id = String(id);
    e.style.left = `${left}px`;
    e.style.top = `${top}px`;
    e.title = ACTIVITY_LABEL[id] ?? '';
    if (!this.seen.has(id)) e.appendChild(el('act-dot'));
    e.onclick = () => {
      this.seen.add(id);
      e.querySelector('.act-dot')?.remove();
      this.host.open(id);
    };
    if (label) {
      const st = el('act-state', label);
      st.style.left = `${left + 4}px`;
      st.style.top = `${top + 48}px`;
      this.root.appendChild(st);
    }
    return e;
  }

  private addPager(tabs: number): void {
    const step = (d: number): void => {
      this.tab = ((this.tab - 1 + d + tabs) % tabs) + 1; // wraps like activateIconUp / Down
      this.render();
    };
    for (const [text, y, d] of [['▲', 48, -1], ['▼', 75, 1]] as const) {
      const b = el('act-pg', text, 'button');
      b.style.left = '10px';
      b.style.top = `${y}px`;
      b.onclick = () => step(d);
      this.root.appendChild(b);
    }
    const num = el('act-pgnum', String(this.tab));
    num.style.left = '-2px';
    this.root.appendChild(num);
  }
}
