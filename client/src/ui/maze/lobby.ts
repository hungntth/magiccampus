// Mê Trận lobby window (Flash MazePanel, MAZE_PANEL_U): the chest level (5 colours + reward text), the paid re-roll (5 vàng,
// confirmed; success / failure toast decided from the old and new level like the Flash client), entries left and Vào. Level < 120
// is refused client-side. getMazePreDate is idempotent; refreshMaze / enterMaze are plain calls.

import { MAZE_CHESTS, MAZE_MAX_CHEST, MAZE_MIN_LEVEL, mazeRefreshResult, type MazePreData } from '@mc/shared';
import type { GameClient } from '../../net/client';
import { button, el, openActWindow, type ActWindow } from '../actWindow';
import { askConfirm } from '../confirmDialog';
import { toast } from '../screens';
import './maze.css';

const RULES = [
  '1. Người chơi cấp 120 trở lên mỗi ngày nhận 1 lần bảo rương. Người chưa chuyển sinh sẽ nhận được kinh nghiệm. Người chuyển sinh nhận được Công Trạng và phần thưởng.',
  '2. Cấp độ bảo rương càng cao thì phần thưởng bên trong càng lớn. Nếu cảm thấy không hài lòng về phần thưởng có thể Làm Mới để đổi lại, mỗi lần làm mới cần 5 vàng. Có xác suất thất bại nhưng cấp độ bảo rương không giảm!',
  '3. Nhấp chọn Bắt đầu để vào Mê Trận. Chỉ khi chiến thắng đến Điểm Cuối mới nhận được Bảo Rương.',
];

export class MazeLobby {
  private win: ActWindow | null = null;
  private data: MazePreData['preData'] | null = null;
  private busy = false;

  constructor(private readonly client: GameClient, private readonly level: () => number, private readonly onEntered: () => void) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  toggle(): void {
    if (this.win) this.close();
    else void this.open();
  }

  async open(): Promise<void> {
    if (this.win) return;
    if (this.level() < MAZE_MIN_LEVEL) return toast('Cấp độ không đủ, cần cấp 120 mới có thể vào Mê Trận', true);
    this.win = openActWindow('Mê Trận', 'mz-lobby', () => this.close());
    try {
      this.data = (await this.client.call<MazePreData>('getMazePreDate')).preData;
      this.render();
    } catch (e) {
      toast((e as Error).message, true);
      this.close();
    }
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  private render(): void {
    const d = this.data;
    if (!this.win || !d) return;
    const chest = MAZE_CHESTS[Math.max(1, Math.min(MAZE_MAX_CHEST, d.level)) - 1];
    const name = el('mz-chest-name', `Cấp độ bảo rương: ${chest.name}`);
    name.style.color = chest.color;
    const row = el('mz-row');
    const spent = d.enterNumRemain <= 0;
    row.append(
      button('Làm mới', () => this.refresh(), 'act-btn', spent || this.busy),
      button('Vào', () => this.enter(), 'act-btn', spent || this.busy),
    );
    this.win.body.replaceChildren(
      name, el('mz-reward', chest.reward),
      el('mz-line', `Tiêu hao ${d.cost} vàng để làm mới 1 lần`), el('mz-line', `Làm mới miễn phí: ${d.refreshNumFree} lần`),
      el('mz-line', `Mê Trận còn lại: ${d.enterNumRemain} lần`), row,
      el('mz-rules', RULES.join('\n')),
    );
  }

  private refresh(): void {
    const d = this.data;
    if (!d) return;
    if (d.level >= MAZE_MAX_CHEST) return toast('Đã đạt cấp cao nhất, không thể làm mới', true);
    const go = (): void => {
      this.busy = true;
      this.client.call<MazePreData>('refreshMaze').then((r) => {
        toast(mazeRefreshResult(d.level, r.preData.level));
        this.data = r.preData;
      }).catch((e) => toast((e as Error).message, true)).finally(() => {
        this.busy = false;
        this.render();
      });
    };
    if (d.refreshNumFree > 0) go();
    else askConfirm(`Tiêu hao ${d.cost} vàng để làm mới cấp độ bảo rương, xác nhận tiếp tục?`, go);
  }

  private enter(): void {
    this.busy = true;
    this.client.call<boolean>('enterMaze').then((ok) => {
      if (!ok) return;
      this.close();
      this.onEntered();
    }).catch((e) => toast((e as Error).message, true)).finally(() => {
      this.busy = false;
      this.render();
    });
  }
}
