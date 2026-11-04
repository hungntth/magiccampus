// The defeat follow-up of a battle (legacy reliveSwitch / freeRelive): after battlePlayEnd a dead character asks the server how it
// may revive and, when it has the choice (result 2), shows the "revive here / safe zone" dialog. `reviving` keeps the map locked.

import type { ReliveSwitchResult } from '@mc/shared';
import type { GameClient } from '../../net/client';
import { showReviveDialog } from '../../ui/reviveDialog';
import { toast } from '../../ui/screens';

export class ReviveFlow {
  reviving = false;
  private close: (() => void) | null = null;

  constructor(private readonly client: () => GameClient) {}

  /** reliveSwitch, then the dialog when the server leaves the choice to the player. */
  async run(): Promise<void> {
    this.reviving = true;
    try {
      const res = await this.client().call<ReliveSwitchResult>('reliveSwitch');
      if (res !== 2) {
        this.reviving = false;
        return;
      }
      this.close = showReviveDialog({ onHere: () => this.relive(1), onSafe: () => this.relive(2) });
    } catch (e) {
      this.reviving = false;
      toast((e as Error).message, true);
    }
  }

  destroy(): void {
    this.close?.();
  }

  private relive(mode: 1 | 2): void {
    this.close = null;
    void this.client()
      .call('freeRelive', mode)
      .catch((e) => toast((e as Error).message, true))
      .finally(() => {
        this.reviving = false;
      });
  }
}
