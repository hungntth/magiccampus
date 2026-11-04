// Battle pet command menu (legacy PetCmdCanvas, M4 subset): the second command step after the player's own command.
// Same column as the player menu (reuses battle.css): "Pet" title, Tấn công / Kỹ năng / Phòng ngự and a skill list.
// The countdown stays with BattleMenu (it keeps running while this menu is up).

import { skillMpLabel, type LearnedSkill } from '@mc/shared';
import { stageEl } from './stage';
import './battle.css';

export interface PetCmdHandlers {
  onAttackMode(): void;
  onDefend(): void;
  /** The pet's battle-usable skills (from its cList entry). */
  skills(): readonly LearnedSkill[];
  onSkill(skill: LearnedSkill): void;
}

const el = (cls: string, text?: string, tag = 'div'): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class PetCmdMenu {
  private readonly root = el('battle-side');
  private readonly menu = el('battle-menu');
  private readonly skillList = el('battle-items battle-skills');
  private readonly buttons = new Map<string, HTMLElement>();

  constructor(private readonly h: PetCmdHandlers, petName: string) {
    this.menu.append(el('battle-menu-title', 'Pet'));
    this.button('attack', 'Tấn công', () => this.attackMode());
    this.button('skill', 'Kỹ năng', () => this.toggleSkills());
    this.button('defend', 'Phòng ngự', () => h.onDefend());
    const name = el('battle-empty', petName);
    name.style.textAlign = 'center';
    this.skillList.style.display = 'none';
    this.root.append(this.menu, name, this.skillList);
    this.mark('attack');
    stageEl().append(this.root);
  }

  private button(key: string, label: string, onClick: () => void): void {
    const b = el('battle-btn', label, 'button');
    b.onclick = onClick;
    this.buttons.set(key, b);
    this.menu.appendChild(b);
  }

  private mark(key: string): void {
    for (const [k, b] of this.buttons) b.classList.toggle('selected', k === key);
  }

  private attackMode(): void {
    this.skillList.style.display = 'none';
    this.mark('attack');
    this.h.onAttackMode();
  }

  private toggleSkills(): void {
    if (this.skillList.style.display !== 'none') {
      this.skillList.style.display = 'none';
      return;
    }
    this.skillList.replaceChildren(el('battle-menu-title', 'Kỹ năng pet'));
    const skills = this.h.skills();
    if (skills.length === 0) this.skillList.appendChild(el('battle-empty', 'Chưa có kỹ năng'));
    for (const sk of skills) {
      const row = el('battle-btn battle-item', `${sk.name}  MP ${skillMpLabel(sk.useMp)}`, 'button');
      row.onclick = () => {
        this.skillList.style.display = 'none';
        this.mark('skill');
        this.h.onSkill(sk);
      };
      this.skillList.appendChild(row);
    }
    this.skillList.style.display = '';
  }

  destroy(): void {
    this.root.remove();
  }
}
