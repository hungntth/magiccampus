// Mall flow: the HUD "Shop" button toggles the mall window (getSystemShop once per open), buying calls
// buySystemItemClient (fire-and-forget like Flash: results and failures arrive as onBlueMsg / onRedMsg pushes handled by BagController).

import type { OpenMall } from '@mc/shared';
import type { GameClient } from '../net/client';
import { MallPanel } from '../ui/mallPanel';
import { toast } from '../ui/screens';
import type { BagController } from './BagController';

export class MallController {
  private readonly panel = new MallPanel();
  private opening = false;

  constructor(private readonly client: GameClient, private readonly bag: BagController) {
    this.panel.onBuy = (slotId, amount) => {
      void this.client.call('buySystemItemClient', slotId, amount).catch(() => undefined);
    };
  }

  /** HUD Shop button. */
  async toggle(): Promise<void> {
    if (this.panel.isOpen) return this.panel.close();
    if (this.opening) return;
    this.opening = true;
    try {
      const mall = await this.client.call<OpenMall>('getSystemShop');
      this.panel.show(mall, this.bag.payment);
      this.bag.showBesideShop();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      this.opening = false;
    }
  }

  destroy(): void {
    this.panel.close();
  }
}
