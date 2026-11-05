// Mall flow: the HUD "Shop" button toggles the mall window (getSystemShop once per open), buying calls
// buySystemItemClient (fire-and-forget like Flash: results and failures arrive as onBlueMsg / onRedMsg pushes handled by BagController);
// the trolley (panel.cart) buys with buySystemItemMulti and awaits its {success, items} reply.

import type { BuySystemItemMultiReply, OpenMall, PlayerData } from '@mc/shared';
import type { GameClient } from '../net/client';
import { MallPanel } from '../ui/mallPanel';
import { toast } from '../ui/screens';
import type { BagController } from './BagController';

export class MallController {
  private readonly panel = new MallPanel();
  private opening = false;
  private readonly offs: (() => void)[];

  constructor(private readonly client: GameClient, private readonly bag: BagController, private readonly player: PlayerData) {
    this.panel.onBuy = (slotId, amount) => {
      void this.client.call('buySystemItemClient', slotId, amount).catch(() => undefined);
    };
    this.panel.cart.onBuy = (list) => this.client.call<BuySystemItemMultiReply>('buySystemItemMulti', list);
    this.panel.cart.goldType = () => this.bag.payment.prefs().selectedGoldType;
    // Wallet column: the player object is updated by QuestController's onUPP handler first.
    this.offs = [client.on('onUPP', () => this.panel.refreshWallet()), client.on('onAddMoney', () => this.panel.refreshWallet())];
  }

  /** HUD Shop button. */
  async toggle(): Promise<void> {
    if (this.panel.isOpen) return this.panel.close();
    if (this.opening) return;
    this.opening = true;
    try {
      const mall = await this.client.call<OpenMall>('getSystemShop');
      this.panel.show(mall, this.bag.payment, () => this.player);
      this.bag.showBesideShop();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      this.opening = false;
    }
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.panel.close();
  }
}
