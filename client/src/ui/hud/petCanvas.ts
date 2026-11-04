// HUD pet frame under the portrait (legacy PetCanvas left2/top67 179x46): battle pet icon, name, level and HP / MP bars
// (no exp bar). Click the icon = toggle the pet window. Empty state = default frame with full bars and no avatar.

import { petLevelOfExp, type PetView } from '@mc/shared';
import { iconUrl } from '../../assets';
import { Bar } from './portrait';
import { div, notReady, place, skinButton, skinImage, std } from './skin';

export class PetCanvas {
  private readonly head: HTMLImageElement;
  private readonly level: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly hp: Bar;
  private readonly mp: Bar;

  constructor(parent: HTMLElement, onToggle: () => void) {
    const root = place(div('hud-portrait', parent), 2, 67, 179, 46);
    skinImage('MainStage_CharInfo/PetPortrait_png', root, 0, 0);
    this.head = document.createElement('img');
    this.head.className = 'hud-pet-head';
    this.head.alt = '';
    place(this.head, 4, 4, 38, 38);
    this.head.title = 'Nhấp xem thông tin chi tiết';
    this.head.onclick = onToggle;
    root.appendChild(this.head);
    this.level = place(div('hud-label hud-level', root), 48, 1, 25) as HTMLDivElement;
    this.name = place(div('hud-label hud-name', root), 68, 1, 90) as HTMLDivElement;
    this.hp = new Bar(root, 'MainStage_CharInfo/HPBar', 67, 22, 89, 5);
    this.mp = new Bar(root, 'MainStage_CharInfo/MPBar', 67, 32, 89, 5);
    skinButton({ up: 'MainStage_CharInfo/HealEmptyUp' }, root, 161, 20, 'Sinh Mệnh Hoàn tiện dụng', notReady);
    skinButton({ up: 'MainStage_CharInfo/HealMPEmptyUp' }, root, 161, 30, 'Pháp Lực Hoàn tiện dụng', notReady);
    skinButton(std('MainStage_CharInfo/ItemBag'), root, 160, 3, 'Vật phẩm pet sử dụng', notReady);
    this.setPet(null);
  }

  /** The battle pet (state 1) or null. Pet HP / MP are always full outside battle in H5. */
  setPet(p: PetView | null): void {
    if (!p) {
      this.head.removeAttribute('src');
      this.head.style.visibility = 'hidden';
      this.level.textContent = '';
      this.name.textContent = '';
      this.hp.set(1, 1, 'HP: 100/100');
      this.mp.set(1, 1, 'MP: 100/100');
      return;
    }
    this.head.style.visibility = 'visible';
    this.head.src = iconUrl(p.iconCode);
    this.level.textContent = String(petLevelOfExp(p.exp));
    this.name.textContent = p.petName;
    const maxHp = p.property.finalHp;
    const maxMp = p.property.finalMp;
    this.hp.set(p.currentHp, maxHp, `HP: ${p.currentHp}/${maxHp}`);
    this.mp.set(p.currentMp, maxMp, `MP: ${p.currentMp}/${maxMp}`);
  }
}
