// Quest detail panel (DOM, in #ui): NPC portrait/name (or "Hệ thống"), story text, requirements, NPCs,
// rewards and the "Nhận" / "Xong" / "Bỏ" buttons (legacy QuestPanel.as / QuestCanvas.as).

import { QuestState, QuestType, type QuestView } from '@mc/shared';
import { iconUrl } from '../assets';

export interface QuestPanelOpts {
  npcId: number | null; // NPC the panel was opened at; null = from the tracker
  npcName: string;
  iconCode: string;
  onTake: () => void;
  onFinish: () => void;
  onCancel: () => void;
}

export class QuestPanel {
  private root: HTMLElement | null = null;
  private qid: number | null = null;

  get questId(): number | null {
    return this.qid;
  }

  show(view: QuestView, opts: QuestPanelOpts): void {
    this.close();
    const root = el('div', 'quest-panel');
    root.appendChild(el('h3', '', 'Nhiệm vụ'));

    const head = el('div', 'npc-head');
    if (opts.npcId !== null && opts.iconCode && opts.iconCode !== '0') {
      const img = document.createElement('img');
      img.src = iconUrl(opts.iconCode);
      img.alt = '';
      img.onerror = () => img.remove();
      head.appendChild(img);
    }
    head.appendChild(el('div', 'npc-name', opts.npcId !== null ? opts.npcName : 'Hệ thống'));
    root.appendChild(head);

    const body = el('div', 'quest-body');
    body.appendChild(el('div', 'quest-title', view.data.name));
    if (view.data.startText) body.appendChild(el('div', 'quest-text', view.data.startText));
    if (view.data.info) body.appendChild(el('div', 'quest-info', view.data.info));
    if (view.require.length > 0) {
      body.appendChild(el('div', 'quest-label', 'Yêu cầu nhiệm vụ:'));
      const met = view.state === QuestState.CAN_FINISH;
      for (const r of view.require) {
        body.appendChild(el('div', 'quest-line', `${r.name} (${met ? r.num : 0}/${r.num})`));
      }
    }
    if (view.sName) body.appendChild(el('div', 'quest-line', `NPC nhận nhiệm vụ: ${view.sName}`));
    if (view.fName) body.appendChild(el('div', 'quest-line', `NPC trả nhiệm vụ: ${view.fName}`));
    const rewards: string[] = [];
    if (view.data.awardExp > 0) rewards.push(`Exp ${view.data.awardExp}`);
    if (view.data.moneyNum > 0) rewards.push(`Tiền ${view.data.moneyNum}`);
    if (rewards.length > 0) {
      body.appendChild(el('div', 'quest-label', 'Phần thưởng:'));
      body.appendChild(el('div', 'quest-line', rewards.join(' · ')));
    }
    root.appendChild(body);

    const actions = el('div', 'npc-actions');
    if (view.state === QuestState.CAN_TAKE) {
      actions.appendChild(button('Nhận', opts.onTake));
    } else if (view.state === QuestState.TAKEN || view.state === QuestState.CAN_FINISH) {
      const atFinish = view.data.finishNpc <= 0 || opts.npcId === view.data.finishNpc;
      if (atFinish) {
        const done = button('Xong', opts.onFinish);
        done.disabled = view.state !== QuestState.CAN_FINISH;
        actions.appendChild(done);
      }
      const give = button('Bỏ', opts.onCancel, 'secondary');
      give.disabled = view.data.type === QuestType.NEWHAND;
      actions.appendChild(give);
    }
    actions.appendChild(button('Đóng', () => this.close(), 'secondary'));
    root.appendChild(actions);

    document.getElementById('ui')!.appendChild(root);
    this.root = root;
    this.qid = view.qid;
  }

  close(): void {
    this.root?.remove();
    this.root = null;
    this.qid = null;
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  if (className) b.className = className;
  b.onclick = onClick;
  return b;
}
