// Mê Trận on the client (activity strip id 27): owns the lobby window, the in-maze HUD and the event / shop / lottery / quiz windows.
// Pushes: updateMazeInfoData (full state), upMazeBuff, showMazeDiscPanel, showMazeQuestionPanel, showMazeShopPanel, showMazeLotteryPanel,
// leaveMaze. After every fight inside the maze GameScene calls onBattleEnd(): "recover full HP?" -> mazeRecover({recover}).
// The maze rooms are normal scene reloads (onSceneEnter) whose gate NPCs come from createNpcs (GameScene / InstanceNpcs).

import type { MazeLotteryPanel, MazeQuestionPanel, MazeState } from '@mc/shared';
import type { GameClient } from '../net/client';
import { button, el, openActWindow, type ActWindow } from '../ui/actWindow';
import { askConfirm } from '../ui/confirmDialog';
import { toast } from '../ui/screens';
import { MazeDiscPanel } from '../ui/maze/discPanel';
import { MazeHud } from '../ui/maze/hud';
import { MazeLobby } from '../ui/maze/lobby';
import { MazeLotteryWindow } from '../ui/maze/lotteryPanel';
import { applyFull, applyPartial, emptyView, type MazeView } from '../ui/maze/mazeLogic';
import { MazeQuestionWindow } from '../ui/maze/questionPanel';
import { MazeShopPanel } from '../ui/maze/shopPanel';

const RULES = [
  'Quy Tắc:',
  '1. Chỉ khi chiến thắng đến Điểm Cuối mới nhận được Bảo Rương. Mỗi lần qua 1 ô xanh dương thì sẽ được tự do chọn các ô xung quanh để di chuyển (tham khảo bản đồ nhỏ).',
  '2. Mỗi ô sẽ có sự kiện tương ứng, phải hoàn thành mới có thể tiếp tục đi và nhận thưởng (có thể chọn "Bỏ qua" nhưng không nhận phần thưởng).',
  '3. Mỗi lần di chuyển mất 1 Lực Hành Động, mặc định có 25. Khi Lực Hành Động là 0 thì xem như thất bại, không nhận Phần Thưởng Cuối.',
  '4. Độ khó quái vật: Quái Vật Làm Loạn < Tiểu Đội Tinh Anh < Mật Lâm Ngộ Tập < BOSS Khiêu Chiến. Thất bại không bị trừng phạt tử vong nhưng HP giảm 20% (có 3 lần hồi phục miễn phí).',
  '5. Trong Mê Trận không thể mở túi. Nếu rớt mạng, đăng nhập lại và vào Mê Trận để tiếp tục.',
].join('\n');

export class MazeController {
  private readonly offs: (() => void)[] = [];
  private readonly lobby: MazeLobby;
  private readonly hud: MazeHud;
  private readonly disc: MazeDiscPanel;
  private readonly shop: MazeShopPanel;
  private readonly lottery: MazeLotteryWindow;
  private readonly question: MazeQuestionWindow;
  private rules: ActWindow | null = null;
  private view: MazeView = emptyView();
  private inMaze = false;

  constructor(private readonly client: GameClient, level: () => number) {
    this.lobby = new MazeLobby(client, level, () => void this.refreshState());
    this.hud = new MazeHud({
      buySkip: () => this.state('mazeBuySkipNum'), buyRecover: () => this.state('mazeBuyRecoverNum'),
      leave: () => void client.call('mazeLeave').catch(fail), help: () => this.showRules(),
    });
    this.disc = new MazeDiscPanel((confirm) => this.state(confirm ? 'mazeConfirm' : 'mazeSkip'));
    this.shop = new MazeShopPanel(client);
    this.lottery = new MazeLotteryWindow(client);
    this.question = new MazeQuestionWindow(client);
    this.offs.push(
      client.on('updateMazeInfoData', (d) => this.onFull(d as MazeState)),
      client.on('upMazeBuff', (d) => this.onBuff(d as Record<string, number> | null)),
      client.on('showMazeDiscPanel', (d) => this.disc.show(Number((d as { type?: unknown } | null)?.type))),
      client.on('showMazeQuestionPanel', (d) => this.question.show(d as MazeQuestionPanel)),
      client.on('showMazeShopPanel', () => void this.shop.show()),
      client.on('showMazeLotteryPanel', (d) => this.lottery.show(d as MazeLotteryPanel)),
      client.on('leaveMaze', () => this.leave()),
    );
  }

  /** Strip icon 27. */
  toggleLobby(): void {
    this.lobby.toggle();
  }

  /** BattleController end hook (battlePlayEnd done): inside the maze ask for the full-HP recover, always false (generic toast stays). */
  onBattleEnd(): boolean {
    if (!this.inMaze) return false;
    const send = (recover: boolean): void => void this.client.call('mazeRecover', { recover }).catch(fail);
    askConfirm('Xác nhận hồi phục toàn bộ HP?', () => send(true), () => send(false));
    return false;
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.leave();
    this.lobby.close();
  }

  private async refreshState(): Promise<void> {
    try {
      const s = await this.client.call<MazeState>('getMazeData');
      if (s.currentIndex !== undefined) this.onFull(s);
    } catch (e) {
      fail(e);
    }
  }

  private onFull(d: MazeState): void {
    this.inMaze = true;
    this.view = applyFull(this.view, d);
    this.hud.set(this.view);
  }

  private onBuff(d: Record<string, number> | null): void {
    this.view = { ...this.view, buffs: Object.values(d ?? {}).map(Number).filter((n) => n > 0).slice(0, 4) };
    if (this.hud.visible) this.hud.set(this.view);
  }

  /** mazeConfirm / mazeSkip / buy replies: the partial state update. */
  private state(method: string): void {
    this.client.call<MazeState>(method).then((s) => {
      this.view = applyPartial(this.view, s);
      if (this.hud.visible) this.hud.set(this.view);
    }).catch(fail);
  }

  private leave(): void {
    this.inMaze = false;
    this.view = emptyView();
    this.hud.hide();
    this.disc.close();
    this.shop.close();
    this.lottery.close();
    this.question.close();
  }

  private showRules(): void {
    if (this.rules) return;
    const win = openActWindow('Cách Chơi', 'mz-lobby', () => this.closeRules());
    win.body.append(el('mz-reward', RULES), button('Đóng', () => this.closeRules()));
    this.rules = win;
  }

  private closeRules(): void {
    this.rules?.dispose();
    this.rules = null;
  }
}

const fail = (e: unknown): void => toast((e as Error).message, true);
