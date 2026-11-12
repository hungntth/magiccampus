// "Đổi bộ" window (legacy RecipeExchangePanel / RecipeItem): the buyable sets of a kind (fashion / flyer tab, 5 per page) with their
// price in Điểm thưởng and "Đổi ngay" behind a confirm dialog. Sets without a real price (999999999) are not listed.

import { DRESS_PANEL } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { FeatureWindow } from '../feature/featureWindow';
import { button, el } from '../feature/dom';
import { iconBox, nameColor, pager } from './dressCells';
import { EXCHANGE_PAGE, exchangeList, pageCount } from './dressRules';
import type { DressUiHost } from './dressTypes';

export class ExchangeWindow {
  private page = 0;
  private readonly win: FeatureWindow;

  constructor(private readonly host: DressUiHost) {
    this.win = new FeatureWindow(
      { renderTab: (tab, body) => this.renderTab(tab, body), onTab: () => void (this.page = 0), onClose: () => this.close() },
      { title: DRESS_PANEL.EXCHANGE, tabs: DRESS_PANEL.EXCHANGE_TABS, cls: 'dress-exchange' },
    );
  }

  get isOpen(): boolean {
    return this.win.isOpen;
  }

  show(): void {
    this.win.show(0);
  }

  close(): void {
    this.win.close();
  }

  render(): void {
    this.win.render();
  }

  private renderTab(tab: number, body: HTMLElement): void {
    const info = this.host.info();
    const rows = exchangeList(this.host.catalog(), tab + 1);
    const pages = pageCount(rows.length, EXCHANGE_PAGE);
    this.page = Math.min(this.page, pages - 1);
    body.appendChild(el('div', 'ft-h', DRESS_PANEL.EXCHANGE_SCORE(Math.max(0, info.score))));
    const list = el('div', 'ds-rows');
    for (const r of rows.slice(this.page * EXCHANGE_PAGE, (this.page + 1) * EXCHANGE_PAGE)) {
      const row = el('div', 'ds-row');
      const name = el('div', 'ds-name', r.name.trim());
      name.style.color = nameColor(r.color, true);
      const buy = button(DRESS_PANEL.EXCHANGE_NOW, () => askConfirm(DRESS_PANEL.CONFIRM_EXCHANGE(r.money), () => this.host.actions.exchange(r)), info.score < r.money);
      row.append(iconBox(r.iconCode, undefined, r.desc), name, el('div', 'ds-price', DRESS_PANEL.PRICE(r.money)), buy);
      list.appendChild(row);
    }
    body.append(list, pager(this.page, pages, (p) => {
      this.page = p;
      this.win.render();
    }));
  }
}
