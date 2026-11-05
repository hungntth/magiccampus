// Mệnh Hồn window (legacy PetSoulPanel + prey panel + SoulExchangePanel): a draggable frame with the tabs Tổng quan / Xủ Quẻ / Đổi Mảnh Vỡ.
// A tab is rebuilt on every redraw (cheap); the controller calls refresh() after it merged a push. Pure view: PetSoulController owns the RPCs.

import { el } from '../petPanelTabs';
import { createBoostFrame, type BoostFrame } from '../petboost/boostFrame';
import { renderExchange } from './soulExchange';
import { renderOverview } from './soulOverview';
import { renderPrey } from './soulPrey';
import { SOUL_TEXT as T } from './soulText';
import type { SoulCtx, SoulHost, SoulTabId, SoulUi } from './soulTypes';
import './petSoul.css';

const TABS: readonly { id: SoulTabId; label: string; render(ctx: SoulCtx, body: HTMLElement): void }[] = [
  { id: 'overview', label: T.tabs.overview, render: renderOverview },
  { id: 'prey', label: T.tabs.prey, render: renderPrey },
  { id: 'exchange', label: T.tabs.exchange, render: renderExchange },
];

export class SoulWindow {
  private frame: BoostFrame | null = null;
  private current: SoulTabId = 'overview';
  private readonly ui: SoulUi = { petId: -1, sel: null, moving: false, tempSel: 0, menu: 1 };

  constructor(private readonly host: SoulHost, private readonly onClose: () => void) {}

  get isOpen(): boolean {
    return this.frame !== null;
  }

  /** Opens (or re-targets) the window on the ring of `petId`. */
  show(petId: number, tab: SoulTabId = this.current): void {
    this.ui.petId = petId;
    this.ui.sel = null;
    this.ui.moving = false;
    if (!this.frame) this.frame = createBoostFrame(T.title, 'pb-soul', 'petSoulWindow', () => this.onClose());
    this.current = tab;
    this.refresh();
  }

  refresh(): void {
    const frame = this.frame;
    if (!frame) return;
    const tab = TABS.find((t) => t.id === this.current) ?? TABS[0]!;
    frame.bar.replaceChildren(...TABS.map((t) => {
      const b = el('button', `pet-tab${t.id === this.current ? ' on' : ''}`, t.label);
      b.onclick = () => {
        this.current = t.id;
        this.ui.moving = false;
        this.refresh();
      };
      return b;
    }));
    tab.render({ host: this.host, ui: this.ui, redraw: () => this.refresh() }, frame.body);
  }

  close(): void {
    this.frame?.dispose();
    this.frame = null;
  }
}
