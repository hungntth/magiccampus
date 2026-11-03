// "Đối thoại" NPC dialog (DOM, in #ui): portrait, name, greeting text, quest rows, function button, close.
// One dialog at a time; the scene closes it on scene change/destroy or when the player walks away.

import type { NpcFuncInit, QuestView } from '@mc/shared';
import { NpcType } from '@mc/shared';
import { iconUrl } from '../assets';
import { toast } from './screens';

const FUNC_LABELS: Record<number, string> = {
  [NpcType.SHOP]: 'Shop',
  [NpcType.AUCTION]: 'Rao bán',
  [NpcType.BANK]: 'Kho',
  [NpcType.HEAL]: 'Trị liệu',
  [NpcType.TRANSPORT]: 'Dịch chuyển',
  [NpcType.CALLBOARD]: 'Bảng thông báo',
  [NpcType.TUTOR]: 'Sức sống',
};

const QUEST_SUFFIX: Record<number, string> = { 102: ' (Có thể nhận)', 103: ' (Chưa xong)', 104: ' (Hoàn thành)' };

export class NpcDialog {
  private root: HTMLElement | null = null;
  private current: number | null = null;

  get npcId(): number | null {
    return this.current;
  }

  show(data: NpcFuncInit, iconCode: string, onQuest: (view: QuestView) => void): void {
    this.close();
    const root = document.createElement('div');
    root.className = 'npc-dialog';

    const title = document.createElement('h3');
    title.textContent = 'Đối thoại';
    root.appendChild(title);

    const head = document.createElement('div');
    head.className = 'npc-head';
    if (iconCode && iconCode !== '0') {
      const img = document.createElement('img');
      img.src = iconUrl(iconCode);
      img.alt = '';
      img.onerror = () => img.remove();
      head.appendChild(img);
    }
    const name = document.createElement('div');
    name.className = 'npc-name';
    name.textContent = data.npcName;
    head.appendChild(name);
    root.appendChild(head);

    const text = document.createElement('div');
    text.className = 'npc-text';
    text.textContent = data.onServiceText || '…';
    root.appendChild(text);

    const views = Object.values(data.npcQuest.list).sort((a, b) => b.state - a.state || a.qid - b.qid);
    if (views.length > 0) {
      const list = document.createElement('div');
      list.className = 'npc-quests';
      for (const v of views) {
        const row = document.createElement('button');
        row.className = `npc-quest s${v.state}`;
        row.textContent = v.data.name + (QUEST_SUFFIX[v.state] ?? '');
        row.onclick = () => onQuest(v);
        list.appendChild(row);
      }
      root.appendChild(list);
    }

    const actions = document.createElement('div');
    actions.className = 'npc-actions';
    const label = FUNC_LABELS[data.npcType];
    if (data.npcType > 0 && label) {
      const fn = document.createElement('button');
      fn.textContent = label;
      fn.onclick = () => toast('Tính năng đang phát triển');
      actions.appendChild(fn);
    }
    const closeBtn = document.createElement('button');
    closeBtn.className = 'secondary';
    closeBtn.textContent = 'Rời khỏi';
    closeBtn.onclick = () => this.close();
    actions.appendChild(closeBtn);
    root.appendChild(actions);

    document.getElementById('ui')!.appendChild(root);
    this.root = root;
    this.current = data.npcId;
  }

  close(): void {
    this.root?.remove();
    this.root = null;
    this.current = null;
  }
}
