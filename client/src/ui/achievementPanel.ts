// "Thành tựu" window (legacy AchievementPanel / AchievementDetail): overview tab (points, last three achievements, per-kind
// progress) plus one tab per kind (1..6) listing rows with description, award points, per-requirement progress (`done/num`) and the
// claim button. Pure view: AchievementController owns the data and the claim call.

import { ACHIEVE_DONE_MIN, ACHIEVE_KINDS, isAchieveDone, reqProgressText, type AchieveEntry, type AchieveReqProgress } from '@mc/shared';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import './achievementPanel.css';

export interface AchievementPanelHost {
  entries(): readonly AchieveEntry[];
  points(): number;
  doneLog(): Readonly<Record<string, number>>;
  reqLog(): Readonly<Record<string, AchieveReqProgress>>;
  claimedLog(): Readonly<Record<string, number>>;
  loaded(): boolean;
  onClaim(aid: number): void;
  onClose(): void;
}

const COLORS = ['#ffffff', '#7be07b', '#6fb6ff', '#c58bff', '#ffa63a', '#ff6a6a', '#ffd34d'];
const PAGE = 6;

export class AchievementPanel {
  private root: HTMLElement | null = null;
  private tab = 0; // 0 = overview, 1..6 = kind
  private page = 0;
  private offs: (() => void)[] = [];

  constructor(private readonly host: AchievementPanelHost) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(): void {
    if (this.root) return;
    const root = el('div', 'ach-panel');
    const header = el('div', 'ach-header');
    header.appendChild(el('div', 'ach-name', 'Thành tựu'));
    const x = el('button', 'ach-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.host.onClose();
    root.append(header, x);
    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header, 'achievementPanel'), closeOnEscape(() => this.host.onClose()));
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
    root.querySelector('.ach-body')?.remove();
    const body = el('div', 'ach-body');
    body.appendChild(el('div', 'ach-points', `Điểm thành tựu ${this.host.points()}`));
    const tabs = el('div', 'ach-tabs');
    ['Tổng quan', ...ACHIEVE_KINDS.map((k) => k.label)].forEach((label, i) => {
      const b = el('button', `ach-tab${i === this.tab ? ' on' : ''}`, label);
      b.onclick = () => {
        this.tab = i;
        this.page = 0;
        this.render();
      };
      tabs.appendChild(b);
    });
    body.appendChild(tabs);
    if (!this.host.loaded()) body.appendChild(el('div', 'ach-empty', 'Đang tải...'));
    else body.appendChild(this.tab === 0 ? this.overview() : this.list(this.tab));
    root.appendChild(body);
  }

  private overview(): HTMLElement {
    const box = el('div', 'ach-list');
    const done = this.host.doneLog();
    const entries = this.host.entries();
    const recent = entries.filter((e) => isAchieveDone(done, e.id)).sort((a, b) => (done[String(b.id)] ?? 0) - (done[String(a.id)] ?? 0)).slice(0, 3);
    box.appendChild(el('div', 'ach-h', 'Thành tựu gần đây'));
    for (const e of recent) box.appendChild(this.row(e));
    if (recent.length === 0) box.appendChild(el('div', 'ach-empty', 'Chưa đạt thành tựu nào'));
    box.appendChild(el('div', 'ach-h', 'Tiến độ'));
    for (const k of ACHIEVE_KINDS) {
      const all = entries.filter((e) => e.kind === k.kind);
      const n = all.filter((e) => isAchieveDone(done, e.id)).length;
      box.appendChild(el('div', 'ach-sum', `${k.label}: ${n}/${all.length}`));
    }
    return box;
  }

  private list(kind: number): HTMLElement {
    const box = el('div', 'ach-list');
    const all = this.host.entries().filter((e) => e.kind === kind);
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    this.page = Math.min(this.page, pages - 1);
    for (const e of all.slice(this.page * PAGE, (this.page + 1) * PAGE)) box.appendChild(this.row(e));
    const nav = el('div', 'ach-nav');
    const prev = el('button', 'ach-btn', '<');
    prev.disabled = this.page === 0;
    prev.onclick = () => {
      this.page -= 1;
      this.render();
    };
    const next = el('button', 'ach-btn', '>');
    next.disabled = this.page >= pages - 1;
    next.onclick = () => {
      this.page += 1;
      this.render();
    };
    nav.append(prev, el('span', 'ach-page', `${this.page + 1}/${pages}`), next);
    box.appendChild(nav);
    return box;
  }

  private row(e: AchieveEntry): HTMLElement {
    const done = this.host.doneLog();
    const finished = isAchieveDone(done, e.id);
    const row = el('div', `ach-row${finished ? ' done' : ''}${e.tracked ? '' : ' untracked'}`);
    const name = el('div', 'ach-rname', e.name);
    name.style.color = COLORS[e.color] ?? COLORS[0];
    row.appendChild(name);
    row.appendChild(el('div', 'ach-pts', `+${e.award}`));
    row.appendChild(el('div', 'ach-desc', e.description));
    if (finished) {
      const d = new Date(done[String(e.id)] ?? ACHIEVE_DONE_MIN);
      row.appendChild(el('div', 'ach-date', `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`));
    } else if (!e.tracked) {
      row.appendChild(el('div', 'ach-date', 'Chưa hỗ trợ'));
    } else {
      for (const q of e.reqs) {
        if (q.showType !== 2 && q.num <= 1) continue;
        const have = this.host.reqLog()[String(q.id)]?.progress ?? 0;
        const bar = el('div', 'ach-bar');
        const fill = el('div', 'ach-fill');
        fill.style.width = `${Math.min(100, Math.floor((Math.min(have, q.num) / Math.max(1, q.num)) * 100))}%`;
        bar.append(fill, el('span', 'ach-bartext', `${q.name ? `${q.name}: ` : ''}${reqProgressText(have, q.num)}`));
        row.appendChild(bar);
      }
    }
    const claimed = (this.host.claimedLog()[String(e.id)] ?? 0) > 0;
    if (finished && e.isAward > 0) {
      const b = el('button', 'ach-claim', claimed ? 'Đã nhận' : 'Nhận thưởng');
      b.disabled = claimed;
      b.title = e.desc;
      b.onclick = () => this.host.onClaim(e.id);
      row.appendChild(b);
    }
    return row;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
