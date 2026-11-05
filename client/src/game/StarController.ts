// M10 phase E on the client: the Tinh Giới Thập Nhị Cung window (activity strip id 2), the palace task sweep window (initTaskSweepPanel push)
// and the StarBattleReport card (battlePlayEnd reply of a palace battle, handed over by BattleController.onEndReply).
// Pushes: updateWarMapStatus {smax}|{snum}, setStarPoint(n) (toast with the gain), initTaskSweepPanel(obj).

import { parseStarReply, parseSweepPanel, type WarMapStatusPush } from '@mc/shared';
import type { GameClient } from '../net/client';
import { toast } from '../ui/screens';
import { showStarReport } from '../ui/star/report';
import { WarMapPanel } from '../ui/star/warMap';
import { TaskSweepPanel } from '../ui/taskSweepPanel';

export class StarController {
  private readonly offs: (() => void)[] = [];
  private readonly map: WarMapPanel;
  private readonly sweep: TaskSweepPanel;
  private points: number | null = null;

  constructor(client: GameClient) {
    this.map = new WarMapPanel(client);
    this.sweep = new TaskSweepPanel(client);
    this.offs.push(
      client.on('updateWarMapStatus', (d) => this.map.status((d ?? {}) as WarMapStatusPush)),
      client.on('initTaskSweepPanel', (p) => {
        const cfg = parseSweepPanel(p);
        if (cfg) this.sweep.show(cfg);
      }),
      client.on('setStarPoint', (v) => this.onPoints(Number(v))),
    );
  }

  /** Strip icon id 2. */
  toggle(): void {
    this.map.toggle();
  }

  /** battlePlayEnd reply: a star report opens the card instead of the generic result (true = consumed). */
  onBattleReply(reply: unknown): boolean {
    const rep = parseStarReply(reply);
    if (!rep) return false;
    showStarReport(rep, () => this.map.refresh());
    return true;
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.map.close();
    this.sweep.destroy();
  }

  private onPoints(total: number): void {
    if (!Number.isFinite(total)) return;
    const gain = this.points === null ? 0 : total - this.points;
    this.points = total;
    this.map.setPoints(total);
    if (gain > 0) toast(`Điểm Tinh Cung +${gain.toLocaleString('vi-VN')} (${total.toLocaleString('vi-VN')})`);
  }
}
