// Player portrait, top-left (legacy PortraitCanvas left2/top5 192x57); the pet frame is petCanvas.ts.
// Bars draw no text; values are in tooltips ("HP: 120/300"). HP / MP bar click = potion recovery, "Up" = manual level-up.

import { LEVEL_EXP, type PlayerData } from '@mc/shared';
import { iconUrl } from '../../assets';
import type { HudActions } from './mainHud';
import { healButtonState } from '../bloodBagPanel';
import { setVipGem, VIP_LEVEL_NAME } from '../vipGem';
import { div, place, setStates, skinButton, skinImage, std } from './skin';

export class Bar {
  readonly root: HTMLDivElement;
  private readonly fill: HTMLDivElement;

  constructor(parent: HTMLElement, skin: string, x: number, y: number, w: number, h: number) {
    this.root = place(div('hud-bar', parent), x, y, w, h) as HTMLDivElement;
    this.fill = skinImage(skin, this.root, 0, 0, 'hud-bar-fill');
    this.fill.style.width = '0px';
    this.fill.style.backgroundSize = `${w}px ${h}px`;
    this.fill.style.height = `${h}px`;
  }

  set(value: number, max: number, tip: string): void {
    const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    this.fill.style.width = `${ratio * 100}%`;
    this.root.title = tip;
  }
}

/** A "BtnLevelUp"-skinned 46x22 text button (Up / VIP). */
function labelButton(parent: HTMLElement, x: number, y: number, label: string, tip: string, onClick: () => void): HTMLDivElement {
  const b = skinButton(std('MainStage_CharInfo/LevelUp'), parent, x, y, tip, onClick);
  b.classList.add('hud-label-btn');
  place(b, x, y, 46, 22);
  b.textContent = label;
  return b;
}

export class PortraitCanvas {
  private readonly root: HTMLDivElement;
  private readonly head: HTMLImageElement;
  private readonly level: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly hp: Bar;
  private readonly mp: Bar;
  private readonly sp: Bar;
  private readonly exp: Bar;
  private readonly lvUp: HTMLDivElement;
  private readonly vip: HTMLDivElement;
  private readonly vipBadge: HTMLSpanElement;
  private readonly heal: HTMLDivElement[];

  constructor(parent: HTMLElement, actions: HudActions) {
    this.root = place(div('hud-portrait', parent), 2, 5, 192, 57) as HTMLDivElement;
    skinImage('MainStage_CharInfo/CharacterPortrait', this.root, 0, 0);
    this.head = document.createElement('img');
    this.head.className = 'hud-head';
    this.head.alt = '';
    place(this.head, 5, 5, 49, 47);
    this.head.title = 'Nhấp xem thông tin chi tiết';
    this.head.onclick = actions.onCharacter;
    this.root.appendChild(this.head);
    // selfHeadPMFlag: the VIP level gem over the head's top-left corner (hidden without VIP).
    this.vipBadge = place(document.createElement('span'), 2, 1, 22, 20) as HTMLSpanElement;
    this.vipBadge.classList.add('hud-vip-badge');
    this.root.appendChild(this.vipBadge);
    this.level = place(div('hud-label hud-level', this.root), 62, 1, 22) as HTMLDivElement;
    this.name = place(div('hud-label hud-name', this.root), 84, 3, 86) as HTMLDivElement;
    this.hp = new Bar(this.root, 'MainStage_CharInfo/HPBar', 80, 22, 89, 5);
    this.mp = new Bar(this.root, 'MainStage_CharInfo/MPBar', 80, 32, 89, 5);
    this.hp.root.onclick = () => actions.onRecover('hp');
    this.mp.root.onclick = () => actions.onRecover('mp');
    this.sp = new Bar(this.root, 'MainStage_CharInfo/SPBar', 80, 41, 105, 4);
    this.exp = new Bar(this.root, 'MainStage_CharInfo/ExpBar', 80, 48, 105, 4);
    // Blood bag buttons (M9): skins follow the pool (empty / half / full) and open the Mua Túi cứu thương window.
    this.heal = [1, 2].map((bt) => skinButton(std(healButtonState(undefined, bt).skin), this.root, 175, bt === 1 ? 19 : 29, '',
      () => actions.onBloodBag(bt)));
    skinButton(std('MainStage_CharInfo/ItemBag'), this.root, 173, 3, 'Vật phẩm nhân vật sử dụng', actions.onBag);
    // "Up" sits outside the body and only shows when the exp bar is full (manual level-up from Lv 20).
    // Both are Flash BasicGlowButton styleName "BtnLevelUp" at 46x22 (the 39x19 skin is stretched), labelled "Up" / "VIP".
    this.lvUp = labelButton(this.root, 198, 0, 'Up', 'Thăng cấp', actions.onLevelUp);
    this.vip = labelButton(this.root, 198, 30, 'VIP', 'VIP', actions.onVip);
  }

  update(p: PlayerData): void {
    this.heal.forEach((b, i) => {
      const s = healButtonState(p.ep, i + 1);
      setStates(b, std(s.skin));
      b.title = s.tip;
    });
    this.head.src = iconUrl(p.iconCode);
    setVipGem(this.vipBadge, p.pmLevel ?? 0);
    this.vipBadge.title = p.pmLevel ? `VIP${p.pmLevel} ${VIP_LEVEL_NAME[p.pmLevel] ?? ''}` : '';
    this.level.textContent = String(p.level);
    this.name.textContent = p.name;
    // Max HP/MP come from property (gear and buffs applied); maxHp/maxMp are only the base cache.
    const maxHp = p.property?.finalHp ?? p.maxHp;
    const maxMp = p.property?.finalMp ?? p.maxMp;
    this.hp.set(p.currentHp, maxHp, `HP: ${p.currentHp}/${maxHp}`);
    this.mp.set(p.currentMp, maxMp, `MP: ${p.currentMp}/${maxMp}`);
    this.sp.set(0, 0, 'SP: 0/0');
    // Character.exp is cumulative; the bar shows progress inside the current level (legacy expSkill).
    const base = LEVEL_EXP[p.level - 1] ?? 0;
    const next = LEVEL_EXP[p.level];
    if (next === undefined) {
      this.exp.set(1, 1, `Exp: ${p.exp - base}\n Cấp kế: -`);
      this.lvUp.hidden = true;
      return;
    }
    const cur = Math.min(p.exp - base, next - base);
    this.exp.set(cur, next - base, `Exp: ${cur}\n Cấp kế: ${next - base}\n Điểm kinh nghiệm không những có thể dùng để thăng cấp nhân vật mà còn có thể thăng cấp kỹ năng`);
    this.lvUp.hidden = !(p.level >= 20 && cur >= next - base);
  }
}
