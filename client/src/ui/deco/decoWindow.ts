// Hồn Khí Vương Tộc window shell: the four tabs (Hồn Khí, C.Hóa H.Khí, Phù Văn, Mật Bảo) rendered into the shared FeatureWindow frame.

import { DECO_PANEL } from '@mc/shared';
import { FeatureWindow } from '../feature/featureWindow';
import { renderLook } from './lookTab';
import { renderRune } from './runeTab';
import type { DecoUiHost } from './decoTypes';
import { renderUpgrade } from './upgradeTab';
import { renderMystery } from '../mystery/mysteryTab';
import './deco.css';

const TABS = [renderLook, renderUpgrade, renderRune, (body: HTMLElement, host: DecoUiHost): void => renderMystery(body, host.mystery)] as const;
const MYSTERY_TAB = 3;

export function createDecoWindow(host: () => DecoUiHost, onClose: () => void): FeatureWindow {
  return new FeatureWindow(
    { renderTab: (tab, body) => TABS[tab](body, host()), onTab: (tab) => (tab === MYSTERY_TAB ? host().loadMystery() : undefined), onClose },
    { title: DECO_PANEL.TITLE, tabs: [...DECO_PANEL.TABS, DECO_PANEL.MYSTERY_TAB], cls: 'deco-window' },
  );
}
