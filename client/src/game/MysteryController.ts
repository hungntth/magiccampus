// Mật Bảo client flow (Hồn Khí window, tab "Mật Bảo"): owns the state and every Mật Bảo RPC (getMysCatalog, onGetMysBookData, onGetMysMakeData, onGetMysBagData,
// onGetMakeLimitTimes, getMysTreBuffByKind, getMysTreBuffSimpleData, onGetMysAddTimes + addLimitMakeTimes, makeMysTre, mysTreObjResolve). The server keeps the panel current
// through updateMysTreBag / Book / MakeTimes / MakeData and onActiveMysBookInfo; a refusal shows as onSystemMidMsgOrNote (BagController) and rejects the call, so the
// failure branch is silent here.

import {
  ItemKind, MYS_TEXT, mysAddTimesCost, type BagItem, type MakeMysTreReply, type MysBag, type MysBook, type MysBuffByKind, type MysBuffSimple, type MysCatalog,
  type MysLimit, type MysMakeData, type MysRecipeRow, type PlayerData,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { toast } from '../ui/screens';
import { autoPlace, resolveArg, type Placement } from '../ui/mystery/mysteryRules';
import { newMysteryView, type MysteryActions, type MysteryUiHost } from '../ui/mystery/mysteryTypes';

export interface MysteryControllerHost {
  client: GameClient;
  player: PlayerData;
  /** Bag + worn items (materials come from here). */
  items(): BagItem[];
  /** Redraws the Hồn Khí window. */
  render(): void;
}

export class MysteryController {
  private catalog: MysCatalog | null = null;
  private book: MysBook = {};
  private bag: MysBag = {};
  private makeData: MysMakeData = { learnedRec: {}, skiLvl: 1, skiPt: 0 };
  private left = 0;
  private simple: MysBuffSimple = {};
  private readonly buffs = new Map<number, MysBuffByKind>();
  private busy = false;
  private loading = false;
  private readonly view = newMysteryView();
  private readonly offs: (() => void)[] = [];
  readonly ui: MysteryUiHost;

  constructor(private readonly host: MysteryControllerHost) {
    const p = host.player;
    this.ui = {
      catalog: () => this.catalog,
      book: () => this.book,
      bag: () => this.bag,
      makeData: () => this.makeData,
      limit: () => this.left,
      buffs: (kind) => this.buffs.get(kind),
      simple: () => this.simple,
      items: () => host.items().filter((i) => i.itemType === ItemKind.ITEM),
      silver: () => p.currencies?.decoSilver ?? 0,
      view: this.view,
      actions: this.actions(),
    };
    const c = host.client;
    this.offs.push(
      c.on('updateMysTreBag', (d) => this.set(() => (this.bag = d as MysBag))),
      c.on('updateMysTreBook', (d) => {
        this.book = d as MysBook;
        this.fetchBuffs();
        host.render();
      }),
      c.on('updateMysTreMakeTimes', (n) => this.set(() => (this.left = Number(n)))),
      c.on('updateMysTreMakeData', (d) => this.set(() => (this.makeData = d as MysMakeData))),
      c.on('onActiveMysBookInfo', (d) => {
        const row = this.catalog?.items.find((i) => i.id === (d as { id: number }).id);
        if (row) toast(MYS_TEXT.ACTIVATED(row.name, row.star));
      }),
      c.on('onUPP', () => host.render()),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
  }

  private set(apply: () => void): void {
    apply();
    this.host.render();
  }

  /** Loads the catalog (once) and the player's Mật Bảo state; the tab shows a loading line until the catalog is there. */
  async load(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    const c = this.host.client;
    try {
      this.catalog ??= await c.call<MysCatalog>('getMysCatalog');
      [this.book, this.makeData, this.bag, this.simple] = await Promise.all([
        c.call<MysBook>('onGetMysBookData'), c.call<MysMakeData>('onGetMysMakeData'), c.call<MysBag>('onGetMysBagData'), c.call<MysBuffSimple>('getMysTreBuffSimpleData'),
      ]);
      this.left = (await c.call<MysLimit>('onGetMakeLimitTimes')).n;
      await this.fetchKind(this.view.kind);
    } catch {
      // the refusal / error is already shown
    } finally {
      this.loading = false;
      this.host.render();
    }
  }

  private fetchBuffs(): void {
    void this.fetchKind(this.view.kind).then(() => this.host.render());
    void this.host.client.call<MysBuffSimple>('getMysTreBuffSimpleData').then((s) => (this.simple = s)).catch(() => undefined);
  }

  private async fetchKind(kind: number): Promise<void> {
    this.buffs.set(kind, await this.host.client.call<MysBuffByKind>('getMysTreBuffByKind', kind));
  }

  /** One mutation at a time. */
  private async run<T>(method: string, ...args: unknown[]): Promise<T | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      return await this.host.client.call<T>(method, ...args);
    } catch {
      return null;
    } finally {
      this.busy = false;
    }
  }

  private actions(): MysteryActions {
    return {
      make: (recipe, placed) => void this.make(recipe, placed),
      buy: () => void this.buy(),
      resolve: (selection) => void this.run('mysTreObjResolve', resolveArg(selection)).then(() => {
        this.view.picked.clear();
        this.host.render();
      }),
      selectKind: (kind) => void this.fetchKind(kind).then(() => this.host.render()).catch(() => undefined),
      render: () => this.host.render(),
    };
  }

  /** makeMysTre(recipe, {slot:{idx}}, {slot:stack}): materials are auto-placed when the player did not press the button first. */
  private async make(recipe: MysRecipeRow, placed: Placement | null): Promise<void> {
    const p = placed ?? autoPlace(recipe, this.ui.items().map((i) => ({ id: i.id, tid: i.tid, color: i.color, stackNum: i.stackNum })));
    if (p.missing.length > 0) {
      toast(MYS_TEXT.NEED_MATS, true);
      return;
    }
    await this.run<MakeMysTreReply>('makeMysTre', recipe.id, p.slots, p.stacks);
    this.view.placed = null;
    this.host.render();
  }

  /** onGetMysAddTimes -> confirm with the tier price -> addLimitMakeTimes. */
  private async buy(): Promise<void> {
    const times = await this.run<MysLimit>('onGetMysAddTimes');
    if (!times) return;
    const cost = mysAddTimesCost(times.n);
    if (cost === null) {
      toast(MYS_TEXT.BUY_DONE);
      return;
    }
    askConfirm(MYS_TEXT.CONFIRM_BUY(cost), () => void this.run<MysLimit>('addLimitMakeTimes').then((r) => r && this.set(() => (this.left = r.n))));
  }
}
