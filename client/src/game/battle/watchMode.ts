// Spectate stage (M9 phase H, legacy BattleStage watch mode): onWatch builds a read-only battle stage (no command column) with
// the "Thoát" button (BATTLESTAGE_U[0]) that sends quitWatch; onBattlePlayList plays while watching, the end marker only waits,
// and onWatchEnd closes the stage. A battle of the player's own (onBattleStart) replaces the watch.

import type { Container } from 'pixi.js';
import type { BattlePlayList, StartWatchReply, WatchPush } from '@mc/shared';
import type { GameClient } from '../../net/client';
import { toast } from '../../ui/screens';
import { stageEl, stageSize } from '../../ui/stage';
import { BattleStage } from './BattleStage';
import { tintWorld } from './commands';
import { playGroups, resetUnits } from './playback';

export interface WatchHost {
  client: GameClient;
  root: Container;
  world: Container;
  entities: Container;
  stopWalking(): void;
}

export class WatchMode {
  private stage: BattleStage | null = null;
  private quit: HTMLElement | null = null;
  private chain: Promise<void> = Promise.resolve();
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: WatchHost) {
    const c = host.client;
    this.offs.push(
      c.on('onWatch', (d) => this.open(d as WatchPush)),
      c.on('onBattlePlayList', (d) => this.play(d as BattlePlayList)),
      c.on('onWatchEnd', () => this.close()),
      c.on('onBattleStart', () => this.drop()), // the own battle owns the stage state now
    );
  }

  get active(): boolean {
    return this.stage !== null;
  }

  /** Player menu "Xem chiến đấu". */
  async start(targetCid: number): Promise<void> {
    try {
      const r = await this.host.client.call<StartWatchReply>('startWatch', targetCid);
      if (!r.success && r.error) toast(r.error, true);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  tick(dt: number): void {
    if (!this.stage) return;
    this.stage.tick(dt);
    const s = stageSize();
    this.stage.centerIn(s.width, s.height);
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.close();
  }

  private open(d: WatchPush): void {
    this.close();
    this.host.stopWalking();
    const stage = new BattleStage(d);
    this.stage = stage;
    this.chain = Promise.resolve();
    this.host.root.addChild(stage);
    const s = stageSize();
    stage.centerIn(s.width, s.height);
    stageEl().classList.add('in-battle');
    tintWorld(this.host.world, d.bossFlag > 0);
    this.host.entities.visible = false;
    const quit = document.createElement('button');
    quit.className = 'battle-watch-quit';
    quit.textContent = 'Thoát';
    quit.onclick = () => {
      void this.host.client.call('quitWatch').catch(() => undefined);
      this.close();
    };
    stageEl().appendChild(quit);
    this.quit = quit;
  }

  private play(groups: BattlePlayList): void {
    const stage = this.stage;
    if (!stage) return;
    this.chain = this.chain.then(async () => {
      if (this.stage !== stage) return;
      const end = await playGroups(stage, groups, { banner: () => undefined });
      if (this.stage === stage && !end) resetUnits(stage); // the end marker only waits for onWatchEnd
    });
  }

  /** Removes the watch stage and button only. */
  private drop(): void {
    this.stage?.destroy({ children: true });
    this.stage = null;
    this.quit?.remove();
    this.quit = null;
  }

  private close(): void {
    if (!this.stage) return;
    this.drop();
    this.host.world.filters = [];
    this.host.entities.visible = true;
    stageEl().classList.remove('in-battle');
  }
}
