// Payment preference of the player (legacy changeMoneyType radios: 1 Ngân phiếu / 2 Bạc, 3 Kim phiếu / 4 Vàng).
// select() is awaited like the Flash Responder: the radios stay disabled until the reply, then the player data is updated.

import { applyMoneyType, DEFAULT_PAYMENT } from '@mc/shared';
import type { ChangeMoneyTypeReply, PaymentPrefs, PlayerData } from '@mc/shared';
import type { GameClient } from '../net/client';
import { toast } from '../ui/screens';

export class PaymentControl {
  private readonly subs = new Set<() => void>();
  private busy = false;

  constructor(private readonly client: GameClient, private readonly player: () => PlayerData) {}

  prefs(): PaymentPrefs {
    const p = this.player();
    return {
      selectedMoneyType: p.selectedMoneyType ?? DEFAULT_PAYMENT.selectedMoneyType,
      selectedGoldType: p.selectedGoldType ?? DEFAULT_PAYMENT.selectedGoldType,
    };
  }

  /** True while a changeMoneyType call is in flight. */
  get pending(): boolean {
    return this.busy;
  }

  async select(type: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.emit();
    try {
      const r = await this.client.call<ChangeMoneyTypeReply>('changeMoneyType', type);
      const next = r.flag ? applyMoneyType(this.prefs(), r.num) : null;
      if (next) Object.assign(this.player(), next);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  private emit(): void {
    for (const fn of this.subs) fn();
  }
}
