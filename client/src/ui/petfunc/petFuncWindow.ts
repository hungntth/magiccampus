// "Luyện pet" window (legacy PetFuncPanel): a draggable frame with the 8 tabs of PET_FUNC_TABS. A tab is rebuilt when selected
// and redrawn by refresh() whenever PetFuncController sees pet / bag pushes. Pure view: no RPCs here.

import { makeDraggable } from '../panelBehavior';
import { el } from '../petPanelTabs';
import { stageEl } from '../stage';
import { eatTab } from './eatTab';
import { elementTab } from './elementTab';
import { joinTab } from './joinTab';
import type { PetFuncHost, PetFuncTab, PetFuncTabId, PetFuncTabView } from './petFuncTypes';
import { pointTab, rebirthTab, refineTab } from './simpleTabs';
import { skillTab } from './skillTab';
import { starTab } from './starTab';
import './petFunc.css';

/** Tab order of the Flash PetFuncPanel. */
export const PET_FUNC_TABS: readonly PetFuncTab[] = [starTab, joinTab, refineTab, rebirthTab, pointTab, skillTab, eatTab, elementTab];

export class PetFuncWindow {
  private root: HTMLElement | null = null;
  private tabsEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private view: PetFuncTabView | null = null;
  private current: PetFuncTabId = 'star';
  private offs: (() => void)[] = [];

  constructor(private readonly host: PetFuncHost, private readonly onClose: () => void) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(tab: PetFuncTabId): void {
    if (!this.root) this.create();
    this.select(tab);
  }

  refresh(): void {
    this.view?.refresh();
  }

  close(): void {
    this.view?.dispose();
    this.view = null;
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
    this.tabsEl = null;
    this.bodyEl = null;
  }

  private create(): void {
    const root = el('div', 'pf-win');
    const header = el('div', 'pf-header');
    header.appendChild(el('div', 'pf-title', 'Luyện pet'));
    const x = el('button', 'pet-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.onClose();
    this.tabsEl = el('div', 'pf-tabs');
    this.bodyEl = el('div', 'pf-body');
    root.append(header, x, this.tabsEl, this.bodyEl);
    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header, 'petFuncWindow'));
  }

  private select(id: PetFuncTabId): void {
    const tab = PET_FUNC_TABS.find((t) => t.id === id);
    if (!tab || !this.tabsEl || !this.bodyEl) return;
    this.current = id;
    this.view?.dispose();
    this.root?.querySelector('.pf-picker')?.remove();
    this.tabsEl.replaceChildren(...PET_FUNC_TABS.map((t) => {
      const b = el('button', `pet-tab${t.id === this.current ? ' on' : ''}`, t.label);
      b.onclick = () => this.select(t.id);
      return b;
    }));
    this.view = tab.build(this.host, this.bodyEl);
  }
}
