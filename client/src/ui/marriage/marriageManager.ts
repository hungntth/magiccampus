// Marriage manager window (legacy MarriageManagerPanel, M14 D): tab "Tìm người yêu" (seek board, propose to the selected row, post
// an ad for 1 000 000 silver) and tab "Của tôi" (own ad with cancel, proposals sent / received with Đồng ý / Từ chối). Pure view:
// MarriageController owns the lists and the RPCs and calls `render()` after every push.

import { LEVEL_EXP, MARRIAGE, type CharMarriageRow, type MarriageReqRow, type MarriageSekRow } from '@mc/shared';
import { closeOnEscape, makeDraggable } from '../panelBehavior';
import { stageEl } from '../stage';
import { askText } from './marriageText';
import { classLabel, el } from './marriageDom';
import './marriage.css';

export interface MarriageManagerActions {
  seekList(): MarriageSekRow[];
  ownList(): CharMarriageRow[];
  myId(): number;
  myGender(): number;
  /** Re-requests both lists (`initMarriage`). */
  refresh(): void;
  /** Posts the ad (the controller confirms the price). */
  post(content: string): void;
  cancelAd(): void;
  propose(row: MarriageSekRow, content: string): void;
  feedback(id: number, response: 1 | 2): void;
}

type Tab = 'seek' | 'mine';

const levelOfExp = (exp: number): number => {
  let level = 1;
  for (let i = 0; i < LEVEL_EXP.length; i++) if (exp >= LEVEL_EXP[i]) level = i + 1;
  return level;
};

const dateText = (ms: number): string => new Date(ms).toLocaleString('vi-VN', { hour12: false });

export class MarriageManager {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private tab: Tab = 'seek';
  private selected: number | null = null;

