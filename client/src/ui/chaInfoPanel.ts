// "Thông tin" window for another player (showChaInfo): read-only equipment grid (same layout as the own character
// panel) plus final stats. One window at a time; a new showChaInfo replaces it.

import { EQUIP_SLOT_COUNT, type BagItem, type ChaInfo, type CharProperty } from '@mc/shared';
import { fillItemCell, itemTooltip } from './itemCell';
import { EQUIP_SLOTS, LOCKED_EQUIP_SLOTS } from './characterPanel';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import './social.css';

const el = (tag: 'div' | 'button' | 'span', cls: string, text?: string): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class ChaInfoPanel {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];

  /** `viewerLevel` only colours the "level too low" tooltip lines. */
  show(info: ChaInfo, viewerLevel: number): void {
    this.close();
    const root = el('div', 'char-panel cha-info');
    const header = el('div', 'char-header');
    header.appendChild(el('div', 'char-title', 'Thông tin'));
    root.appendChild(header);
    const x = el('button', 'char-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.close();
    root.appendChild(x);

    const equip = el('div', 'char-equip');
    const byPos = new Map<number, BagItem>(info.equiptList.map((it) => [it.sid, it]));
    for (let sid = 1; sid <= EQUIP_SLOT_COUNT; sid++) {
      const [label, sx, sy] = EQUIP_SLOTS[sid];
      const cell = el('div', `char-slot${LOCKED_EQUIP_SLOTS.has(sid) ? ' locked' : ''}`);
      cell.style.left = `${sx}px`;
      cell.style.top = `${sy}px`;
      cell.title = label;
      const item = byPos.get(sid);
      if (item) {
        // View-only: no drag payload (it would point at the other player's item ids) and no equip tooltip hint.
        const tip = itemTooltip(item, viewerLevel, false).split('\n').filter((l) => !l.startsWith('Nhấp đôi')).join('\n');
        fillItemCell(cell, item, tip, 'equip');
        cell.draggable = false;
        cell.ondragstart = null;
        cell.ondragend = null;
      }
      equip.appendChild(cell);
    }
    root.appendChild(equip);

    const stats = el('div', 'char-stats');
    stats.appendChild(el('div', 'char-name', `${info.name}  Cấp ${info.level}`));
    for (const [label, value] of statRows(info.property)) stats.appendChild(row(label, value));
    root.appendChild(stats);

    stageEl().appendChild(root);
    this.root = root;
    this.offs = [makeDraggable(root, header), closeOnEscape(() => this.close())];
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
  }
}

function statRows(p: CharProperty): [string, string][] {
  const n = (v: number): string => String(Math.round(v));
  return [
    ['HP', n(p.finalHp)], ['MP', n(p.finalMp)],
    ['Công vật lý', n(p.finalAttack)], ['Công ma pháp', n(p.finalMAttack)],
    ['Thủ vật lý', n(p.finalDefence)], ['Thủ ma pháp', n(p.finalMDefence)],
    ['Chính xác', n(p.finalHit)], ['Bạo kích', n(p.finalCritical)],
    ['Né tránh', n(p.finalDodge)], ['Tốc độ', n(p.finalSpeed)],
    ['Lực', n(p.finalStrength)], ['Xảo', n(p.finalAgility)], ['Nhẫn', n(p.finalStamina)],
    ['Trí', n(p.finalIntelligence)], ['Thần', n(p.finalEnergy)],
  ];
}

function row(label: string, value: string): HTMLElement {
  const r = el('div', 'char-row');
  r.append(el('span', 'char-label', label), el('span', 'char-value', value));
  return r;
}
