// On-screen quest tracker (legacy QuestGuide.as): active quests by take date, one progress line per requirement
// (kills from questKill, items from the bag) and a "• Tìm[NPC]" link when the quest can be turned in. Plain CSS
// look of the Flash guide (outlined text, no panel); × folds the list. Dragged by its title row; the position is remembered.

import { progressText, type ChaQuest, type RequireProgress } from '@mc/shared';
import { makeDraggable } from './panelBehavior';

// QUESTGUIDE_S prefixes by quest type (used by the quest panel title).
export const TYPE_PREFIX: Record<number, string> = {
  1: '[Tân Thủ]', 2: '[Chính]', 3: '[Gia Tộc]', 4: '[Phụ]', 9: '[Treo Thưởng]', 10: '[Trưởng Thành]',
};

export class QuestTracker {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly offDrag: () => void;

  constructor(
    parent: HTMLElement,
    private readonly onOpen: (q: ChaQuest) => void,
    private readonly onFind: (q: ChaQuest) => void,
    private readonly progressOf: (q: ChaQuest) => { lines: RequireProgress[]; finishable: boolean },
  ) {
    this.root = el('div', 'quest-tracker');
    const head = el('div', 'qt-head');
    head.appendChild(el('span', 'qt-title', 'Nhiệm vụ'));
    const fold = el('button', 'qt-fold', '×');
    fold.title = 'Thu gọn';
    fold.onclick = () => {
      this.list.hidden = !this.list.hidden;
      fold.textContent = this.list.hidden ? '+' : '×';
      fold.title = this.list.hidden ? 'Mở rộng' : 'Thu gọn';
    };
    head.appendChild(fold);
    this.list = el('div', 'qt-list');
    this.root.append(head, this.list);
    this.root.hidden = true;
    parent.appendChild(this.root);
    this.offDrag = makeDraggable(this.root, head, 'questTracker');
  }

  render(quests: Iterable<ChaQuest>): void {
    const sorted = [...quests].sort((a, b) => b.takeDate - a.takeDate);
    this.list.replaceChildren();
    for (const q of sorted) {
      const progress = this.progressOf(q);
      const item = el('div', 'qt-item');
      // Flash guide: a quest that can be turned in is white, one still in progress is red.
      const name = el('a', `qt-name${progress.finishable ? ' ready' : ''}`, q.data.name);
      name.title = `${TYPE_PREFIX[q.data.type] ?? ''} ${q.data.name}`.trim();
      name.onclick = () => this.onOpen(q);
      item.appendChild(name);
      if (progress.finishable && q.fName) {
        const find = el('a', 'qt-line qt-find');
        find.append('Tìm', el('span', 'qt-npc', `[${q.fName}]`));
        find.onclick = () => this.onFind(q);
        item.appendChild(find);
      } else {
        for (const line of progress.lines) {
          const row = el('div', `qt-line${line.done ? ' done' : ''}`);
          row.append(el('span', 'qt-target', `${line.kind === 2 ? 'Tiêu diệt ' : ''}${line.name}`), ` ${progressText(line)}`);
          item.appendChild(row);
        }
      }
      this.list.appendChild(item);
    }
    this.root.hidden = sorted.length === 0;
  }

  destroy(): void {
    this.offDrag();
    this.root.remove();
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
