// M10 phụ bản client: onDungeonRun(view | null) drives the run strip (the Mê Huyễn Nhím Xanh onSetRes swaps are AppearanceController's), openHub() shows the "Phó bản" window from getFbInfo() and
// onAutoTaskStart drives the quick-complete window (AutoTaskPanel, opened from the hub).

import type { AutoTaskPayload, DungeonRunView, FbInfo } from '@mc/shared';
import type { GameClient } from '../net/client';
import { AutoTaskPanel } from '../ui/autoTaskPanel';
import { FbHub } from '../ui/dungeon/fbHub';
import { RunStrip } from '../ui/dungeon/runStrip';
import { toast } from '../ui/screens';
import { StarController } from './StarController';

export class DungeonController {
  private readonly offs: (() => void)[] = [];
  /** M10 phase E: Tinh Giới Thập Nhị Cung window, palace task sweep and the star report card (hosted here: GameScene is at its size cap). */
  readonly star: StarController;
  private readonly strip = new RunStrip();
  private readonly hub = new FbHub(() => this.autoTask.toggle());
  private readonly autoTask: AutoTaskPanel;

  constructor(private readonly client: GameClient, bagCount: (templateId: number) => number = () => 0) {
    this.autoTask = new AutoTaskPanel(client, bagCount);
    this.star = new StarController(client);
    this.offs.push(
      // quick complete (Flash CallBack.onAutoTaskStart -> panel refresh)
      client.on('onAutoTaskStart', (p) => this.autoTask.setData(p as AutoTaskPayload)),
      client.on('onDungeonRun', (view) => this.strip.set((view ?? null) as DungeonRunView | null)),
    );
  }

  async openHub(): Promise<void> {
    if (this.hub.isOpen) return this.hub.close();
    try {
      this.hub.show(await this.client.call<FbInfo[]>('getFbInfo'));
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.strip.hide();
    this.hub.close();
    this.autoTask.close();
    this.star.destroy();
  }
}
