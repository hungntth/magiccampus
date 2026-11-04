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

/** "[Vòng]" entries (Flash NPCFUNCPANEL_S[2]): takeable loops, plus a repair entry for a broken active loop. */
export interface LoopEntries {
  onTake: (lid: number) => void;
  onRepair: (lid: number) => void;
  needsRepair: (lid: number) => boolean;
}

export class NpcDialog {
  private root: HTMLElement | null = null;
  private current: number | null = null;
  private offs: (() => void)[] = [];

  get npcId(): number | null {
    return this.current;
  }

  show(data: NpcFuncInit, iconCode: string, onQuest: (view: QuestView) => void, onFunc: (npcType: number) => void, loops?: LoopEntries): void {
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
    // Fixed-height box (quests + loop entries) so the dialog keeps its size; long lists scroll.
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
    this.addLoopEntries(list, data, loops);
    root.appendChild(list);

    const leave = el('button', 'npc-leave', 'Rời khỏi');
    leave.onclick = () => this.close();
    root.appendChild(leave);

    stageEl().appendChild(root);
    this.root = root;
    this.current = data.npcId;
    this.offs.push(makeDraggable(root, header, 'npcDialog'), closeOnEscape(() => this.close()));
  }

  private addLoopEntries(list: HTMLElement, data: NpcFuncInit, loops?: LoopEntries): void {
    const rows: [number, string, boolean][] = Object.entries(data.loopInfo.d ?? {}).flatMap(([id, l]) => {
      const lid = Number(id);
      if (l.canTake) return [[lid, `${l.name}[Vòng]`, false] as [number, string, boolean]];
      return loops?.needsRepair(lid) ? [[lid, `${l.name}[Vòng] - Khôi phục`, true] as [number, string, boolean]] : [];
    });
    if (!loops || rows.length === 0) return;
    for (const [lid, text, repair] of rows) {
      const row = el('button', 'npc-quest s102');
      row.title = repair ? 'Nhiệm vụ vòng bị lỗi: nhận lại nhiệm vụ hiện tại' : 'Có thể nhận';
      row.appendChild(el('span', 'npc-mark', '!'));
      row.appendChild(el('span', 'npc-qname', text));
      row.onclick = () => {
        this.close();
        if (repair) loops.onRepair(lid);
        else loops.onTake(lid);
      };
      list.appendChild(row);
    }
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
