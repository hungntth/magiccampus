// Battle DOM layer (legacy PlayerCmdCanvas + TimeCountCanvas + center banner): command buttons (Tấn công, Phòng ngự, Kỹ năng,
// Vật phẩm, Bỏ chạy; Kỹ năng lists the learned active skills with their MP cost), the 25 s countdown (red from 9 s, TIMEOUT at 0), the potion list and the "Bắt Đầu / Đang chờ..." banner.
// A 900x570 box centred in #stage so the offsets match the Flash layout. Strings are the original Language.as ones.

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
    this.addButton('item', 'Vật phẩm', () => this.toggleItems());
    this.addButton('escape', 'Bỏ chạy', () => h.onEscape());
    this.items.style.display = 'none';
    this.skillList.style.display = 'none';
    this.menu.style.display = 'none';
    this.timer.style.display = 'none';
    this.root.append(this.menu, this.items, this.skillList, this.timer, this.banner);
    stageEl().appendChild(this.root);
  }

  private addButton(key: string, label: string, onClick: () => void): void {
    const b = el('battle-btn', label, 'button');
    b.onclick = onClick;
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
    this.menu.style.display = '';
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
    this.menu.style.display = 'none';
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
  }
}
