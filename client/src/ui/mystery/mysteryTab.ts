// "Mật Bảo" tab of the Hồn Khí window: three sub pages (Thu Thập, Chế Tạo, Phân Giải) drawn into the tab body. Data comes from MysteryController (host); until the
// catalog has loaded the tab shows a loading line.

import { MYS_TEXT } from '@mc/shared';
import { button, el } from '../feature/dom';
import { renderCollect } from './collectPage';
import { renderCraft } from './craftPage';
import { renderResolve } from './resolvePage';
import type { MysteryUiHost } from './mysteryTypes';
import './mystery.css';

const PAGES = [renderCollect, renderCraft, renderResolve] as const;

export function renderMystery(body: HTMLElement, host: MysteryUiHost): void {
  if (!host.catalog()) {
    body.appendChild(el('div', 'ft-muted', '...'));
    return;
  }
  const bar = el('div', 'ft-subtabs my-subtabs');
  MYS_TEXT.TABS.forEach((label, i) => {
    const b = button(label, () => {
      host.view.sub = i;
      host.actions.render();
    });
    b.classList.replace('ft-btn', 'ft-subtab');
    if (host.view.sub === i) b.classList.add('on');
    bar.appendChild(b);
  });
  body.appendChild(bar);
  PAGES[host.view.sub](body, host);
}
