// Mê Trận event popup (Flash MazeDiscPanel, MAZE_DISC_PANEL_U / MAZE_DISC_U): "Tên: <event>", "Hiệu quả: <text>", Xác nhận and (except
// events 4, 5, 7, 8, 9) Bỏ qua. Closing the window leaves the event pending: the event NPC reopens it.

import { MAZE_EVENT_NAME, MAZE_EVENT_TEXT, mazeCanSkip } from '@mc/shared';
import { button, el, openActWindow, type ActWindow } from '../actWindow';
import './maze.css';

export class MazeDiscPanel {
  private win: ActWindow | null = null;

  constructor(private readonly onPick: (confirm: boolean) => void) {}

  show(type: number): void {
    this.close();
    const win = openActWindow('Mê Trận', 'mz-disc', () => this.close());
    this.win = win;
    const pick = (confirm: boolean): void => {
      this.close();
      this.onPick(confirm);
    };
    const row = el('mz-row');
    row.append(button('Xác nhận', () => pick(true)));
    if (mazeCanSkip(type)) row.append(button('Bỏ qua', () => pick(false)));
    win.body.append(el('mz-line', `Tên: ${MAZE_EVENT_NAME[type] ?? type}`), el('mz-reward', `Hiệu quả: ${MAZE_EVENT_TEXT[type] ?? ''}`), row);
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }
}
