// Sách Tiến Hóa window (legacy PetHandbook): an overview tab plus one tab per series (class 1..10), each a list of entries with
// the activation mark and a detail pane. The series bonus and progress sit above the list. State is the login activePetObject
// (updateActivatePetObj keeps it fresh); every activation call goes through the host actions and redraws.

import { petHandbookBySeries, PET_HANDBOOK_SERIES, PET_HANDBOOK_SERIES_NAMES, petHandbookOf } from '@mc/shared';
import { iconUrl } from '../../assets';
import { makeDraggable } from '../panelBehavior';
import { el } from '../petPanelTabs';
import { stageEl } from '../stage';
import { detailPane, seriesProgress } from './handbookDetail';
import { entryState, serieBonusText } from './petEvoRules';
import { EVO_TEXT } from './petEvoText';
import type { PetEvoHost } from './petEvoTypes';
import '../petfunc/petFunc.css';
import './petEvo.css';

type BookTab = 0 | number; // 0 = Tổng quan, 1..10 = series

export class HandbookWindow {
  private root: HTMLElement | null = null;
  private tabsEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private tab: BookTab = 0;
  private selected = 0;
  private busy = false;
  private offDrag: (() => void) | null = null;

  constructor(private readonly host: PetEvoHost, private readonly onClose: () => void) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** Opens the book; `entryId` jumps to that entry's series with it selected. */
  show(entryId?: number): void {
    if (!this.root) this.create();
    const def = entryId ? petHandbookOf(entryId) : undefined;
    if (def) {
      this.tab = def.classId;
      this.selected = def.id;
    }
    this.render();
  }

  refresh(): void {
    if (this.root) this.render();
  }

  close(): void {
    this.offDrag?.();
    this.offDrag = null;
    this.root?.remove();
    this.root = null;
    this.tabsEl = null;
    this.bodyEl = null;
  }

  private create(): void {
    const root = el('div', 'pf-win pe-win pe-book');
    const header = el('div', 'pf-header');
    header.appendChild(el('div', 'pf-title', EVO_TEXT.book));
    const x = el('button', 'pet-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.onClose();
    this.tabsEl = el('div', 'pf-tabs');
    this.bodyEl = el('div', 'pf-body');
    root.append(header, x, this.tabsEl, this.bodyEl);
    stageEl().appendChild(root);
    this.root = root;
    this.offDrag = makeDraggable(root, header, 'petBookWindow');
  }

  private render(): void {
    if (!this.tabsEl || !this.bodyEl) return;
    const tabs: [BookTab, string][] = [[0, 'Tổng quan'], ...PET_HANDBOOK_SERIES.map((s): [BookTab, string] => [s, PET_HANDBOOK_SERIES_NAMES[s] ?? `#${s}`])];
    this.tabsEl.replaceChildren(...tabs.map(([id, label]) => {
      const b = el('button', `pet-tab${id === this.tab ? ' on' : ''}`, label);
      b.onclick = () => {
        this.tab = id;
        this.selected = 0;
        this.render();
      };
      return b;
    }));
    this.bodyEl.replaceChildren(this.tab === 0 ? this.overview() : this.series(this.tab));
  }

  private overview(): HTMLElement {
    const box = el('div', 'pe-overview');
    for (const s of PET_HANDBOOK_SERIES) {
      const p = seriesProgress(this.host, s);
      const row = el('div', 'pe-overview-row');
      row.onclick = () => {
        this.tab = s;
        this.render();
      };
      const bonus = serieBonusText(s);
      row.append(
        el('span', 'pe-overview-name', PET_HANDBOOK_SERIES_NAMES[s] ?? `#${s}`),
        el('span', p.actived === p.total ? 'ok' : '', `${p.actived}/${p.total}`),
        el('span', 'pf-line', bonus ? `Kích hoạt toàn bộ: ${bonus}` : ''),
      );
      box.appendChild(row);
    }
    return box;
  }

  private series(classId: number): HTMLElement {
    const wrap = el('div', 'pe-series');
    const entries = petHandbookBySeries(classId);
    if (!entries.some((e) => e.id === this.selected)) this.selected = entries[0]?.id ?? 0;
    const p = seriesProgress(this.host, classId);
    const bonus = serieBonusText(classId);
    wrap.appendChild(el('div', `pf-line ${p.actived === p.total ? 'ok' : ''}`, `${PET_HANDBOOK_SERIES_NAMES[classId]}: ${p.actived}/${p.total}${bonus ? ` — kích hoạt toàn bộ: ${bonus}` : ''}`));
    const list = el('div', 'pe-list');
    const all = this.host.player().activePetObject;
    for (const def of entries) {
      const st = entryState(all, def);
      const item = el('div', `pe-item${def.id === this.selected ? ' sel' : ''}${st.actived ? ' done' : ''}`);
      const img = document.createElement('img');
      img.src = iconUrl(def.creature.icon);
      img.alt = '';
      img.onerror = () => img.remove();
      item.append(img, el('span', 'pe-item-name', def.name), el('span', st.actived ? 'ok' : 'pe-dim', st.actived ? '√' : `${st.activedNum}/${def.activeNum}`));
      item.onclick = () => {
        this.selected = def.id;
        this.render();
      };
      list.appendChild(item);
    }
    const def = petHandbookOf(this.selected);
    const main = el('div', 'pe-series-main');
    main.appendChild(list);
    if (def) main.appendChild(detailPane(this.host, def, () => this.busy, (job) => this.run(job)));
    wrap.appendChild(main);
    return wrap;
  }

  private async run(job: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await job();
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
