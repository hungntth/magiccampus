// On-screen quest tracker (legacy QuestGuide.as): active quests by take date, type prefix, one progress line per
// requirement (kills from questKill, items from the bag) and a "Tìm <NPC>" link when the quest can be turned in.

import { requireLabel, type ChaQuest, type RequireProgress } from '@mc/shared';

// QUESTGUIDE_S prefixes by quest type.
export const TYPE_PREFIX: Record<number, string> = {
  1: '[Tân Thủ]', 2: '[Chính]', 3: '[Gia Tộc]', 4: '[Phụ]', 9: '[Treo Thưởng]', 10: '[Trưởng Thành]',
};

export class QuestTracker {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly onOpen: (q: ChaQuest) => void,
    private readonly onFind: (q: ChaQuest) => void,
    private readonly progressOf: (q: ChaQuest) => { lines: RequireProgress[]; finishable: boolean },
  ) {
    this.root = document.createElement('div');
    this.root.className = 'quest-tracker';
    const title = document.createElement('h4');
    title.textContent = 'Nhiệm vụ';
    this.list = document.createElement('div');
    this.root.append(title, this.list);
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  render(quests: Iterable<ChaQuest>): void {
    const sorted = [...quests].sort((a, b) => b.takeDate - a.takeDate);
    this.list.replaceChildren();
    for (const q of sorted) {
      const item = document.createElement('div');
      item.className = 'qt-item';
      const name = document.createElement('a');
      name.className = 'qt-name';
      name.textContent = `${TYPE_PREFIX[q.data.type] ?? ''} ${q.data.name}`.trim();
      name.onclick = () => this.onOpen(q);
      item.appendChild(name);
      const progress = this.progressOf(q);
      if (progress.finishable && q.fName) {
        const find = document.createElement('a');
        find.className = 'qt-find';
        find.textContent = ` • Tìm ${q.fName}`;
        find.onclick = () => this.onFind(q);
        item.appendChild(find);
      }
      for (const line of progress.lines) {
        const row = document.createElement('div');
        row.className = `qt-req${line.done ? ' done' : ''}`;
        row.textContent = requireLabel(line);
        item.appendChild(row);
      }
      this.list.appendChild(item);
    }
    this.root.hidden = sorted.length === 0;
  }

  destroy(): void {
    this.root.remove();
  }
}
