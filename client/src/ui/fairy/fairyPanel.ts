// Tiểu Tinh Linh window (legacy FairyManagerPanel 838): the FeatureWindow shell with the roster column (five per page) on the left of every
// tab and the Flash pages on the right (Thuộc tính, Nuôi dưỡng, Cho ăn, Kỹ Năng, Thiết lập, Hoán đổi), drawn by ui/fairy/*Tab.ts.
// game/FairyController.ts owns the data and the calls.

import { FAIRY_TEXT, type FairyInfo } from '@mc/shared';
import { FeatureWindow } from '../feature/featureWindow';
import { el } from '../feature/dom';
import { renderConfigTab } from './configTab';
import { FAIRY_TABS, FAIRY_UI, TAB, rosterColumn, type FairyUiHost } from './fairyTypes';
import { renderFeedTab } from './feedTab';
import { renderGrowTab } from './growTab';
import { renderInfoTab } from './infoTab';
import { renderSkillTab } from './skillTab';
import { renderSkinTab } from './skinTab';
import './fairy.css';

const PAGES: Record<number, (host: FairyUiHost, f: FairyInfo, body: HTMLElement) => void> = {
  [TAB.INFO]: renderInfoTab, [TAB.GROW]: renderGrowTab, [TAB.FEED]: renderFeedTab, [TAB.SKILL]: renderSkillTab, [TAB.CONFIG]: renderConfigTab,
};

export function createFairyWindow(host: FairyUiHost, onClose: () => void): FeatureWindow {
  return new FeatureWindow(
    {
      renderTab: (tab, body) => {
        const main = el('div', 'fy-main');
        const cols = el('div', 'fy-cols');
        cols.append(rosterColumn(host), main);
        body.appendChild(cols);
        if (tab === TAB.SKIN) return renderSkinTab(host, main);
        const f = host.current();
        if (!f) {
          main.appendChild(el('div', 'ft-muted', FAIRY_UI.EMPTY));
          return;
        }
        (PAGES[tab] ?? renderInfoTab)(host, f, main);
      },
      onTab: () => undefined,
      onClose,
    },
    { title: FAIRY_TEXT.TITLE, tabs: FAIRY_TABS, cls: 'fairy-window' },
  );
}
