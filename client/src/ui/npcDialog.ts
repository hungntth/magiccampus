// "Đối thoại" NPC dialog (DOM, in #stage), laid out like the Flash window: portrait, name + function button,
// greeting text box, "Nhiệm vụ" quest list, "Rời khỏi". One dialog at a time; the scene closes it on scene
// change/destroy or when the player walks away.

import type { NpcFuncInit, QuestView } from '@mc/shared';
import { NpcType } from '@mc/shared';
import { iconUrl } from '../assets';
import { stageEl } from './stage';
import { closeOnEscape, makeDraggable } from './panelBehavior';

const FUNC_LABELS: Record<number, string> = {
  [NpcType.SHOP]: 'Shop',
  [NpcType.AUCTION]: 'Rao bán',
  [NpcType.BANK]: 'Kho',
  [NpcType.HEAL]: 'Trị liệu',
  [NpcType.TRANSPORT]: 'Dịch chuyển',
  [NpcType.CALLBOARD]: 'Bảng thông báo',
  [NpcType.TUTOR]: 'Sức sống',
};

// Row marker + tooltip per quest state: can take / taken (not done) / can finish.
const QUEST_MARK: Record<number, [string, string]> = {
  102: ['!', 'Có thể nhận'],
  103: ['?', 'Chưa xong'],
  104: ['?', 'Hoàn thành'],
};

export class NpcDialog {
  private root: HTMLElement | null = null;
  private current: number | null = null;
  private offs: (() => void)[] = [];

  get npcId(): number | null {
    return this.current;
  }

  show(data: NpcFuncInit, iconCode: string, onQuest: (view: QuestView) => void, onFunc: (npcType: number) => void): void {
    this.close();
    const root = el('div', 'npc-dialog');
    // Top strip = drag handle (legacy dragable window title bar).
    const header = el('div', 'npc-header');
    header.appendChild(el('div', 'npc-title', 'Đối thoại'));
    root.appendChild(header);

    const head = el('div', 'npc-head');
    const portrait = el('div', 'npc-portrait');
    if (iconCode && iconCode !== '0') {
      const img = document.createElement('img');
      img.src = iconUrl(iconCode);
      img.alt = '';
      img.onerror = () => img.remove();
      portrait.appendChild(img);
    }
    head.appendChild(portrait);
    const info = el('div', 'npc-info');
    info.appendChild(el('div', 'npc-name', data.npcName));
    const label = FUNC_LABELS[data.npcType];
    if (data.npcType > 0 && label) {
      const fn = el('button', 'npc-func', label);
      fn.onclick = () => onFunc(data.npcType);
      info.appendChild(fn);
    }
    head.appendChild(info);
    root.appendChild(head);

    root.appendChild(el('div', 'npc-text', data.onServiceText || '…'));

    const views = Object.values(data.npcQuest.list).sort((a, b) => b.state - a.state || a.qid - b.qid);
    if (views.length > 0) {
      root.appendChild(el('div', 'npc-label', 'Nhiệm vụ'));
      const list = el('div', 'npc-quests');
      for (const v of views) {
        const row = el('button', `npc-quest s${v.state}`);
        const [mark, tip] = QUEST_MARK[v.state] ?? ['•', ''];
        row.title = tip;
        row.appendChild(el('span', 'npc-mark', mark));
        row.appendChild(el('span', 'npc-qname', v.data.name));
        row.onclick = () => onQuest(v);
        list.appendChild(row);
      }
      root.appendChild(list);
    }

    const leave = el('button', 'npc-leave', 'Rời khỏi');
    leave.onclick = () => this.close();
    root.appendChild(leave);

    stageEl().appendChild(root);
    this.root = root;
    this.current = data.npcId;
    this.offs.push(makeDraggable(root, header), closeOnEscape(() => this.close()));
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
    this.current = null;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
