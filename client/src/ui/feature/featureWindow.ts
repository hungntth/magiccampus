// "Tu luyện" window: frame, draggable header and the stat-feature tabs (Luyện Hồn, Giác Ngộ, Chiến Hồn, Pháp Tinh, Hắc Diệu, Tinh Cung).
// Pure shell: the controller renders the active tab into `body` through the host and refreshes it when its data changes.

import { closeOnEscape, makeDraggable } from '../panelBehavior';
import { stageEl } from '../stage';
import { el } from './dom';
import './featureWindow.css';

export const FEATURE_TABS = ['Luyện Hồn', 'Giác Ngộ', 'Chiến Hồn', 'Pháp Tinh', 'Hắc Diệu Thạch', 'Tinh Cung'] as const;

/** Title / tabs / extra class so another window (Thần khí) can reuse the shell. */
export interface FeatureWindowOptions {
  title?: string;
  tabs?: readonly string[];
  cls?: string;
}

export interface FeatureWindowHost {
  /** Draws tab `tab` into `body` (already emptied). */
  renderTab(tab: number, body: HTMLElement): void;
  /** The player switched tabs: load its data. */
  onTab(tab: number): void;
  onClose(): void;
}

export class FeatureWindow {
  private root: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private tab = 0;
  private offs: (() => void)[] = [];

  constructor(private readonly host: FeatureWindowHost, private readonly opts: FeatureWindowOptions = {}) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  get activeTab(): number {
    return this.tab;
  }

  show(tab = this.tab): void {
    if (this.root) return;
    this.tab = tab;
    const root = el('div', `feature-window${this.opts.cls ? ` ${this.opts.cls}` : ''}`);
    const header = el('div', 'ft-header');
    header.appendChild(el('div', 'ft-name', this.opts.title ?? 'Tu luyện'));
    const x = el('button', 'ft-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.host.onClose();
    root.append(header, x);
    const tabs = el('div', 'ft-tabs');
    (this.opts.tabs ?? FEATURE_TABS).forEach((label, i) => {
      const b = el('button', 'ft-tab', label);
      b.dataset.tab = String(i);
      b.onclick = () => this.select(i);
      tabs.appendChild(b);
    });
    this.body = el('div', 'ft-body');
    root.append(tabs, this.body);
    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header), closeOnEscape(() => this.host.onClose()));
    this.host.onTab(this.tab);
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
    this.body = null;
  }

  select(tab: number): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.host.onTab(tab);
    this.render();
  }

  render(): void {
    if (!this.root || !this.body) return;
    this.root.querySelectorAll<HTMLElement>('.ft-tab').forEach((b) => b.classList.toggle('on', Number(b.dataset.tab) === this.tab));
    const scroll = this.body.scrollTop;
    this.body.replaceChildren();
    this.host.renderTab(this.tab, this.body);
    this.body.scrollTop = scroll;
  }
}
