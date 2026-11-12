// Ma Tâm window shell: the two tabs (Đặt Ma Tâm, Thăng cấp / Phân giải) rendered into the shared FeatureWindow frame.

import { FeatureWindow } from '../feature/featureWindow';
import { renderPlace } from './mhPlaceTab';
import { renderUpgrade } from './mhUpgradeTab';
import type { MhUiHost } from './mhTypes';
import './monsterheart.css';

const TABS = [renderPlace, renderUpgrade] as const;

export function createMonsterHeartWindow(host: () => MhUiHost, onClose: () => void): FeatureWindow {
  return new FeatureWindow(
    { renderTab: (tab, body) => TABS[tab](body, host()), onTab: () => undefined, onClose },
    { title: 'Ma Tâm', tabs: ['Đặt Ma Tâm', 'Thăng cấp / Phân giải'], cls: 'mh-window' },
  );
}
