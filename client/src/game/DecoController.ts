// Hồn Khí Vương Tộc (deco + runes) client flow: owns the window and every deco / rune RPC (getDecoCatalog, getRuneCatalog, getDecoInfo,
// getRuneBagData, getRuneChipBag, activeDecoShow, equipDecoShow / equipOffDecoShow, showDecoShow / hideDecoShow, changeShowLvl,
// addDecoHoleLevel(TenTimes), getDecoSuitProp, runeSet / runeRemove / runeMove / runeUpLvl / runeResolve, arrangeRuneBag, exchangeRune).
// State replies replace the cached DecoInfo / RuneBag; a refusal shows as onSystemMidMsgOrNote (BagController) and rejects the call, so the failure
// branch is silent here. The look on the map reaches every client through the onDeco<Pos>On / Off pushes (AppearanceController).

import {
  RUNE_UP_HOLE, type BagItem, type DecoCatalog, type DecoInfo, type DecoShowRow, type DecoSuitPropReply, type PlayerData, type RuneBag, type RuneCatalog,
  type RuneChipBag, type RuneRow,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { createDecoWindow } from '../ui/deco/decoWindow';
import { newDecoView, type DecoActions, type DecoUiHost } from '../ui/deco/decoTypes';
import { DECO_PANEL } from '@mc/shared';
import type { FeatureWindow } from '../ui/feature/featureWindow';
import { MysteryController } from './MysteryController';

export interface DecoControllerHost {
  client: GameClient;
  player: PlayerData;
  /** Bag + worn items (Mật Bảo materials come from here). */
  items(): BagItem[];
}

const EMPTY_BAG = (): RuneBag => ({ chaBag: {}, petBag: {}, upLvlHole: 0 });

export class DecoController {
  private catalog: DecoCatalog = { holes: [], shows: [] };
  private runes: RuneCatalog = { names: [], runes: [], chips: [] };
  private runeIndex = new Map<number, RuneRow>();
  private info: DecoInfo = {};
  private bag: RuneBag = EMPTY_BAG();
  private chips: RuneChipBag = {};
  private suit: DecoSuitPropReply | null = null;
  private loaded = false;
  private busy = false;
  private readonly view = newDecoView();
  private readonly ui: DecoUiHost;
  private readonly win: FeatureWindow;
  private readonly mystery: MysteryController;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: DecoControllerHost) {
    const p = host.player;
    this.mystery = new MysteryController({ client: host.client, player: p, items: () => host.items(), render: () => this.render() });
    this.ui = {
      catalog: () => this.catalog,
      runes: () => this.runes,
      rune: (id) => this.runeIndex.get(id),
      runeName: (r) => this.runes.names[r.nm] ?? `#${r.i}`,
      info: () => this.info,
      bag: () => this.bag,
      chips: () => this.chips,
      suitReply: () => this.suit,
      decoSilver: () => p.currencies?.decoSilver ?? 0,
      runeExp: () => p.currencies?.runeExp ?? 0,
      gold: () => p.gold ?? 0,
      money: () => (p.selectedMoneyType === 2 ? p.money : p.moneyBind) ?? 0,
      view: this.view,
      actions: this.actions(),
      mystery: this.mystery.ui,
      loadMystery: () => void this.mystery.load(),
    };
    this.win = createDecoWindow(() => this.ui, () => this.close());
    this.offs.push(
      host.client.on('onRuneBagUpdate', (d) => {
        this.bag = d as RuneBag;
        this.render();
      }),
      host.client.on('updateRuneChipBag', (d) => {
        this.chips = d as RuneChipBag;
        this.render();
      }),
      // Balances change with every paid action (onUPP): redraw the open window.
      host.client.on('onUPP', () => this.render()),
    );
  }

  get isOpen(): boolean {
    return this.win.isOpen;
  }

  toggle(): void {
    if (this.win.isOpen) this.close();
    else void this.open();
  }

  /** Loads the catalogs (once) and the player's state, then shows the window. */
  async open(tab = 0): Promise<void> {
    if (this.win.isOpen) return;
    try {
      if (!this.loaded) {
        [this.catalog, this.runes] = await Promise.all([this.host.client.call<DecoCatalog>('getDecoCatalog'), this.host.client.call<RuneCatalog>('getRuneCatalog')]);
        this.runeIndex = new Map(this.runes.runes.map((r) => [r.i, r]));
        this.loaded = true;
      }
      [this.info, this.bag, this.chips] = await Promise.all([
        this.host.client.call<DecoInfo>('getDecoInfo'), this.host.client.call<RuneBag>('getRuneBagData', 0), this.host.client.call<RuneChipBag>('getRuneChipBag'),
      ]);
    } catch {
      return;
    }
    if (!this.win.isOpen) this.win.show(tab);
  }

  close(): void {
    this.win.close();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.mystery.destroy();
    this.close();
  }

  private render(): void {
    this.win.render();
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

  private applyInfo(info: DecoInfo | null): boolean {
    if (!info) return false;
    this.info = info;
    this.render();
    // The suit box follows the selected show: activation / wearing changes its pieces.
    const sel = this.catalog.shows.find((s) => s.id === this.view.showSel);
    if (sel) void this.fetchSuit(sel);
    return true;
  }

  private actions(): DecoActions {
    const state = (method: string, ...args: unknown[]): void => void this.run<DecoInfo>(method, ...args).then((r) => this.applyInfo(r));
    const bagCall = (method: string, ...args: unknown[]): void => void this.run<unknown>(method, ...args).then(() => undefined);
    return {
      activate: (show) => this.activate(show),
      equip: (show, on) => state(on ? 'equipDecoShow' : 'equipOffDecoShow', show.id, show.position),
      setVisible: (position, visible) => state(visible ? 'showDecoShow' : 'hideDecoShow', position),
      setTier: (position, tier) => state('changeShowLvl', tier, position),
      upgrade: (position, ten) => state(ten ? 'addDecoHoleLevelTenTimes' : 'addDecoHoleLevel', position),
      socket: (bagPos, holePos, page, position) => {
        this.view.sel = -1;
        state('runeSet', bagPos, holePos, page, position);
      },
      unsocket: (holePos, page, position) => state('runeRemove', holePos, -1, page, position),
      stage: (bagPos, page) => {
        this.view.sel = -1;
        bagCall('runeMove', bagPos, RUNE_UP_HOLE, page);
      },
      unstage: (page) => bagCall('runeMove', RUNE_UP_HOLE, -1, page),
      upLevel: () => void this.run<RuneBag>('runeUpLvl').then((r) => {
        if (r) {
          this.bag = r;
          this.render();
        }
      }),
      resolve: (positions, page) => bagCall('runeResolve', positions, page),
      arrange: (page) => bagCall('arrangeRuneBag', 0, page),
      exchange: () => bagCall('exchangeRune'),
      suit: (show) => void this.fetchSuit(show),
      render: () => this.render(),
    };
  }

  /** Buying a show costs gold: the confirm quotes the price (DECORATE_PANEL[63]); event-only shows are refused by the server with their own text. */
  private activate(show: DecoShowRow): void {
    const buy = (): void => void this.run<DecoInfo>('activeDecoShow', show.id, show.position).then((r) => this.applyInfo(r));
    if (show.activeGold > 0) askConfirm(DECO_PANEL.CONFIRM_ACTIVATE(show.activeGold), buy);
    else buy();
  }

  private async fetchSuit(show: DecoShowRow): Promise<void> {
    const r = await this.run<DecoSuitPropReply>('getDecoSuitProp', show.suitId, show.linkSuitId, 0);
    if (r) this.suit = r;
    this.render();
  }
}
