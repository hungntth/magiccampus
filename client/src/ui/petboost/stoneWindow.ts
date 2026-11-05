// Tụ Linh Bảo Thạch window (legacy PetStonePanel): a frame with five tabs Dung Hợp / Tụ Linh / Khảm / Luyện / Phân Giải. A tab is
// rebuilt when selected and redrawn by refresh() on stone-bag / bag / wallet pushes. Pure view: PetStoneController owns the RPCs.

import { el } from '../petPanelTabs';
import { createBoostFrame, type BoostFrame } from './boostFrame';
import { STONE_TEXT } from './boostText';
import { absorbTab } from './stoneAbsorb';
import { inlayTab } from './stoneInlay';
import { composeTab, energyTab, resolveTab } from './stoneTabs';
import type { StoneHost, StoneTab, StoneTabId, StoneTabView } from './stoneTypes';

/** Tab order of the Flash panel (PET_STONE_PANEL[1]). */
export const STONE_TABS: readonly StoneTab[] = [composeTab, absorbTab, inlayTab, energyTab, resolveTab];

export class StoneWindow {
  private frame: BoostFrame | null = null;
  private view: StoneTabView | null = null;
  private current: StoneTabId = 'compose';

  constructor(private readonly host: StoneHost, private readonly onClose: () => void) {}

  get isOpen(): boolean {
    return this.frame !== null;
  }

  show(tab: StoneTabId = this.current): void {
    if (!this.frame) this.frame = createBoostFrame(STONE_TEXT.title, 'pb-stone', 'petStoneWindow', () => this.onClose());
    this.select(tab);
  }

  refresh(): void {
    this.view?.refresh();
  }

  close(): void {
    this.view?.dispose();
    this.view = null;
    this.frame?.dispose();
    this.frame = null;
  }

  private select(id: StoneTabId): void {
    const tab = STONE_TABS.find((t) => t.id === id);
    if (!tab || !this.frame) return;
    this.current = id;
    this.view?.dispose();
    this.frame.root.querySelector('.pf-picker')?.remove();
    this.frame.bar.replaceChildren(...STONE_TABS.map((t) => {
      const b = el('button', `pet-tab${t.id === id ? ' on' : ''}`, t.label);
      b.onclick = () => this.select(t.id);
      return b;
    }));
    this.view = tab.build(this.host, this.frame.body);
  }
}
