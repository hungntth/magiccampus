// Battle DOM layer (legacy PlayerCmdCanvas + battleInfoBtn + TimeCountCanvas + center banner). The command column sits at
// the stage's right edge: "Nhân vật" title tab, the nine PLAYERCMDCANVAS_U buttons in Flash order, "Thông tin" under it; Kỹ năng
// and Vật phẩm open lists beside it. Timer (25 s, red from 9 s) and banner live in a 900x570 box centred in #stage.

import { BATTLE_TURN_SECONDS, skillMpLabel, type BagItem, type LearnedSkill } from '@mc/shared';
import { stageEl } from './stage';
import './battle.css';

export interface BattleMenuHandlers {
  onAttackMode(): void;
  onDefend(): void;
  onEscape(): void;
  /** Learned skills usable in battle (active, supported). */
  skills(): LearnedSkill[];
  onSkill(skill: LearnedSkill): void;
  onItem(item: BagItem): void;
  onTimeout(): void;
  /** Potions currently in the bag, for the Vật phẩm list. */
  potions(): BagItem[];
}

const el = (cls: string, text?: string, tag = 'div'): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class BattleMenu {
  readonly root = el('battle-ui');
  /** Right-edge column: command panel, Thông tin and the skill/item lists. */
  private readonly side = el('battle-side');
  private readonly menu = el('battle-menu');
  private readonly timer = el('battle-timer');
  private readonly banner = el('battle-banner');
  private readonly items = el('battle-items');
  private readonly skillList = el('battle-items battle-skills');
  private readonly buttons = new Map<string, HTMLElement>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private left = BATTLE_TURN_SECONDS;

  constructor(private readonly h: BattleMenuHandlers) {
    this.menu.append(el('battle-menu-title', 'Nhân vật'));
    this.addButton('attack', 'Tấn công', () => this.selectAttack());
    this.addButton('defend', 'Phòng ngự', () => h.onDefend());
    this.addButton('skill', 'Kỹ năng', () => this.toggleSkills());
    // Bắt (capture), Pet, Vị trí (swap position) and Auto have no H5 feature yet: shown, disabled.
    this.addButton('catch', 'Bắt', null);
    this.addButton('pet', 'Pet', null);
    this.addButton('position', 'Vị trí', null);
    this.addButton('item', 'Vật phẩm', () => this.toggleItems());
    this.addButton('escape', 'Bỏ chạy', () => h.onEscape());
    this.addButton('auto', 'Auto', null);
    // BATTLESTAGE_S[17]: toggles the battle info panel in Flash, not ported yet.
    const info = el('battle-btn battle-info-btn', 'Thông tin', 'button') as HTMLButtonElement;
    info.disabled = true;
    this.items.style.display = 'none';
    this.skillList.style.display = 'none';
    this.side.style.display = 'none';
    this.timer.style.display = 'none';
    this.side.append(this.menu, info, this.items, this.skillList);
    this.root.append(this.timer, this.banner);
    stageEl().append(this.root, this.side);
  }

  /** `onClick` null = no feature behind it yet, rendered disabled. */
  private addButton(key: string, label: string, onClick: (() => void) | null): void {
    const b = el('battle-btn', label, 'button') as HTMLButtonElement;
    if (onClick) b.onclick = onClick;
    else b.disabled = true;
    this.buttons.set(key, b);
    this.menu.appendChild(b);
  }

  private selectAttack(): void {
    this.items.style.display = 'none';
    this.skillList.style.display = 'none';
    this.mark('attack');
    this.h.onAttackMode();
  }

  private mark(key: string): void {
    for (const [k, b] of this.buttons) b.classList.toggle('selected', k === key);
  }

  private toggleSkills(): void {
    this.items.style.display = 'none';
    if (this.skillList.style.display !== 'none') {
      this.skillList.style.display = 'none';
      return;
    }
    this.skillList.replaceChildren(el('battle-menu-title', 'Kỹ năng'));
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

  private toggleItems(): void {
    this.skillList.style.display = 'none';
    if (this.items.style.display !== 'none') {
      this.items.style.display = 'none';
      return;
    }
    this.items.replaceChildren(el('battle-menu-title', 'Vật phẩm'));
    const potions = this.h.potions();
    if (potions.length === 0) this.items.appendChild(el('battle-empty', 'Không có thuốc'));
    for (const it of potions) {
      const row = el('battle-btn battle-item', `${it.name} x${it.stackNum}`, 'button');
      row.onclick = () => {
        this.items.style.display = 'none';
        this.h.onItem(it);
      };
      this.items.appendChild(row);
    }
    this.items.style.display = '';
  }

  /** Shows the command menu and starts the countdown; attack is selected by default. */
  show(): void {
    this.hideBanner();
    this.side.style.display = '';
    this.timer.style.display = '';
    this.mark('attack');
    this.left = BATTLE_TURN_SECONDS;
    this.renderTimer();
    this.stopTimer();
    this.interval = setInterval(() => {
      this.left--;
      this.renderTimer();
      if (this.left <= 0) {
        this.stopTimer();
        this.h.onTimeout();
      }
    }, 1000);
  }

  /** Hides menu and timer; `waitText` ("Đang chờ...") is shown as the banner until the next show(). */
  hide(waitText?: string): void {
    this.stopTimer();
    this.side.style.display = 'none';
    this.items.style.display = 'none';
    this.skillList.style.display = 'none';
    this.timer.style.display = 'none';
    if (waitText) this.showBanner(waitText, 0);
    else this.hideBanner();
  }

  /** Center text for `ms` (0 = until replaced or hidden). */
  showBanner(text: string, ms: number): void {
    this.hideBanner();
    this.banner.textContent = text;
    this.banner.style.display = '';
    if (ms > 0) this.bannerTimer = setTimeout(() => this.hideBanner(), ms);
  }

  private hideBanner(): void {
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = null;
    this.banner.style.display = 'none';
  }

  private renderTimer(): void {
    this.timer.textContent = String(Math.max(0, this.left));
    this.timer.classList.toggle('urgent', this.left <= 9);
  }

  private stopTimer(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  destroy(): void {
    this.stopTimer();
    this.hideBanner();
    this.root.remove();
    this.side.remove();
  }
}