  constructor(private readonly a: MarriageManagerActions) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(): void {
    if (this.root) return;
    const root = el('div', 'marriage-panel');
    const header = el('div', 'marriage-header');
    header.appendChild(el('div', 'marriage-title', 'Kết Hôn'));
    const x = el('button', 'marriage-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.close();
    header.appendChild(x);
    root.append(header, el('div', 'marriage-tabs'), el('div', 'marriage-body'), el('div', 'marriage-bar'));
    stageEl().appendChild(root);
    this.root = root;
    this.offs = [makeDraggable(root, header, 'marriageManager'), closeOnEscape(() => this.close())];
    this.render();
    this.a.refresh();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
    this.selected = null;
  }

  render(): void {
    const root = this.root;
    if (!root) return;
    const q = <T extends HTMLElement>(sel: string): T => root.querySelector(sel) as T;
    const tabs: [Tab, string][] = [['seek', 'Tìm người yêu'], ['mine', 'Của tôi']];
    q('.marriage-tabs').replaceChildren(...tabs.map(([id, label]) => {
      const b = el('button', `marriage-tab${id === this.tab ? ' active' : ''}`, label);
      b.dataset.tab = id;
      b.onclick = () => {
        this.tab = id;
        this.selected = null;
        this.render();
      };
      return b;
    }));
    if (this.tab === 'seek') this.renderSeek(q('.marriage-body'), q('.marriage-bar'));
    else this.renderMine(q('.marriage-body'), q('.marriage-bar'));
  }

  private renderSeek(body: HTMLElement, bar: HTMLElement): void {
    const rows = this.a.seekList();
    body.replaceChildren();
    if (rows.length === 0) body.appendChild(el('div', 'marriage-empty', 'Chưa có ai đăng tin tìm người yêu'));
    for (const r of rows) {
      const row = el('div', `marriage-row${r.cid === this.selected ? ' selected' : ''}${r.online ? ' online' : ''}`);
      row.dataset.cid = String(r.cid);
      row.append(
        el('span', 'marriage-dot', '●'), el('span', 'marriage-name', r.name),
        el('span', 'marriage-sub', `${r.gender === 1 ? 'Nữ' : 'Nam'} · Cấp ${levelOfExp(r.exp)} · ${classLabel(r.classId)}`),
      );
      row.title = r.content;
      row.onclick = () => {
        this.selected = r.cid;
        this.render();
      };
      body.appendChild(row);
      if (r.cid === this.selected) body.appendChild(el('div', 'marriage-detail', r.content || '(Không có lời nhắn)'));
    }
    bar.replaceChildren();
    const chosen = rows.find((r) => r.cid === this.selected);
    const propose = el('button', 'friend-btn marriage-btn', 'Cầu hôn');
    propose.disabled = !chosen || chosen.cid === this.a.myId() || chosen.gender === this.a.myGender();
    propose.title = 'Chọn một người khác giới trong danh sách';
    propose.onclick = () => {
      if (chosen) askText(`Lời cầu hôn gửi ${chosen.name}`, 'Em đồng ý làm vợ anh nhé?', (text) => this.a.propose(chosen, text));
    };
    const post = el('button', 'friend-btn marriage-btn', `Đăng tin (${MARRIAGE.seekCost.toLocaleString('vi-VN')} bạc)`);
    post.onclick = () => askText('Thông tin tìm người yêu', 'Giới thiệu bản thân...', (text) => this.a.post(text));
    const refresh = el('button', 'friend-btn marriage-btn', 'Làm mới');
    refresh.onclick = () => this.a.refresh();
    bar.append(propose, post, refresh);
  }

  private renderMine(body: HTMLElement, bar: HTMLElement): void {
    const rows = this.a.ownList();
    body.replaceChildren();
    bar.replaceChildren();
    if (rows.length === 0) body.appendChild(el('div', 'marriage-empty', 'Bạn chưa có tin đăng hay lời cầu hôn nào'));
    for (const r of rows) body.appendChild(r.type === 0 ? this.adBlock(r.content, r.addDate) : this.requestBlock(r));
    const refresh = el('button', 'friend-btn marriage-btn', 'Làm mới');
    refresh.onclick = () => this.a.refresh();
    bar.appendChild(refresh);
  }

  private adBlock(content: string, addDate: number): HTMLElement {
    const box = el('div', 'marriage-card marriage-ad');
    box.append(el('div', 'marriage-card-head', 'Tin tìm người yêu của bạn'), el('div', 'marriage-card-text', content || '(Không có lời nhắn)'), el('div', 'marriage-card-date', dateText(addDate)));
    const cancel = el('button', 'friend-btn marriage-btn', 'Hủy tin');
    cancel.onclick = () => this.a.cancelAd();
    box.appendChild(cancel);
    return box;
  }

  private requestBlock(r: MarriageReqRow): HTMLElement {
    const incoming = r.targetId === this.a.myId();
    const [from, to] = r.name.split('|');
    const box = el('div', `marriage-card marriage-req${incoming ? ' incoming' : ' outgoing'}`);
    box.dataset.id = String(r.id);
    box.append(
      el('div', 'marriage-card-head', incoming ? `${from} cầu hôn bạn` : `Bạn cầu hôn ${to}`),
      el('div', 'marriage-card-text', r.content || '(Không có lời nhắn)'),
      el('div', 'marriage-card-date', dateText(r.addDate)),
    );
    if (r.flag === 0 && incoming) {
      const row = el('div', 'marriage-card-row');
      const yes = el('button', 'friend-btn marriage-btn', 'Đồng ý');
      yes.onclick = () => this.a.feedback(r.id, 1);
      const no = el('button', 'friend-btn marriage-btn', 'Từ chối');
      no.onclick = () => this.a.feedback(r.id, 2);
      row.append(yes, no);
      box.appendChild(row);
    } else {
      box.appendChild(el('div', 'marriage-card-state', r.flag === 1 ? 'Đã đồng ý' : r.flag === 2 ? 'Đã từ chối' : 'Đang chờ trả lời'));
    }
    return box;
  }
}
