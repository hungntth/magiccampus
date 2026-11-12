// Tủ Đồ window shell: the four tabs (Tổng Quan, Kích Hoạt, Rút Bộ, Chuyển Bộ) rendered into the shared FeatureWindow frame.

import { DRESS_PANEL } from '@mc/shared';
import { FeatureWindow } from '../feature/featureWindow';
import { renderActivate } from './activateTab';
import { renderDraw } from './drawTab';
import type { DressUiHost } from './dressTypes';
import { renderOverview } from './overviewTab';
import { renderTransform } from './transformTab';
import './dress.css';

const TABS = [renderOverview, renderActivate, renderDraw, renderTransform] as const;

export function createDressWindow(host: () => DressUiHost, onClose: () => void): FeatureWindow {
  return new FeatureWindow(
    { renderTab: (tab, body) => TABS[tab](body, host()), onTab: () => undefined, onClose },
    { title: DRESS_PANEL.TITLE, tabs: DRESS_PANEL.TABS, cls: 'dress-window' },
  );
}
