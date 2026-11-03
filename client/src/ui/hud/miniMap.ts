// Top-right MiniMapCanvas (right0/top0, 220 wide): location strip "<line> - <map> x,y", net delay strip
// (checkNetDelay ping every 10 s), icon tray, shop button and the red function column (funCanvas).

import type { NetDelayReply } from '@mc/shared';
import type { GameClient } from '../../net/client';
import { div, notReady, place, setStates, skinButton, skinImage, std, type SkinStates } from './skin';

const TRAY = 'MainStage_TopRightButtonTray';
const DELAY_STATES = ['Rất tốt', 'Tốt', 'Bình Thường', 'Yếu', 'Rất yếu'];
const DELAY_COLORS = ['#66ff00', '#66ff00', '#ffba00', '#ffba00', '#ff0000'];
const DELAY_LIMITS = [50, 100, 300, 500];
const PING_INTERVAL_MS = 10_000;

// funCanvas buttons, top to bottom (MINIMAPCANVAS_U labels), 28 px apart from y 6.
const FUNCTIONS = ['Nạp', 'Chế tạo', 'Luyện', 'Sản xuất', 'Auto', 'Ủy thác', 'Trang Viên', 'Đấu Pet', 'Bay'];

export class MiniMapCanvas {
  private readonly title: HTMLDivElement;
  private readonly delay: HTMLDivElement;
  private readonly delayStrip: HTMLDivElement;
  private readonly timer: number;
  private mapName = '';
  private lastPos = '';
  private pkClosed = false;

  constructor(parent: HTMLElement, private readonly client: GameClient) {
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
      'Xếp hạng', notReady);
    skinButton({ up: `${TRAY}/SpeakerUp`, over: `${TRAY}/Speakerover`, down: `${TRAY}/SpeakerDown` }, tray, 3, 21,
      'Cách chơi', notReady);
    const pk = skinButton(std(`${TRAY}/AllowPK`), tray, 57.7, 10, '', () => {
      this.pkClosed = !this.pkClosed;
      this.setPk(pk);
    });
    this.setPk(pk);
    skinButton({ up: `${TRAY}/MouseUp`, over: `${TRAY}/Mouseover`, down: `${TRAY}/MouseDown` }, tray, 89.4, 2,
      'Thiết lập', notReady);
    skinButton(std(`${TRAY}/Earth`), tray, 38.6, 38.5, 'Bản đồ', notReady);
    skinButton(std(`${TRAY}/Help`), tray, 76.8, 39.5, 'Trợ giúp', notReady);

    const shopTray = skinImage(`${TRAY}/Tray2`, root, 158, 53);
    skinButton({ up: `${TRAY}/shopup`, over: `${TRAY}/ShopOver`, down: `${TRAY}/ShopDown` }, shopTray, 4, 10, 'Shop',
      notReady);

    const hideTray: SkinStates = { up: `${TRAY}/shrinkageup`, over: `${TRAY}/shrinkageover`, down: `${TRAY}/shrinkagedown` };
    const showTray: SkinStates = { up: `${TRAY}/putup`, over: `${TRAY}/putover`, down: `${TRAY}/putdown` };
    const trayToggle = skinButton(hideTray, root, 148, 78, '', () => {
      tray.hidden = !tray.hidden;
      setStates(trayToggle, tray.hidden ? showTray : hideTray);
    });

    const fun = place(div('hud-fun', root), 135, 135, 85, 262);
    FUNCTIONS.forEach((label, i) => {
      const b = place(div('hud-red-btn', fun, label), 6, 6 + i * 28, 73, 24);
      b.onclick = notReady;
    });
    const hideFun: SkinStates = std(`${TRAY}/RightButtonsHide`);
    const showFun: SkinStates = std(`${TRAY}/RightButtonsShow`);
    const funToggle = skinButton(hideFun, root, 124, 260, '', () => {
      fun.hidden = !fun.hidden;
      setStates(funToggle, fun.hidden ? showFun : hideFun);
      funToggle.style.left = fun.hidden ? '208px' : '124px';
    });

    this.timer = window.setInterval(() => void this.ping(), PING_INTERVAL_MS);
    void this.ping();
  }

  destroy(): void {
    window.clearInterval(this.timer);
  }

  setMap(name: string): void {
    this.mapName = name;
    this.lastPos = '';
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
