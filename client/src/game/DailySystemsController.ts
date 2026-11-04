// M8 phase D on the client (part 1): the daily boss window (bossDailyGetData / bossDailyBattle / bossDailyFinishByCard, push
// onOpenBossDailyPanel), the offline delegation window (getOfflineExp / getPetOfflineExp, login `offlineTime`) and the festival window
// (getCurrentFeast / takeFeastGift). Owned by ActivityController; strip icons 49 / 25 and the "Ủy thác" button open them.

import { PetState, type BossDailyData, type CurrentFeast, type PlayerData } from '@mc/shared';
import type { GameClient } from '../net/client';
import { BossDailyPanel } from '../ui/bossDailyPanel';
import { FeastPanel } from '../ui/feastPanel';
import { OfflineExpPanel, type OfflineTab } from '../ui/offlineExpPanel';
import { toast } from '../ui/screens';

export interface DailySystemsHost {
  client: GameClient;
  player: PlayerData;
}

const fail = (e: unknown): void => toast((e as Error).message, true);

export class DailySystemsController {
  private readonly boss: BossDailyPanel;
  private readonly offline: OfflineExpPanel;
  private readonly feast: FeastPanel;
  private bossData: BossDailyData | null = null;
  private feastData: CurrentFeast | null = null;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: DailySystemsHost) {
    const { client, player } = host;
    this.boss = new BossDailyPanel({
      data: () => this.bossData,
      onBattle: (id) => void client.call('bossDailyBattle', id).then(() => this.boss.close()).catch(fail),
      onFinish: (id) => void client.call<{ result: number }>('bossDailyFinishByCard', id).then(() => toast('Ma thú này đã được khiêu chiến hôm nay.')).catch(fail),
      onClose: () => this.boss.close(),
    });
    this.offline = new OfflineExpPanel({
      seconds: () => player.offlineTime ?? 0,
      level: () => player.level,
      pet: () => Object.values(player.petList ?? {}).find((p) => p.state === PetState.BATTLE) ?? null,
      onClaim: (tab, mode, hours) => this.claimOffline(tab, mode, hours),
      onClose: () => this.offline.close(),
    });
    this.feast = new FeastPanel({
      feast: () => this.feastData,
      onClaim: () => void client.call('takeFeastGift').then(() => this.loadFeast()).catch(fail),
      onClose: () => this.feast.close(),
    });
    this.offs.push(client.on('onOpenBossDailyPanel', (d) => {
      this.bossData = { ...(this.bossData ?? {}), ...(d as BossDailyData) } as BossDailyData;
      this.boss.render();
    }));
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.boss.close();
    this.offline.close();
    this.feast.close();
  }

  /** Banked offline seconds still unclaimed (the "Ủy thác" button dot). */
  offlineSeconds(): number {
    return this.host.player.offlineTime ?? 0;
  }

  openBoss(): void {
    if (this.boss.isOpen) return this.boss.close();
    this.boss.show();
    void this.host.client.call<BossDailyData>('bossDailyGetData').then((d) => {
      this.bossData = d;
      this.boss.render();
    }).catch(fail);
  }

  openOffline(): void {
    if (this.offline.isOpen) return this.offline.close();
    this.offline.show();
  }

  openFeast(): void {
    if (this.feast.isOpen) return this.feast.close();
    this.feast.show();
    this.loadFeast();
  }

  private loadFeast(): void {
    void this.host.client.call<CurrentFeast>('getCurrentFeast').then((f) => {
      this.feastData = f;
      this.feast.render();
    }).catch(fail);
  }

  private claimOffline(tab: OfflineTab, mode: number, hours: number): void {
    const { client, player } = this.host;
    void client.call<number>(tab === 'char' ? 'getOfflineExp' : 'getPetOfflineExp', mode, hours).then((code) => {
      // Flash AutoExpPanel.onGetOfflineExp: a success subtracts the converted seconds (all of it when the request covered the bank)
      if (code > 0) player.offlineTime = Math.max(0, (player.offlineTime ?? 0) - Math.round(hours * 3600));
      this.offline.setResult(code);
    }).catch(fail);
  }
}
