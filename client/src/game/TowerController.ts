// M10 phase F on the client: the Kiếp Nạn Vô Ưu window (strip id 13: initNineFloorPanel, attachThisFloorBoss, getNineBossAward; refusals
// and the first-kill notice arrive as onSystemSay, which NpcScriptController already prints) and the Lật Bài Truyền Thuyết window
// (strip id 40: initFlopPassData / getFlopPassConf + the card, kill, reborn, restart, refresh and rank calls; pushes onPassCard,
// onFlopDelBossClient, onFlopRestart, onFreshCharFlopPassItemByClient, onTakeFlopRankAward). Owned by ActivityController.

import type { FlopCharInfo, FlopConfReply, FlopInit, FlopRankReply, NineFloorPanel, PlayerData } from '@mc/shared';
import type { GameClient } from '../net/client';
import { FlopPassPanel } from '../ui/flopPassPanel';
import { NineBossPanel } from '../ui/nineBossPanel';
import { toast } from '../ui/screens';

export interface TowerHost {
  client: GameClient;
  player: PlayerData;
}

const fail = (e: unknown): void => toast((e as Error).message, true);

export class TowerController {
  private readonly nine: NineBossPanel;
  private readonly flop: FlopPassPanel;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: TowerHost) {
    const { client, player } = host;
    this.nine = new NineBossPanel({
      attack: (floor) => {
        void client.call('attachThisFloorBoss', floor).catch(fail);
        this.nine.close();
      },
      claim: (floorId, type) => void client.call<NineFloorPanel>('getNineBossAward', floorId, type).then((p) => p && this.nine.setPanel(p)).catch(fail),
      onClose: () => this.nine.close(),
    });
    this.flop = new FlopPassPanel({
      call: (m, ...a) => void client.call(m, ...a).catch(fail),
      flip: async (card) => (await client.call<boolean>('flopCard', card)) === true,
      loadRank: () => void client.call<FlopRankReply>('loadFlopRank').then((r) => r && this.flop.setRank(r)).catch(fail),
      onClose: () => this.flop.close(),
      myId: () => player.id,
    });
    this.offs.push(
      client.on('onPassCard', (info, card, bossNum) => this.flop.onPassCard(info as FlopCharInfo, Number(card), Number(bossNum))),
      client.on('onFlopDelBossClient', (db, dbd) => this.flop.setKilled(Number(db), (dbd ?? {}) as Record<string, true>)),
      client.on('onFlopRestart', (info) => this.flop.setInfo(info as FlopCharInfo)),
      client.on('onFreshCharFlopPassItemByClient', (info) => this.flop.setInfo(info as FlopCharInfo)),
      client.on('onTakeFlopRankAward', () => this.flop.awardTaken()),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.nine.close();
    this.flop.close();
  }

  /** Strip icon 13. */
  openNine(): void {
    if (this.nine.isOpen) return this.nine.close();
    this.nine.show();
    void this.host.client.call<NineFloorPanel>('initNineFloorPanel').then((p) => p && this.nine.setPanel(p)).catch(fail);
  }

  /** Strip icon 40: initFlopPassData (level / event checks), then the conf + own run. */
  openFlop(): void {
    if (this.flop.isOpen) return this.flop.close();
    const { client } = this.host;
    void client.call<FlopInit | null>('initFlopPassData').then(async (init) => {
      if (!init) return; // refused: the server sent onSystemSay
      const reply = await client.call<FlopConfReply | null>('getFlopPassConf');
      if (!reply) return;
      this.flop.show();
      this.flop.setConf(reply.conf, reply.ci);
    }).catch(fail);
  }
}
