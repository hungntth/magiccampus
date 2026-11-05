// M10 phase F on the client: Vùng Đất Rèn Luyện (strip id 43). The window (trialsPanelInit, trialsStart, trialsFirstKillAwardTake,
// trialsAwardTake, trialsAwardTakeByGold, "Giúp đỡ" = trialsTimerAward), the run card from onUpdateTrialsLifeAndTime and the incremental
// onUpdateTrialsCharData. Refusals and results arrive as onSystemSay (NpcScriptController prints them). Owned by ActivityController.

import type { TrialsCharPatch, TrialsLifeTime, TrialsPanel as TrialsPayload } from '@mc/shared';
import type { GameClient } from '../net/client';
import { toast } from '../ui/screens';
import { TrialsPanel } from '../ui/trials/trialsPanel';
import { TrialsTimer } from '../ui/trials/trialsTimer';

const fail = (e: unknown): void => toast((e as Error).message, true);

export class TrialsController {
  private readonly panel: TrialsPanel;
  private readonly timer: TrialsTimer;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly client: GameClient) {
    this.timer = new TrialsTimer(() => void client.call('trialsOut').catch(fail));
    this.panel = new TrialsPanel({
      start: (floor) => {
        void client.call('trialsStart', floor).catch(fail);
        this.panel.close();
      },
      takeFirst: (floor) => void client.call('trialsFirstKillAwardTake', floor).catch(fail),
      takeWeekly: () => void client.call('trialsAwardTake').catch(fail),
      takeWeeklyGold: () => void client.call('trialsAwardTakeByGold').catch(fail),
      help: () => void client.call<TrialsLifeTime>('trialsTimerAward').then((p) => this.timer.set(p)).catch(fail),
      onClose: () => this.panel.close(),
    });
    this.offs.push(
      client.on('onUpdateTrialsCharData', (p) => this.panel.patch((p ?? {}) as TrialsCharPatch)),
      client.on('onUpdateTrialsLifeAndTime', (p) => this.timer.set((p ?? null) as TrialsLifeTime | null)),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.panel.close();
    this.timer.hide();
  }

  /** Strip icon 43. */
  toggle(): void {
    if (this.panel.isOpen) return this.panel.close();
    this.panel.show();
    void this.client.call<TrialsPayload>('trialsPanelInit').then((p) => p && this.panel.setPanel(p)).catch(fail);
  }
}
