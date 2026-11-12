// Chân Hồn Thần Thú window (legacy PRSPanel, activity strip id 58): the FeatureWindow shell with the three Flash pages
// (Thăng Cấp, Thần Hóa, Đổi Thần Dụ). The tabs are drawn by ui/pet/prs/*; game/PrsController.ts owns the data and the calls.

import { PRS_TEXT } from '@mc/shared';
import { FeatureWindow } from '../feature/featureWindow';
import { renderChipsTab } from './prs/chipsTab';
import { renderFormsTab } from './prs/formsTab';
import type { PrsUiHost } from './prs/prsTypes';
import { renderTreeTab } from './prs/treeTab';
import './prs/prs.css';

export function createPrsWindow(host: () => PrsUiHost, onClose: () => void): FeatureWindow {
  return new FeatureWindow(
    {
      renderTab: (tab, body) => {
        if (tab === 1) renderFormsTab(host(), body);
        else if (tab === 2) renderChipsTab(host(), body);
        else renderTreeTab(host(), body);
      },
      onTab: () => undefined,
      onClose,
    },
    { title: PRS_TEXT.TITLE, tabs: PRS_TEXT.TABS, cls: 'prs-window' },
  );
}
