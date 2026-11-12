// Tủ Đồ (dress cabinet) client flow: owns the window, the Đổi bộ window and every dress RPC (checkSameDay, activeDress, recieveGoods,
// exchangeRecipe, the five draws, makeAllChips, transformRecipe / transformAllRecipe, set / unset fake dress and flyer, getDressCatalog).
// Every reply carries the new DressInfo, which replaces the cached copy; a refusal shows as onSystemMidMsgOrNote (BagController) and
// rejects the call, so the failure branch is silent here. The fake look reaches the map through the appearance pushes.

import {
  DRESS_TYPE, emptyDressInfo, type DressCatalog, type DressCatalogDress, type DressCatalogRecipe, type DressDrawResult, type DressInfo,
  type DressTenResult, type DressTransformAllResult, type PlayerData, type RecipeDrop,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import type { FeatureWindow } from '../ui/feature/featureWindow';
import { createDressWindow } from '../ui/dress/dressWindow';
import { trimCells } from '../ui/dress/dressRules';
import { newViewState, type DrawKind, type DressActions, type DressUiHost } from '../ui/dress/dressTypes';
import { ExchangeWindow } from '../ui/dress/exchangeWindow';
import { showRecipeResult } from '../ui/dress/resultPopup';

export interface DressControllerHost {
  client: GameClient;
  player: PlayerData;
}

const DRAW_CALLS: Record<DrawKind, string> = {
  free: 'freeExtractRecipe', gold: 'goldExtractRecipe', ten: 'tenExtractRecipe', ssd: 'ssdExtractRecipe', largeSsd: 'largessdExtractRecipe',
};

export class DressController {
  private catalog: DressCatalog | null = null;
  private info: DressInfo = emptyDressInfo();
  private busy = false;
  private readonly view = newViewState();
  private readonly ui: DressUiHost;
  private readonly win: FeatureWindow;
  private readonly exchange: ExchangeWindow;
  private readonly offs: (() => void)[] = [];
  private closePopup: (() => void) | null = null;

  constructor(private readonly host: DressControllerHost) {
    this.ui = {
      catalog: () => this.catalog ?? { dresses: [], recipes: [] },
      info: () => this.info,
      dress: (id) => this.catalog?.dresses.find((d) => d.id === id),
      recipe: (id) => this.catalog?.recipes.find((r) => r.id === id),
      gold: () => this.host.player.gold ?? 0,
      ssd: () => this.host.player.currencies?.shishangdian ?? 0,
      view: this.view,
      actions: this.actions(),
      render: () => this.render(),
    };
    this.win = createDressWindow(() => this.ui, () => this.close());
    this.exchange = new ExchangeWindow(this.ui);
    // Balances change with every paid action (onUPP): redraw the open windows.
    this.offs.push(host.client.on('onUPP', () => this.render()));
  }

  get isOpen(): boolean {
    return this.win.isOpen;
  }

  toggle(): void {
    if (this.win.isOpen) this.close();
    else void this.open();
  }

  /** Loads the catalog (once) and today's state, then shows the window. */
  async open(tab = 0): Promise<void> {
    if (this.win.isOpen) return;
    try {
      this.catalog ??= await this.host.client.call<DressCatalog>('getDressCatalog');
      this.setInfo(await this.host.client.call<DressInfo>('checkSameDay'));
    } catch {
      return;
    }
    if (!this.win.isOpen) this.win.show(tab);
  }

  close(): void {
    this.closePopup?.();
    this.closePopup = null;
    this.exchange.close();
    this.win.close();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.close();
  }

  private render(): void {
    this.win.render();
    this.exchange.render();
  }

  private setInfo(info: DressInfo): void {
    this.info = info;
    this.view.cells = trimCells(this.view.cells, info);
  }

  /** One RPC at a time (the server serialises them anyway); null when refused. */
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

  private apply(info: DressInfo | null | undefined): boolean {
    if (!info) return false;
    this.setInfo(info);
    this.render();
    return true;
  }

  private popup(drops: readonly RecipeDrop[]): void {
    this.closePopup?.();
    this.closePopup = showRecipeResult(drops, (id) => this.ui.recipe(id));
  }

  private actions(): DressActions {
    return {
      activate: (id, autoBuy) => void this.run<DressInfo>('activeDress', id, autoBuy).then((r) => this.apply(r)),
      receive: (id) => void this.run<DressInfo>('recieveGoods', id).then((r) => this.apply(r)),
      fake: (d, on) => void this.fakeLook(d, on),
      draw: (kind) => void this.draw(kind),
      mergeChips: () => void this.run<DressInfo>('makeAllChips').then((r) => this.apply(r)),
      transform: (ids, all) => void this.transform(ids, all),
      exchange: (r) => void this.exchangeRecipe(r),
      openExchange: () => this.exchange.show(),
      goTab: (tab, select) => {
        if (select) this.view.activateSel = select;
        this.win.select(tab);
      },
    };
  }

  /** The Flash client also sent the art codes of the chosen look; the server resolves them from the dress row, so they are not sent. */
  private async fakeLook(d: DressCatalogDress, on: boolean): Promise<void> {
    const flyer = d.type === DRESS_TYPE.FLYER;
    const method = `${on ? 'set' : 'unset'}Fake${flyer ? 'FlyerDress' : 'Dress'}`;
    this.apply(await this.run<DressInfo>(method, d.id, '0', ...(flyer ? ['0'] : [])));
  }

  private async draw(kind: DrawKind): Promise<void> {
    const r = await this.run<DressDrawResult | DressTenResult>(DRAW_CALLS[kind]);
    if (!r || !this.apply(r.dressInfo)) return;
    this.popup('planArr' in r ? r.planArr.map((p) => ({ recipeId: p.recipeId, recipeNum: p.num })) : [{ recipeId: r.recipeId, recipeNum: r.recipeNum }]);
  }

  private async transform(ids: number[], all: boolean): Promise<void> {
    if (all) {
      const r = await this.run<DressTransformAllResult>('transformAllRecipe', ids);
      if (r && this.apply(r.dressInfo)) this.popup(r.produceArr);
    } else {
      const r = await this.run<DressDrawResult>('transformRecipe', ids);
      if (r && this.apply(r.dressInfo)) this.popup([{ recipeId: r.recipeId, recipeNum: r.recipeNum }]);
    }
  }

  private async exchangeRecipe(recipe: DressCatalogRecipe): Promise<void> {
    this.apply(await this.run<DressInfo>('exchangeRecipe', recipe.id));
  }
}
