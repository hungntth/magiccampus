// The defeat follow-up (legacy BattleStage.onReliveSwitch, M9 phase D): after battlePlayEnd a dead character asks reliveSwitch for
// the map mode and gets its dialog: 1 Hình Nhân (reliveUseItem, the 18-gold confirm without a doll) / Về (toSafe); 2 free
// (freeRelive 1|2); 3 gold (bbGoldRelive / bbNormalRelive). Dead walking opens PLAYER_S[0]. `reviving` keeps the map locked.

import {
  bbGoldPrice, BB_RELIVE_SECONDS, DOLL_RELIVE_SECONDS, DOLL_TID, RELIVE_TEXT, ReliveMode, type BagItem, type ReliveSwitchResult,
} from '@mc/shared';
import type { GameClient } from '../../net/client';
import { askConfirm } from '../../ui/confirmDialog';
import { FREE_TEXT, plain, showTimedDialog } from '../../ui/reviveDialog';
import { toast } from '../../ui/screens';

export class ReviveFlow {
  reviving = false;
  private close: (() => void) | null = null;

  constructor(private readonly client: () => GameClient, private readonly bag: () => BagItem[] = () => []) {}

  /** reliveSwitch, then the mode's dialog. */
  async run(): Promise<void> {
    this.reviving = true;
    try {
      const mode = await this.client().call<ReliveSwitchResult>('reliveSwitch');
      if (mode === ReliveMode.FREE) this.free();
      else if (mode === ReliveMode.DOLL) this.doll();
      else if (mode === ReliveMode.GOLD) this.gold();
      else this.reviving = false;
    } catch (e) {
      this.reviving = false;
      toast((e as Error).message, true);
    }
  }

  /** Click-to-move while dead (Player.as:2452): OK = doll / gold, Cancel = toSafe. */
  deadWalk(): void {
    if (this.reviving) return;
    this.reviving = true;
    askConfirm(RELIVE_TEXT.DEAD_WALK, () => this.send('reliveUseItem'), () => this.send('toSafe'));
  }

  destroy(): void {
    this.close?.();
  }

  private free(): void {
    this.close = showTimedDialog({
      seconds: DOLL_RELIVE_SECONDS, okLabel: 'OK', backLabel: 'Về',
      render: (left) => ({ text: FREE_TEXT, count: `(${left} sau sẽ về thành)` }), // the stray ")" is in the original
      onOk: () => this.send('freeRelive', 1),
      onBack: () => this.send('freeRelive', 2),
    });
  }

  private doll(): void {
    this.close = showTimedDialog({
      seconds: DOLL_RELIVE_SECONDS, okLabel: 'OK', backLabel: 'Về',
      render: (left) => ({ text: RELIVE_TEXT.DOLL, count: `(${RELIVE_TEXT.DOLL_TIMER.replace('{resTime}', String(left))}` }),
      onOk: () => {
        if (this.bag().some((b) => b.tid === DOLL_TID && b.stackNum > 0)) return this.send('reliveUseItem');
        askConfirm(RELIVE_TEXT.BUY_DOLL, () => this.send('reliveUseItem'), () => this.send('toSafe'));
      },
      onBack: () => this.send('toSafe'),
    });
  }

  private gold(): void {
    this.close = showTimedDialog({
      seconds: BB_RELIVE_SECONDS, okLabel: 'OK', backLabel: 'Hủy',
      render: (left) => ({ text: plain(RELIVE_TEXT.GOLD.replace('{gold}', String(bbGoldPrice(left))).replace('{time}', String(left))), count: '' }),
      onOk: (left) => this.send('bbGoldRelive', bbGoldPrice(left)),
      onBack: () => this.send('bbNormalRelive'),
    });
  }

  private send(method: string, ...args: unknown[]): void {
    this.close = null;
    void this.client()
      .call(method, ...args)
      .catch((e) => toast((e as Error).message, true))
      .finally(() => {
        this.reviving = false;
      });
  }
}
