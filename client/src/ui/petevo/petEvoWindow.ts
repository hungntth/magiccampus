// Tiến hóa window (legacy PetEvolutionPanel): a draggable frame with the three tabs Tiến Hóa / Vũ Hóa / Khế Ước. A tab is rebuilt
// when selected and redrawn by refresh() on pet / bag / wallet pushes. Pure view: PetEvoController owns the RPCs.

import { makeDraggable } from '../panelBehavior';
import { el } from '../petPanelTabs';
import { stageEl } from '../stage';
import { contractTab } from './contractTab';
import { evolveTab } from './evolveTab';
import { featherTab } from './featherTab';
import { EVO_TEXT } from './petEvoText';
import type { PetEvoHost, PetEvoTab, PetEvoTabId, PetEvoTabView } from './petEvoTypes';
import '../petfunc/petFunc.css';
import './petEvo.css';

/** Tab order of the Flash panel (PET_EVOLUTION_PANEL_U[47]). */
export const PET_EVO_TABS: readonly PetEvoTab[] = [evolveTab, featherTab, contractTab];

export class PetEvoWindow {
  private root: HTMLElement | null = null;
  private tabsEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private view: PetEvoTabView | null = null;
  private current: PetEvoTabId = 'evolve';
  private offDrag: (() => void) | null = null;

  constructor(private readonly host: PetEvoHost, private readonly onClose: () => void) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(tab: PetEvoTabId): void {
    if (!this.root) this.create();
    this.select(tab);
  }

  refresh(): void {
    this.view?.refresh();
  }

  close(): void {
    this.view?.dispose();
    this.view = null;
    this.offDrag?.();
    this.offDrag = null;
    this.root?.remove();
    this.root = null;
    this.tabsEl = null;
    this.bodyEl = null;
  }

  private create(): void {
    const root = el('div', 'pf-win pe-win');
    const header = el('div', 'pf-header');
    header.appendChild(el('div', 'pf-title', EVO_TEXT.title));
    const x = el('button', 'pet-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.onClose();
    this.tabsEl = el('div', 'pf-tabs');
    this.bodyEl = el('div', 'pf-body');
    root.append(header, x, this.tabsEl, this.bodyEl);
    stageEl().appendChild(root);
    this.root = root;
    this.offDrag = makeDraggable(root, header, 'petEvoWindow');
  }

  private select(id: PetEvoTabId): void {
    const tab = PET_EVO_TABS.find((t) => t.id === id);
    if (!tab || !this.tabsEl || !this.bodyEl) return;
    this.current = id;
    this.view?.dispose();
    this.root?.querySelector('.pf-picker')?.remove();
    this.tabsEl.replaceChildren(...PET_EVO_TABS.map((t) => {
      const b = el('button', `pet-tab${t.id === this.current ? ' on' : ''}`, t.label);
      b.onclick = () => this.select(t.id);
      return b;
    }));
    this.view = tab.build(this.host, this.bodyEl);
  }
}
