// VIP level gem (legacy ResManager.PM_ZUAN1..9) drawn in CSS: a faceted diamond in the level colour with the level number,
// shared by the VIP panel gem row and the HUD portrait badge (PortraitCanvas.selfHeadPMFlag).

import './vipGem.css';

/** Level names and colours (Language PM_PANEL[11..19]); level 9 is the multi-coloured "[Kim Cương]". */
export const VIP_LEVEL_NAME = ['', 'Trắng', 'Lục', 'Lam', 'Tím', 'Cam', 'Vàng', 'Đỏ', 'Bạch Kim', 'Kim Cương'];
export const VIP_LEVEL_COLOR = ['', '#ffffff', '#00ff00', '#0066ff', '#ff33ff', '#fa5b05', '#ffff00', '#ff0000', '#202020', '#eebb22'];

/** Paints `e` as the gem of `level` (1..9); level 0 hides it. */
export function setVipGem(e: HTMLElement, level: number): void {
  e.hidden = level <= 0;
  e.classList.add('vip-gem-icon');
  for (let n = 1; n <= 9; n++) e.classList.toggle(`level-${n}`, level === n);
  e.classList.toggle('dark', level === 8);
  e.classList.toggle('rainbow', level === 9);
  e.style.setProperty('--gem', VIP_LEVEL_COLOR[level] ?? '#ffffff');
  e.dataset.n = level > 0 ? String(level) : '';
}

export function vipGem(level: number): HTMLElement {
  const e = document.createElement('span');
  setVipGem(e, level);
  return e;
}
