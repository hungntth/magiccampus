// Wing window "Cải tạo cánh": the six tabs (Dung hợp, Thăng tinh, Đục lỗ, Lông vũ, Thiết lập, Thăng cấp) in the shared FeatureWindow frame.

import { WING_TABS } from '@mc/shared';
import { FeatureWindow } from '../feature/featureWindow';
import { renderAdvance } from './advanceTab';
import { renderFeather } from './featherTab';
import { renderJoin } from './joinTab';
import { renderRefine } from './refineTab';
import { renderHole, renderStar } from './starHoleTab';
import type { WingUiHost } from './wingTypes';
import './wing.css';

const TABS = [renderJoin, renderStar, renderHole, renderFeather, renderRefine, renderAdvance] as const;
/** Tab index of "Thăng cấp": its state is pulled (showNewWingPro) when the tab opens. */
export const ADVANCE_TAB = 5;

export function createWingWindow(host: () => WingUiHost, onClose: () => void): FeatureWindow {
  return new FeatureWindow(
    { renderTab: (tab, body) => TABS[tab](body, host()), onTab: (tab) => { host().state.note = ''; if (tab === ADVANCE_TAB) host().actions.refreshState(); }, onClose },
    { title: 'Cải tạo cánh', tabs: WING_TABS, cls: 'wing-window' },
  );
}
