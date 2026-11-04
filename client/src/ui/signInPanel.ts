// "Báo danh nhận quà" window: tab 0 = the legacy 5-day SignInPanel (cards, state machine of onGetSignInData), tab 1 = the monthly
// calendar (signInCalendar.ts). Pure view; ActivityController owns data and calls.

import type { SignInData } from '@mc/shared';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { renderCalendar, type CalendarHost } from './signInCalendar';
import { stageEl } from './stage';
import './activity.css';

export interface SignInHost extends CalendarHost {
  legacy(): SignInData | null;
  onSigninNow(): void;
  onClose(): void;
}

/** Reward text per card (Language.SIGN_IN_U[1..5]) with the level-scaled exp / silver every card also pays. */
const CARDS = [
  'Truy Hồn Phù*1',
  'Loa*2, Sách Hồi Nhóm*2',
  'Đông Huyền Lệnh Kỳ (Lam)*1, Sách Gặp Đầy Quái (15 phút)*1',
  'Bang Hội Phù*4, Kết Tinh Thần Tu A*2',
  'Thăng Tinh Thạch*5, Sách Tăng Thần Tu 2 Lần (1 Giờ)*1',
];

const el = (cls: string, text?: string, tag = 'div'): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Flash onGetSignInData state: the enabled card (1..5, 0 none) and how many ticks show. */
export function cardState(d: SignInData): { enabled: number; ticks: number } {
  const n = d.continueSigninTime;
  if (!d.signedYesterday) return d.signinedToday ? { enabled: 0, ticks: 1 } : { enabled: 1, ticks: 0 };
  if (!d.signinedToday) {
    const next = (n + 1) % 5 === 0 ? 5 : (n + 1) % 5;
    return { enabled: next, ticks: n === 5 ? 0 : n };
  }
  return { enabled: 0, ticks: n === 5 ? 0 : n };
}

export class SignInPanel {
  private root: HTMLElement | null = null;
  private tab = 1;
  private offs: (() => void)[] = [];

  constructor(private readonly host: SignInHost) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(tab = 1): void {
    this.tab = tab;
    if (!this.root) {
      const root = el('act-win sign-in');
      const head = el('act-head');
      head.appendChild(el('act-title', 'Báo Danh Nhận Quà'));
      const x = el('act-close', '×', 'button');
      x.title = 'Đóng';
      x.onclick = () => this.host.onClose();
      root.append(head, x, el('act-tabs'), el('act-content'));
      stageEl().appendChild(root);
      this.root = root;
      this.offs.push(makeDraggable(root, head), closeOnEscape(() => this.host.onClose()));
    }
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
  }

  render(): void {
    const root = this.root;
    if (!root) return;
    const tabs = root.querySelector('.act-tabs')!;
    tabs.replaceChildren(
      ...['Báo danh 5 ngày', 'Báo danh tháng'].map((label, i) => {
        const b = el(`act-btn${i === this.tab ? ' on' : ''}`, label, 'button');
        b.onclick = () => {
          this.tab = i;
          this.render();
        };
        return b;
      }),
    );
    root.querySelector('.act-content')!.replaceChildren(this.tab === 0 ? this.legacyTab() : renderCalendar(this.host));
  }

  private legacyTab(): HTMLElement {
    const wrap = el('act-body');
    const d = this.host.legacy();
    if (!d) {
      wrap.appendChild(el('act-muted', 'Đang tải...'));
      return wrap;
    }
    const st = cardState(d);
    wrap.appendChild(el('act-muted', 'Người chơi cấp 20 trở lên mỗi ngày đều có thể báo danh; báo danh liên tục 5 ngày nhận quà theo từng ngày. Gián đoạn sẽ tính lại từ ngày 1.'));
    const cards = el('act-cards');
    CARDS.forEach((text, i) => {
      const card = el(`act-card${st.enabled === i + 1 ? ' ready' : ''}${i < st.ticks ? ' done' : ''}`);
      card.dataset.card = String(i + 1);
      card.append(el('d', `Ngày ${i + 1}`), el('r', `Nhận ${text}\n+ kinh nghiệm, bạc khóa`));
      (card.lastChild as HTMLElement).style.whiteSpace = 'pre-line';
      if (i < st.ticks) card.appendChild(el('act-tick', '✓ Đã nhận'));
      const b = el('act-btn', 'Báo danh', 'button') as HTMLButtonElement;
      b.disabled = st.enabled !== i + 1;
      b.onclick = () => this.host.onSigninNow();
      card.appendChild(b);
      cards.appendChild(card);
    });
    wrap.appendChild(cards);
    return wrap;
  }
}
