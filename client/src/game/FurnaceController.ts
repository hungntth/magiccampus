// Lò Luyện Thần Bí client flow (strip icon 51): getFurnaceInfo, MysteryExchangeItem({id:true}, md5pass), MysteryExchangeScore({type:count}, md5pass).
// A refusal shows as onSystemMidMsgOrNote and rejects (silent here); after a success the lists are reloaded. md5pass is ignored by the server.

import { FURNACE_TEXT, type FurnaceInfo, type FurnaceReply, type PlayerData } from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { createFurnaceWindow, newFurnaceView, type FurnaceUiHost } from '../ui/furnace/furnacePanel';
import { itemPayload, scorePayload } from '../ui/furnace/furnaceRules';
import type { FeatureWindow } from '../ui/feature/featureWindow';
import { toast } from '../ui/screens';

export interface FurnaceControllerHost {
  client: GameClient;
  player: PlayerData;
}

export class FurnaceController {
  private info: FurnaceInfo | null = null;
  private busy = false;
  private readonly view = newFurnaceView();
  private readonly ui: FurnaceUiHost;
  private readonly win: FeatureWindow;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: FurnaceControllerHost) {
    this.ui = {
      info: () => this.info,
      view: this.view,
      busy: () => this.busy,
      render: () => this.win.render(),
      smeltItems: () => this.smeltItems(),
      smeltScores: () => this.smeltScores(),
    };
    this.win = createFurnaceWindow(() => this.ui, () => this.close());
    this.offs.push(host.client.on('onUPP', () => this.win.render()));
  }

  get isOpen(): boolean {
    return this.win.isOpen;
  }

  toggle(): void {
    if (this.win.isOpen) this.close();
    else void this.open();
  }

  async open(): Promise<void> {
    if (this.win.isOpen) return;
    this.view.selected.clear();
    this.view.counts = {};
    if (!(await this.reload())) return;
    if (!this.win.isOpen) this.win.show(0);
  }

  close(): void {
    this.win.close();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.close();
  }

  private async reload(): Promise<boolean> {
    try {
      this.info = await this.host.client.call<FurnaceInfo>('getFurnaceInfo');
    } catch {
      return false;
    }
    // Drop selections / counts of stacks that no longer exist.
    const ids = new Set(this.info.items.map((r) => r.id));
    for (const id of [...this.view.selected]) if (!ids.has(id)) this.view.selected.delete(id);
    this.win.render();
    return true;
  }

  private smelt(method: string, arg: Record<string, unknown>, onDone: () => void): void {
    this.busy = true;
    this.win.render();
    this.host.client.call<FurnaceReply>(method, arg, '').then(() => {
      onDone();
      return this.reload();
    }).catch(() => undefined).finally(() => {
      this.busy = false;
      this.win.render();
    });
  }

  private smeltItems(): void {
    const info = this.info;
    if (!info || this.busy) return;
    const payload = itemPayload(info.items, this.view.selected);
    if (Object.keys(payload).length === 0) return toast(FURNACE_TEXT.NOTHING, true);
    askConfirm(FURNACE_TEXT.CONFIRM_ITEMS, () => this.smelt('MysteryExchangeItem', payload, () => this.view.selected.clear()));
  }

  private smeltScores(): void {
    const info = this.info;
    if (!info || this.busy) return;
    const payload = scorePayload(info.scores, this.view.counts);
    if (Object.keys(payload).length === 0) return toast(FURNACE_TEXT.NOTHING, true);
    askConfirm(FURNACE_TEXT.CONFIRM_SCORES, () => this.smelt('MysteryExchangeScore', payload, () => (this.view.counts = {})));
  }
}
