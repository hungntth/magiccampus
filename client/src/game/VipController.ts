// M8 phase B on the client: the VIP window (HUD VIP button / strip icon 19). initPmData + getPmRightList on open, buyPm,
// doPmOperation (fire-and-forget: progress comes back as flushProcesFlag), the VIP shop calls and the pmLevel sync of the HUD badge.

import type {
  BuyPmReply, BuyVipShopItemReply, FlushProcessFlagPush, InitPmDataReply, PlayerData, PmPackageType, PmRightView,
  UpdateScenePmLevelPush, VipShopConfigReply,
} from '@mc/shared';
import { PmRight } from '@mc/shared';
import type { GameClient } from '../net/client';
import { toast } from '../ui/screens';
import { VipPanel, type VipTab } from '../ui/vipPanel';

export interface VipHost {
  client: GameClient;
  player: PlayerData;
  /** repaints the HUD portrait (VIP badge) */
  refreshHud(): void;
}

const fail = (e: unknown): void => toast((e as Error).message, true);

export class VipController {
  private readonly panel: VipPanel;
  private readonly offs: (() => void)[] = [];
  private pm: InitPmDataReply | null = null;
  private rights: PmRightView[] = [];
  private shop: VipShopConfigReply | null = null;

  constructor(private readonly host: VipHost) {
    const { client } = host;
    this.panel = new VipPanel({
      pm: () => this.pm, rights: () => this.rights, shop: () => this.shop, level: () => this.level(),
      onTab: (tab) => { if (tab === 'shop') this.loadShop(); },
      onBuyCard: (type) => this.buyCard(type),
      onClaim: (id) => this.claim(id),
      onRefreshShop: () => this.refreshShop(),
      onBuyShop: (id) => this.buyShop(id),
      onClose: () => this.panel.close(),
    });
    this.offs.push(
      client.on('flushProcesFlag', (d) => this.onFlush(d as FlushProcessFlagPush)),
      client.on('updateScenePmLevel', (d) => {
        const p = d as UpdateScenePmLevelPush;
        if (p.cid === host.player.id) this.setLevel(p.pmLevel);
      }),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.panel.close();
  }

  private level(): number {
    return this.host.player.pmLevel ?? 0;
  }

  private setLevel(level: number): void {
    this.host.player.pmLevel = level;
    if (this.pm) this.pm.flag = level;
    this.host.refreshHud();
    this.panel.render();
  }

  /** HUD VIP button (tab 'vip') and strip icon 19 (tab 'shop'); a second press closes it. */
  open(tab: VipTab): void {
    if (this.panel.isOpen && tab === 'vip') return this.panel.close();
    this.panel.show(tab);
    void this.loadPm();
    if (tab === 'shop') this.loadShop();
  }

  private async loadPm(): Promise<void> {
    const { client } = this.host;
    if (this.rights.length === 0) this.rights = await client.call<PmRightView[]>('getPmRightList').catch((e) => { fail(e); return []; });
    this.pm = await client.call<InitPmDataReply>('initPmData').catch((e) => { fail(e); return null; });
    if (this.pm) this.setLevel(this.pm.flag);
    this.panel.render();
  }

  private buyCard(type: PmPackageType): void {
    void this.host.client.call<BuyPmReply>('buyPm', type).then(async (r) => {
      this.setLevel(r.level);
      await this.loadPm();
    }).catch(fail);
  }

  private claim(id: number): void {
    void this.host.client.call('doPmOperation', String(id)).catch(fail);
  }

  private onFlush(p: FlushProcessFlagPush): void {
    if (!this.pm) return;
    if (p.index === PmRight.FINDBACK) void this.loadPm(); // flag consumed; the recovered rights moved their counters
    else this.pm.processFlag[String(p.index)] = { day: p.day, type: p.type, time: p.time };
    this.panel.render();
  }

  private loadShop(): void {
    void this.host.client.call<VipShopConfigReply>('getVipShopConfig').then((r) => { this.shop = r; this.panel.render(); }).catch(fail);
  }

  private refreshShop(): void {
    void this.host.client.call<VipShopConfigReply>('getVipShopCharConfig').then((r) => { this.shop = r; this.panel.render(); }).catch(fail);
  }

  private buyShop(slotId: number): void {
    void this.host.client.call<BuyVipShopItemReply>('buyVipShopItem', slotId, 1).then(() => this.loadShop()).catch(fail);
  }
}
