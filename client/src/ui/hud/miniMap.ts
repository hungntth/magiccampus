// Top-right MiniMapCanvas (right0/top0, 220 wide): location strip "<line> - <map> x,y", net delay strip
// (checkNetDelay ping every 10 s), icon tray, shop button and the red function column (funCanvas).

import { PK_NOTES, type MapInfo, type NetDelayReply } from '@mc/shared';
import type { GameClient } from '../../net/client';
import { toast } from '../screens';
import { div, notReady, place, setStates, skinButton, skinImage, std, type SkinStates } from './skin';

const TRAY = 'MainStage_TopRightButtonTray';
const DELAY_STATES = ['Rất tốt', 'Tốt', 'Bình Thường', 'Yếu', 'Rất yếu'];
const DELAY_COLORS = ['#66ff00', '#66ff00', '#ffba00', '#ffba00', '#ff0000'];
const DELAY_LIMITS = [50, 100, 300, 500];
const PING_INTERVAL_MS = 10_000;

// funCanvas buttons, top to bottom (MINIMAPCANVAS_U labels), 28 px apart from y 6.
// Centred column top: max(135px, 50% - half its 262 px height); the quest tracker uses the same top (style.css).
const FUN_TOP = 'max(135px, calc(50% - 131px))';
const FUNCTIONS = ['Nạp', 'Chế tạo', 'Luyện', 'Sản xuất', 'Auto', 'Ủy thác', 'Trang Viên', 'Đấu Pet', 'Điêu Khắc', 'Bay'];

/** Top-right tray buttons wired in M9 phase G (system settings, world map, help). */
export interface MiniMapTray {
  settings?: () => void;
  worldMap?: () => void;
  help?: () => void;
  /** M12 red function column: "Đấu Pet" (arena, Flash getPetArenaData) and "Điêu Khắc" (Không Gian Điêu Khắc PPVE). */
  arena?: () => void;
  ppve?: () => void;
}

export class MiniMapCanvas {
  private readonly title: HTMLDivElement;
  private readonly delay: HTMLDivElement;
  private readonly delayStrip: HTMLDivElement;
  private readonly timer: number;
  private mapName = '';
  private lastPos = '';
  private pkClosed = true; // legacy: the button is selected (= PK closed) until the login payload says apvp
  private pkBtn: HTMLElement | null = null;

