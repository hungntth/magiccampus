// M10 phase I client: the world boss event (strip icon 15 -> canEnterWbMap; updateActivityState {id 15} is handled by the strip).
// initWbView (10 positional args) shows the HUD + rank canvas, updateWbOnlineNum / onBossHpChanged / onUpdateWbRank / updateWbStrongLabel
// refresh them, onShowWbTimer / onClearTimer drive the relive countdown, onUpdateWbResult opens the result window, onStartWb is the end
// notice and onClearWbView removes everything (the server sends it on every map change). Every WB RPC is fire-and-forget in Flash.

import { WB_TEXT, type InitWbViewArgs, type UpdateWbRankArgs, type WbAwardItem, type WbClassRank, type WbGlobalRank, type WbResult } from '@mc/shared';
import type { GameClient } from '../net/client';
import type { ChatBox } from '../ui/chat';
import { toast } from '../ui/screens';
import { stageEl } from '../ui/stage';
import { WbHud } from '../ui/worldBoss/wbHud';
import { WbRank } from '../ui/worldBoss/wbRank';
import { WbResultWindow } from '../ui/worldBoss/wbResult';
import { WbTimer } from '../ui/worldBoss/wbTimer';
import { autoState } from './battle/autoState';

const fail = (e: unknown): void => toast((e as Error).message, true);

export class WorldBossController {
  private readonly offs: (() => void)[] = [];
  private readonly hud: WbHud;
  private readonly rank = new WbRank();
  private readonly timer: WbTimer;
  private readonly result: WbResultWindow;

  constructor(private readonly client: GameClient, private readonly playerId: number, private readonly chat: ChatBox) {
    const send = (method: string, ...args: unknown[]): void => void client.call(method, ...args).catch(fail);
    this.hud = new WbHud({
      auto: (on) => {
        send('wbAutoBattle', playerId, on);
        autoState.set(on); // the H5 battle auto mode follows the event checkbox (Flash keeps its auto turns unlimited here)
      },
      cheer: (type) => send('wbStrongBattle', type),
      quit: () => send('wbLeaveMap', playerId),
    });
    this.timer = new WbTimer({
      expired: () => {
        if (!stageEl().classList.contains('in-battle')) send('wbBattleCheck', playerId);
      },
      relive: () => send('wbReliveNow', playerId),
    });
    this.result = new WbResultWindow({ take: () => send('takeWbAward', playerId), leave: () => send('wbLeaveMap', playerId) });
    this.offs.push(
      client.on('initWbView', (left, auto, hp, maxHp, cheer, rank1, rank2, hurt, online, awards) => this.onInit([
        Number(left), Boolean(auto), Number(hp), Number(maxHp), Number(cheer), rank1 as WbGlobalRank, rank2 as WbClassRank, Number(hurt), Number(online),
        (awards ?? null) as WbAwardItem[] | null,
      ])),
      client.on('updateWbOnlineNum', (n) => this.hud.setOnline(Number(n))),
      client.on('onBossHpChanged', (hp) => this.hud.setHp(Number(hp))),
      client.on('onUpdateWbRank', (rank1, rank2, hurt) => this.onRank([rank1 as WbGlobalRank, rank2 as WbClassRank, Number(hurt)])),
      client.on('updateWbStrongLabel', (lv) => this.hud.setCheer(Number(lv))),
      client.on('onShowWbTimer', () => this.timer.show()),
      client.on('onClearTimer', () => this.timer.hide()),
      client.on('onUpdateWbResult', (r) => this.result.show(r as WbResult)),
      client.on('onStartWb', () => this.chat.system(WB_TEXT.ENDED)),
      client.on('onClearWbView', () => this.clear()),
    );
  }

  /** Strip icon 15: the server answers with onSceneEnter + initWbView (or a system message). */
  enter(): void {
    void this.client.call('canEnterWbMap', this.playerId).catch(fail);
  }

  private onInit([left, auto, hp, maxHp, cheer, rank1, rank2, hurt, online, awards]: InitWbViewArgs): void {
    this.hud.show([left, auto, hp, maxHp, cheer, rank1, rank2, hurt, online, awards]);
    if (left <= 0) return this.rank.hide();
    this.rank.show(rank1, rank2, hurt, maxHp, awards);
    if (auto) autoState.set(true);
  }

  private onRank([rank1, rank2, hurt]: UpdateWbRankArgs): void {
    if (this.rank.visible) this.rank.update(rank1, rank2, hurt);
  }

  private clear(): void {
    this.hud.hide();
    this.rank.hide();
    this.timer.hide();
    this.result.hide();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.clear();
  }
}
