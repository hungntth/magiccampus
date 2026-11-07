// Choose-one gift box window (legacy MultiItemPanel.as, opened by the itemMultitoSel push): the box icon on top, an info line
// ("Co the nhan {num} vat pham ..."), 3 choices per page with a pager, a "Nhan" button. Local gates like Flash getItemByIdx: a pet pick
// needs a free pet slot, an item / equipment pick a free bag slot ("Khong du cho trong."). selMultiItemByIdx(itemId, idx) answers
// -1 refused (stay open), 0 done (close) or the number of picks left (the picked choice leaves the list). Pure view over a host.

import { MULTI_ITEM_PANEL_TEXT, petGrowColor, type ItemMultiToSelPayload, type PackItemChoice } from '@mc/shared';
import { iconUrl } from '../assets';
import { button, el, openActWindow, type ActWindow } from './actWindow';
import { NAME_COLORS } from './itemCell';
import './multiItemPanel.css';

const PER_PAGE = 3;
const TABLE_PET = 12;

export interface MultiItemHost {
  /** selMultiItemByIdx(itemId, idx): the server reply (-1 / 0 / N). */
  pick(itemId: number, idx: number): Promise<number>;
  /** The gift box's own bag row (icon), when it is still in the bag. */
  box(itemId: number): { name: string; iconCode: string } | null;
  freeBagSlots(): number;
  freePetSlots(): number;
  /** Shows a toast / chat line. */
  say(text: string): void;
}

/** The refusal shown before calling the server (legacy MULTI_ITEM_PANEL[4]), or null when the pick fits locally. */
export function pickBlocker(ti: number, freeBag: number, freePet: number): string | null {
  const room = ti === TABLE_PET ? freePet : freeBag;
  return room >= 1 ? null : MULTI_ITEM_PANEL_TEXT.NO_ROOM;
}

/** Border colour of a choice: pets by grow rate (q / 10), items and equipment by colour (q / 5). */
export function choiceColor(c: PackItemChoice): string {
  return NAME_COLORS[c.ti === TABLE_PET ? petGrowColor(c.q / 10) : Math.floor(c.q / 5)] ?? NAME_COLORS[0];
}

export class MultiItemPanel {
  private win: ActWindow | null = null;
  private itemId = 0;
  private list = new Map<string, PackItemChoice>();
  private getNum: number | 'all' = 1;
  private selected: string | null = null;
  private page = 0;
  private busy = false;

  constructor(private readonly host: MultiItemHost) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  /** itemMultitoSel(payload, itemId): opens the window (or refreshes it when it is already open). */
  show(payload: ItemMultiToSelPayload, itemId: number): void {
    this.itemId = itemId;
    this.list = new Map(Object.entries(payload.packItemList ?? {}).filter(([, c]) => c));
    this.getNum = payload.packGetNum;
    this.selected = null;
    this.page = 0;
    this.win ??= openActWindow(MULTI_ITEM_PANEL_TEXT.TITLE, 'multi-item-win', () => this.close());
    this.render();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  private render(): void {
    if (!this.win) return;
    const body = this.win.body;
    body.replaceChildren();
    const box = this.host.box(this.itemId);
    if (box) body.appendChild(this.cell(box.name, box.iconCode, 1, '#ffffff', false));
    body.appendChild(el('act-muted mi-info', this.getNum === 'all'
      ? MULTI_ITEM_PANEL_TEXT.CAN_GET_ALL : MULTI_ITEM_PANEL_TEXT.CAN_GET.replace('{num}', String(this.getNum))));
    const keys = [...this.list.keys()];
    const pages = Math.max(1, Math.ceil(keys.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    const grid = el('mi-list');
    for (const key of keys.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE)) {
      const c = this.list.get(key)!;
      const row = this.cell(c.nm ?? `#${c.ii}`, c.ic ?? '0', c.n, choiceColor(c), key === this.selected);
      row.onclick = () => {
        this.selected = key;
        this.render();
      };
      grid.appendChild(row);
    }
    body.appendChild(grid);
    if (keys.length > PER_PAGE) {
      const pager = el('act-row mi-pager');
      pager.append(
        button('<', () => this.go(-1), 'act-btn', this.page === 0),
        el('act-muted', `${this.page + 1} / ${pages}`),
        button('>', () => this.go(1), 'act-btn', this.page >= pages - 1),
      );
      body.appendChild(pager);
    }
    body.appendChild(button(MULTI_ITEM_PANEL_TEXT.PICK, () => void this.take(), 'act-btn mi-take', this.selected === null || this.busy));
  }

  private go(delta: number): void {
    this.page += delta;
    this.render();
  }

  /** One row: icon, name, count; `chosen` highlights it. */
  private cell(name: string, iconCode: string, count: number, color: string, chosen: boolean): HTMLElement {
    const row = el(`mi-cell${chosen ? ' chosen' : ''}`);
    const icon = el('mi-icon');
    icon.style.borderColor = color;
    if (iconCode && iconCode !== '0') {
      const img = document.createElement('img');
      img.src = iconUrl(iconCode);
      img.alt = '';
      img.draggable = false;
      img.onerror = () => img.remove();
      icon.appendChild(img);
    }
    if (count > 1) icon.appendChild(el('mi-count', String(count)));
    const label = el('mi-name', name);
    label.style.color = color;
    row.append(icon, label);
    return row;
  }

  private async take(): Promise<void> {
    const key = this.selected;
    const choice = key === null ? undefined : this.list.get(key);
    if (key === null || !choice || this.busy) return;
    const why = pickBlocker(choice.ti, this.host.freeBagSlots(), this.host.freePetSlots());
    if (why) return this.host.say(why);
    this.busy = true;
    try {
      const left = await this.host.pick(this.itemId, Number(key));
      if (left < 0) return;
      if (left === 0) return this.close();
      this.list.delete(key);
      this.getNum = left;
      this.selected = null;
    } catch {
      return; // the refusal text already arrived as a note push
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