  constructor(parent: HTMLElement, private readonly client: GameClient, onShop: () => void, onForge: (tab?: string) => void,
    onRank: () => void = notReady, onOffline: () => void = notReady, onAuto: () => void = notReady, trayActs: MiniMapTray = {}) {
    const root = div('hud-minimap', parent);

    const titleStrip = skinImage('MainStage_LocationBar/LocationIndicator', root, 59, 0);
    this.title = div('hud-strip-text', titleStrip);
    this.delayStrip = skinImage('MainStage_LocationBar/LocationIndicator', root, 59, 24);
    this.delayStrip.hidden = true;
    this.delay = div('hud-strip-text', this.delayStrip);
    skinButton(std('MainStage_LocationBar/ChangeChannel'), root, 33, 0, 'Đổi kênh', notReady);
    const clock = skinButton({ up: 'MainStage_LocationBar/shizhongUp', over: 'MainStage_LocationBar/shizhongOver' }, root,
      33, 24, '', () => undefined);
    clock.onmouseenter = () => (clock.title = `Giờ hiện tại: ${new Date().toLocaleTimeString('vi-VN')}`);

    const tray = skinImage(`${TRAY}/Tray`, root, 36, 53);
    skinButton({ up: `${TRAY}/rankingup`, over: `${TRAY}/rankingover`, down: `${TRAY}/rankingDown` }, tray, 27, 2,
      'Xếp hạng', onRank);
    skinButton({ up: `${TRAY}/SpeakerUp`, over: `${TRAY}/Speakerover`, down: `${TRAY}/SpeakerDown` }, tray, 3, 21,
      'Cách chơi', notReady);
    const pk = skinButton(std(`${TRAY}/AllowPK`), tray, 57.7, 10, '', () => {
      this.pkClosed = !this.pkClosed;
      this.setPk(pk);
      // Core.updateSettingNow('apvp', !btnPK.selected): fire-and-forget uif(key, value, petFlag)
      void this.client.call('uif', 'apvp', !this.pkClosed, false).catch((e) => toast((e as Error).message, true));
    });
    this.pkBtn = pk;
    this.setPk(pk);
    skinButton({ up: `${TRAY}/MouseUp`, over: `${TRAY}/Mouseover`, down: `${TRAY}/MouseDown` }, tray, 89.4, 2,
      'Thiết lập hệ thống (Phím tắt: P)', trayActs.settings ?? notReady);
    skinButton(std(`${TRAY}/Earth`), tray, 38.6, 38.5, 'Bản đồ thế giới (Phím tắt: M)', trayActs.worldMap ?? notReady);
    skinButton(std(`${TRAY}/Help`), tray, 76.8, 39.5, 'Hệ thống hỗ trợ (Phím tắt: H)', trayActs.help ?? notReady);

    const shopTray = skinImage(`${TRAY}/Tray2`, root, 158, 53);
    skinButton({ up: `${TRAY}/shopup`, over: `${TRAY}/ShopOver`, down: `${TRAY}/ShopDown` }, shopTray, 4, 10, 'Shop',
      onShop);

    const hideTray: SkinStates = { up: `${TRAY}/shrinkageup`, over: `${TRAY}/shrinkageover`, down: `${TRAY}/shrinkagedown` };
    const showTray: SkinStates = { up: `${TRAY}/putup`, over: `${TRAY}/putover`, down: `${TRAY}/putdown` };
    const trayToggle = skinButton(hideTray, root, 148, 78, '', () => {
      tray.hidden = !tray.hidden;
      setStates(trayToggle, tray.hidden ? showTray : hideTray);
    });

    const fun = place(div('hud-fun', root), 135, 135, 85, 290);
    fun.style.top = FUN_TOP; // vertically centred on the stage (below the tray on short screens)
    FUNCTIONS.forEach((label, i) => {
      const b = place(div('hud-red-btn', fun, label), 6, 6 + i * 28, 73, 24);
      b.onclick = label === 'Chế tạo' ? () => onForge() : label === 'Luyện' ? () => onForge('star')
        : label === 'Ủy thác' ? () => onOffline() : label === 'Auto' ? () => onAuto()
          : label === 'Đấu Pet' && trayActs.arena ? trayActs.arena : label === 'Điêu Khắc' && trayActs.ppve ? trayActs.ppve : notReady;
    });
    const hideFun: SkinStates = std(`${TRAY}/RightButtonsHide`);
    const showFun: SkinStates = std(`${TRAY}/RightButtonsShow`);
    const funToggle = skinButton(hideFun, root, 124, 260, '', () => {
      fun.hidden = !fun.hidden;
      setStates(funToggle, fun.hidden ? showFun : hideFun);
      funToggle.style.left = fun.hidden ? '208px' : '124px';
    });

    funToggle.style.top = `calc(${FUN_TOP} + 125px)`;

    this.timer = window.setInterval(() => void this.ping(), PING_INTERVAL_MS);
    void this.ping();
  }

  destroy(): void {
    window.clearInterval(this.timer);
  }

  setMap(name: string, info?: MapInfo): void {
    this.mapName = name;
    this.lastPos = '';
    if ((info?.pk ?? 0) > 0) toast(PK_NOTES.FORCED_MAP, false, 6000); // GameScene.as: entering a forced-PvP map
  }

  /** Saved opt-in from the login payload: selected (NotAllowPK) = PK closed. */
  initPk(apvp: boolean): void {
    this.pkClosed = !apvp;
    if (this.pkBtn) this.setPk(this.pkBtn);
  }

  /** Location text: legacy getLocationInfo, "<line+1> - <map> <posX/10>,<posY/10>" (H5 has one line). */
  setPosition(x: number, y: number): void {
    const pos = `${Math.trunc(x / 10)},${Math.trunc(y / 10)}`;
    if (pos === this.lastPos) return;
    this.lastPos = pos;
    this.title.textContent = `1 - ${this.mapName} ${pos}`;
  }

  private setPk(btn: HTMLElement): void {
    setStates(btn, std(`${TRAY}/${this.pkClosed ? 'NotAllowPK' : 'AllowPK'}`));
    btn.title = `Thiết lập hiện tại: ${this.pkClosed ? 'Đóng PK' : 'Cho phép PK'}`;
  }

  private async ping(): Promise<void> {
    const start = Date.now();
    try {
      await this.client.call<NetDelayReply>('checkNetDelay');
    } catch {
      return;
    }
    const ms = Math.round((Date.now() - start) / 2);
    let state = DELAY_LIMITS.findIndex((t) => ms <= t);
    if (state < 0) state = DELAY_LIMITS.length;
    const color = DELAY_COLORS[state];
    this.delay.replaceChildren(
      'Mạng:', colored(DELAY_STATES[state], color), ' Delay:', colored(String(ms), color), ' ms',
    );
    this.delayStrip.hidden = false;
  }
}

function colored(text: string, color: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.style.color = color;
  s.textContent = text;
  return s;
}
