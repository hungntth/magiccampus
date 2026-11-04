// Player + pet portraits, top-left (legacy PortraitCanvas left2/top5 192x57, PetCanvas left2/top67 179x46).
// Bars draw no text; values are in tooltips ("HP: 120/300"). HP / MP bar click = potion recovery, "Up" = manual level-up.

import { LEVEL_EXP, type PlayerData } from '@mc/shared';
import { iconUrl } from '../../assets';
import type { HudActions } from './mainHud';
import { div, notReady, place, skinButton, skinImage, std } from './skin';

class Bar {
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

  constructor(parent: HTMLElement, actions: HudActions) {
    this.root = place(div('hud-portrait', parent), 2, 5, 192, 57) as HTMLDivElement;
    skinImage('MainStage_CharInfo/CharacterPortrait', this.root, 0, 0);
    this.head = document.createElement('img');
    this.head.className = 'hud-head';
    this.head.alt = '';
    place(this.head, 5, 5, 49, 47);
    this.head.title = 'Nhấp xem thông tin chi tiết';
    this.head.onclick = notReady;
    this.root.appendChild(this.head);
    this.level = place(div('hud-label hud-level', this.root), 62, 1, 22) as HTMLDivElement;
    this.name = place(div('hud-label hud-name', this.root), 84, 3, 86) as HTMLDivElement;
    this.hp = new Bar(this.root, 'MainStage_CharInfo/HPBar', 80, 22, 89, 5);
    this.mp = new Bar(this.root, 'MainStage_CharInfo/MPBar', 80, 32, 89, 5);
    this.hp.root.onclick = () => actions.onRecover('hp');
    this.mp.root.onclick = () => actions.onRecover('mp');
    this.sp = new Bar(this.root, 'MainStage_CharInfo/SPBar', 80, 41, 105, 4);
    this.exp = new Bar(this.root, 'MainStage_CharInfo/ExpBar', 80, 48, 105, 4);
    skinButton({ up: 'MainStage_CharInfo/HealEmptyUp', over: 'MainStage_CharInfo/HealEmptyOver' }, this.root, 175, 19,
      'Sinh Mệnh Hoàn tiện dụng', notReady);
    skinButton({ up: 'MainStage_CharInfo/HealMPEmptyUp', over: 'MainStage_CharInfo/HealMPEmptyOver' }, this.root, 175,
      29, 'Pháp Lực Hoàn tiện dụng', notReady);
    skinButton(std('MainStage_CharInfo/ItemBag'), this.root, 173, 3, 'Vật phẩm nhân vật sử dụng', notReady);
    // "Up" sits outside the body and only shows when the exp bar is full (manual level-up from Lv 20).
    this.lvUp = skinButton(std('MainStage_CharInfo/LevelUp'), this.root, 198, 0, 'Thăng cấp', actions.onLevelUp);
    const vip = place(div('hud-vip', this.root, 'VIP'), 198, 30, 46, 22);
    vip.title = 'VIP';
    vip.onclick = notReady;
  }

  update(p: PlayerData): void {
    this.head.src = iconUrl(p.iconCode);
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

/** Battle pet frame; no pets are ported yet, so it shows the legacy empty state (full bars, no avatar). */
export class PetCanvas {
  constructor(parent: HTMLElement) {
    const root = place(div('hud-portrait', parent), 2, 67, 179, 46);
    skinImage('MainStage_CharInfo/PetPortrait_png', root, 0, 0);
    const head = place(div('hud-pet-head', root), 4, 4, 38, 38);
    head.title = 'Nhấp xem thông tin chi tiết';
    head.onclick = notReady;
    place(div('hud-label hud-level', root), 48, 1, 25);
    place(div('hud-label hud-name', root), 68, 1, 90);
    new Bar(root, 'MainStage_CharInfo/HPBar', 67, 22, 89, 5).set(1, 1, 'HP: 100/100');
    new Bar(root, 'MainStage_CharInfo/MPBar', 67, 32, 89, 5).set(1, 1, 'MP: 100/100');
    skinButton({ up: 'MainStage_CharInfo/HealEmptyUp' }, root, 161, 20, 'Sinh Mệnh Hoàn tiện dụng', notReady);
    skinButton({ up: 'MainStage_CharInfo/HealMPEmptyUp' }, root, 161, 30, 'Pháp Lực Hoàn tiện dụng', notReady);
    skinButton(std('MainStage_CharInfo/ItemBag'), root, 160, 3, 'Vật phẩm pet sử dụng', notReady);
  }
}
