// Mê Trận in-maze HUD (Flash MazeInfoPanel, MAZE_INFO_PANEL_U strings): the 6 x 9 minimap (start flag, end, visited blue, current
// yellow), the three counters, the goddess buffs (display only), buy-skip / buy-recover (5 vàng, confirmed) and leave (confirmed).
// Pure DOM; MazeController feeds it the view and owns the RPCs.

import { MAZE_COLS, MAZE_END_CELL, MAZE_CELLS } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { stageEl } from '../stage';
import { cellKind, type MazeView } from './mazeLogic';
import './maze.css';

export interface MazeHudActions {
  buySkip(): void;
  buyRecover(): void;
  leave(): void;
  help(): void;
}

const el = (cls: string, text = '', tag = 'div'): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export class MazeHud {
  private root: HTMLElement | null = null;
  private view: MazeView | null = null;

  constructor(private readonly act: MazeHudActions) {}

  get visible(): boolean {
    return this.root !== null;
  }

  set(view: MazeView): void {
    this.view = view;
    this.render();
  }

  hide(): void {
    this.root?.remove();
    this.root = null;
  }

  private btn(label: string, onClick: () => void): HTMLButtonElement {
    const b = el('mz-btn', label, 'button') as HTMLButtonElement;
    b.onclick = onClick;
    return b;
  }

  private render(): void {
    const v = this.view;
    if (!v) return;
    if (!this.root) {
      this.root = el('mz-hud');
      stageEl().appendChild(this.root);
    }
    const head = el('mz-head');
    head.append(el('mz-title', 'Mê Trận'), this.btn('H.Dẫn', () => this.act.help()));
    const grid = el('mz-grid');
    grid.style.gridTemplateColumns = `repeat(${MAZE_COLS}, 1fr)`;
    for (let i = 0; i < MAZE_CELLS; i++) {
      const c = el(`mz-cell ${cellKind(v, i)}`);
      c.title = i === 0 ? 'Điểm Đầu' : i === MAZE_END_CELL ? 'Điểm Cuối' : `Ô ${i + 1}`;
      grid.appendChild(c);
    }
    const stats = el('mz-stats');
    stats.append(el('mz-line', `Số lần hành động: ${v.actNum}`), el('mz-line', `Bỏ qua: ${v.skipNum}`), el('mz-line', `Hồi phục: ${v.recoverNum}`));
    const buffs = el('mz-buffs');
    buffs.append(el('mz-line', v.buffs.length ? `Nữ Thần May Mắn: ${v.buffs.length}/4` : 'Chưa có buff'));
    const row = el('mz-row');
    row.append(
      this.btn('Tăng 1 lần Bỏ qua', () => askConfirm('Xác nhận tiêu hao 5 vàng tăng 1 lần Bỏ qua?', () => this.act.buySkip())),
      this.btn('Tăng 1 lần Hồi phục', () => askConfirm('Xác nhận tiêu hao 5 vàng tăng 1 lần Hồi phục?', () => this.act.buyRecover())),
      this.btn('Rời Mê Trận', () => askConfirm('Xác nhận rời khỏi Mê Trận?', () => this.act.leave())),
    );
    this.root.replaceChildren(head, grid, stats, buffs, row);
  }
}
