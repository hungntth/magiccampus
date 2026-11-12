// Ấn Thạch (stone seal) client flow: owns the window and every stone seal RPC (stoneSealGetData, stoneSealSetStone, stoneSealRemoveStone,
// stoneSealRemoveAllStone, stoneSealSwapStone, stoneSealBore, stoneSealSuccinct). Every reply carries {flag, data, view}: the view replaces the model
// even when flag is false (the refusal text already came through onSystemMidMsgOrNote). onUPP / bag slot pushes redraw the open window.

import type { BagItem, PlayerData, StoneSealEquipView, StoneSealReply } from '@mc/shared';
import type { GameClient } from '../net/client';
import type { FeatureWindow } from '../ui/feature/featureWindow';
import { createStoneSealWindow } from '../ui/stoneseal/stonesealWindow';
import { newStoneSealState, type StoneSealActions, type StoneSealUiHost } from '../ui/stoneseal/stonesealTypes';

export interface StoneSealControllerHost {
  client: GameClient;
  player: PlayerData;
  /** Bag + worn items (stones and Kim Cương come from here). */
  items(): BagItem[];
}

export class StoneSealController {
  private views: StoneSealEquipView[] = [];
  private busy = false;
  private readonly state = newStoneSealState();
  private readonly ui: StoneSealUiHost;
  private readonly win: FeatureWindow;
  private readonly offs: (() => void)[] = [];

  constructor(protected readonly host: StoneSealControllerHost) {
    this.ui = {
      views: () => this.views,
      items: () => this.host.items(),
      gold: () => this.host.player.gold ?? 0,
      dust: () => this.host.player.currencies?.stoneSealPoint ?? 0,
      state: this.state,
      actions: this.actions(),
    };
    this.win = createStoneSealWindow(() => this.ui, () => this.close());
    const redraw = (): void => this.win.render();
    this.offs.push(host.client.on('onUPP', redraw), host.client.on('onAddCharactorSlot', redraw), host.client.on('onDelCharactorSlot', redraw));
  }

  toggle(): void {
    if (this.win.isOpen) this.close();
    else void this.open();
  }

  private async open(): Promise<void> {
    const r = await this.call('stoneSealGetData');
    if (!r || this.win.isOpen) return;
    this.state.pick = 0;
    this.state.marks = [];
    this.state.dialog = null;
    this.win.show();
  }

  private close(): void {
    this.win.close();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.close();
  }

  /** One RPC at a time; the reply (even a refusal) replaces the model. */
  private async call(method: string, ...args: unknown[]): Promise<StoneSealReply | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      const r = await this.host.client.call<StoneSealReply>(method, ...args);
      if (r.view) this.views = r.view;
      return r;
    } catch {
      return null;
    } finally {
      this.busy = false;
    }
  }

  private run(method: string, ...args: unknown[]): void {
    void this.call(method, ...args).then(() => this.win.render());
  }

  private actions(): StoneSealActions {
    const sid = (): number => this.state.sid;
    return {
      setStone: (idx, itemId) => this.run('stoneSealSetStone', sid(), idx, itemId, 0),
      removeStone: (idx) => this.run('stoneSealRemoveStone', sid(), idx),
      removeAll: () => this.run('stoneSealRemoveAllStone', sid()),
      swap: (i, j) => this.run('stoneSealSwapStone', sid(), i, j),
      bore: (idx, payMode, diamondId) => this.run('stoneSealBore', sid(), idx, payMode, diamondId),
      succinct: (payMode) => this.run('stoneSealSuccinct', sid(), payMode),
      render: () => this.win.render(),
    };
  }
}
