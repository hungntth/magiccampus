// Ma Tâm (monster heart) client flow: owns the window and every RPC (getMonsterHeartCatalog, initMonsterHeartData, monsterHeartSet / ReMove,
// openHoleMonsterHeart(Jingang), upgradeMonsterHeartItem, resolveMonsterHeart, upgradeMonsterHeartBox). Pushes replace the cached state
// (updateMonsterHeartPanel / Box / BagByType / AfterUp / onUpgradeMonsterHeartBox / BagByOneKey). A refusal shows as onSystemMidMsgOrNote and
// rejects the call, so the failure branch is silent here.

import {
  MONSTER_HEART, emptyHeartBags, emptyMonsterHeartData, type BagItem, type MonsterHeartBags, type MonsterHeartCatalog, type MonsterHeartData,
  type MonsterHeartState, type PlayerData,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { toast } from '../ui/screens';
import type { FeatureWindow } from '../ui/feature/featureWindow';
import { EMPTY_CATALOG, indexCatalog, type MhIndex } from '../ui/monsterheart/mhRules';
import { newMhView, type MhActions, type MhUiHost } from '../ui/monsterheart/mhTypes';
import { createMonsterHeartWindow } from '../ui/monsterheart/mhWindow';

export interface MonsterHeartControllerHost {
  client: GameClient;
  player: PlayerData;
  /** Bag items (Kim Cương stacks for opening holes). */
  items(): BagItem[];
}

/** Client-side delay between two "Toàn bộ" runs (legacy button cooldown). */
const ALL_COOLDOWN_MS = 30_000;

export class MonsterHeartController {
  private index: MhIndex = indexCatalog(EMPTY_CATALOG);
  private loaded = false;
  private busy = false;
  private cooling = false;
  private coolTimer: ReturnType<typeof setTimeout> | null = null;
  private state: MonsterHeartState = { bag: emptyHeartBags(), data: emptyMonsterHeartData() };
  private readonly view = newMhView();
  private readonly ui: MhUiHost;
  private readonly win: FeatureWindow;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: MonsterHeartControllerHost) {
    const p = host.player;
    this.ui = {
      state: () => this.state,
      index: () => this.index,
      view: this.view,
      actions: this.actions(),
      maNang: () => p.currencies?.monsterHeart ?? 0,
      stones: () => p.currencies?.mhjingshi ?? 0,
      gold: () => p.gold ?? 0,
      diamonds: (color) => this.host.items().filter((i) => i.tid === MONSTER_HEART.DIAMOND_TEMPLATE && i.color === color).reduce((n, i) => n + i.stackNum, 0),
      allCooling: () => this.cooling,
    };
    this.win = createMonsterHeartWindow(() => this.ui, () => this.close());
    const c = host.client;
    this.offs.push(
      c.on('updateMonsterHeartPanel', (d) => this.setState(d as MonsterHeartState)),
      c.on('updateMonsterHeartBox', (d) => {
        this.state = { ...this.state, data: d as MonsterHeartData };
        this.render();
      }),
      c.on('updateMonsterHeartBagByType', (bag) => {
        this.state = { ...this.state, bag: bag as MonsterHeartBags };
        this.render();
      }),
      c.on('updateMonsterHeartAfterUp', (isAll, n) => {
        const count = Number(n);
        this.say(isAll ? `Thăng cấp ${count} Ma Tâm` : count > 0 ? 'Thăng cấp thành công' : 'Thăng cấp thất bại', !isAll && count <= 0);
      }),
      c.on('onUpgradeMonsterHeartBox', (lev) => {
        this.state = { ...this.state, data: { ...this.state.data, heartBoxLev: lev as MonsterHeartData['heartBoxLev'] } };
        this.render();
      }),
      c.on('updateMonsterHeartBagByOneKey', () => void this.reload()),
      // Balances (Ma Năng, Tâm Tinh Thạch, gold) change with every paid action: redraw the open window.
      c.on('onUPP', () => this.render()),
    );
  }

  get isOpen(): boolean {
    return this.win.isOpen;
  }

  toggle(): void {
    if (this.win.isOpen) this.close();
    else void this.open();
  }

  async open(): Promise<void> {
    if (this.win.isOpen) return;
    try {
      if (!this.loaded) {
        this.index = indexCatalog(await this.host.client.call<MonsterHeartCatalog>('getMonsterHeartCatalog'));
        this.loaded = true;
      }
      this.state = await this.host.client.call<MonsterHeartState>('initMonsterHeartData');
    } catch {
      return;
    }
    this.view.sel = 0;
    this.view.status = '';
    if (!this.win.isOpen) this.win.show(0);
  }

  close(): void {
    this.win.close();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    if (this.coolTimer) clearTimeout(this.coolTimer);
    this.close();
  }

  private render(): void {
    this.win.render();
  }

  private setState(s: MonsterHeartState): void {
    this.state = s;
    this.render();
  }

  private say(text: string, danger = false): void {
    this.view.status = text;
    toast(text, danger);
    this.render();
  }

  private async reload(): Promise<void> {
    try {
      this.setState(await this.host.client.call<MonsterHeartState>('initMonsterHeartData'));
    } catch {
      /* refused: keep the cached state */
    }
  }

  /** One RPC at a time (the server serialises them anyway); a refusal is already shown by onSystemMidMsgOrNote. */
  private async run(method: string, ...args: unknown[]): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      await this.host.client.call<null>(method, ...args);
      return true;
    } catch {
      return false;
    } finally {
      this.busy = false;
    }
  }

  private actions(): MhActions {
    const fire = (method: string, ...args: unknown[]): void => void this.run(method, ...args);
    return {
      place: (heartId, hole, box, type) => fire('monsterHeartSet', heartId, hole, box, type),
      remove: (hole, box) => fire('monsterHeartReMove', hole, box),
      openGold: (box, hole) => fire('openHoleMonsterHeart', box, hole),
      openDiamond: (box, hole) => fire('openHoleMonsterHeartJingang', box, hole, 0),
      upgradeBox: (box) => fire('upgradeMonsterHeartBox', box),
      fuse: (isAll) => this.fuse(isAll),
      resolve: () => {
        const n = Math.max(1, this.view.resolveNum);
        void this.run('resolveMonsterHeart', this.view.sel, n).then((ok) => {
          if (ok) this.view.resolveNum = 1;
        });
      },
      render: () => this.render(),
    };
  }

  private fuse(isAll: boolean): void {
    const v = this.view;
    if (!v.sel || (isAll && this.cooling)) return;
    void this.run('upgradeMonsterHeartItem', isAll, v.sel, v.fuseNum, v.useStone, v.useStone && v.byGold).then((ok) => {
      if (!ok || !isAll) return;
      this.cooling = true;
      this.render();
      this.coolTimer = setTimeout(() => {
        this.cooling = false;
        this.render();
      }, ALL_COOLDOWN_MS);
    });
  }
}
