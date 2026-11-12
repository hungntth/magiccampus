// H5 dev command gmGrant(kind, id, n) (chat `/grant <currency|item|title> <id> <n>`), next to gmAddBuff / gmGoMap: the panels of
// M7 need currencies, items and titles that have no income in the legacy data. kind currency: id = key or Go id, n = amount;
// kind medal: id = data_tbl_medal id, n = count; kind medalexp: id = amount (M13 E2); kind heart: id = creatureh_heart id, n = count (M13 E2); kind prschip: id = prs_chip id, n = count (M13 G); kind fairy: id = fairy template id (M13 G); kind rune: id = deco_rune id, n = count; kind runechip: id = rune_chip id, n = count (M13 E1 test sources); kind item: id = data_tbl_item id, n = count; kind equip: id = data_tbl_equipt_template id, n = count (1..10), 4th arg 1 = bound; kind wing: id = wing template id, n = colour 0..4 (white .. orange), 4th arg 1 = bound (lines rolled for the colour); kind title: id = title id, n = seconds (0 / absent = permanent).
// Pushes: onUPP {currencies} + stat refresh (currency), onAddItem + onAddCharactorSlot (item), onAddTitle (title).

import { Injectable } from '@nestjs/common';
import { ItemKind, MW, runeBagOfKind, WING_COLOUR_MAX, WING_KIND, resolveCurrency, wingColorCodeOf, type EquipProperties, type GmGrantResult } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { grantGrowth } from './grant-growth';
import { RUNE_CHIP_FEATURE_KEY, RUNE_FEATURE_KEY, addChips, addRune, parseChipBag, parseRuneBag } from '../rune/rune-bag';
import { lineSet, rollWingLines } from '../wing/wing-rules';
import { CharacterStatsService } from '../stats/character-stats.service';
import { TitleService } from '../title/title.service';
import { CurrencyService } from './currency.service';
import { FeatureStoreService } from './feature-store.service';
import { parseAmount } from './currency-rules';

const MAX_TITLE_SECONDS = 365 * 24 * 3600;

/** A fresh MAIN magic weapon starts at 0.9 x its template lines (the client stage panel's starting ratio); other equipment: no rolls. */
function mwStartLines(tpl: Record<string, unknown>): EquipProperties | undefined {
  if (Number(tpl.kind) !== MW.KIND || Number(tpl.type) !== MW.MAIN_TYPE) return undefined;
  return {
    mainProp1: Number(tpl.main_prop1), mainProp2: Number(tpl.main_prop2),
    mainPropNum1: Math.floor(Number(tpl.main_prop_num1) * 0.9), mainPropNum2: Math.floor(Number(tpl.main_prop_num2) * 0.9),
  };
}

@Injectable()
export class GrantRpc {
  constructor(
    private readonly currencies: CurrencyService,
    private readonly inventory: InventoryService,
    private readonly titles: TitleService,
    private readonly stats: CharacterStatsService,
    private readonly gameData: GameDataService,
    private readonly store: FeatureStoreService,
  ) {}

  @Rpc('gmGrant', { requireCharacter: true, forbidInBattle: true, requireGm: true })
  async gmGrant(session: Session, args: unknown[]): Promise<GmGrantResult> {
    const kind = String(args[0] ?? '');
    const cid = session.characterId!;
    if (kind === 'currency') {
      const key = resolveCurrency(args[1]);
      const n = parseAmount(args[2] ?? 1);
      if (!key) throw RpcException.invalidArgs('currency');
      if (n === null) throw RpcException.invalidArgs('n');
      const total = await this.currencies.credit(cid, key, n);
      await this.currencies.push(session);
      await this.stats.refreshPush(session); // property.spirituality
      return { kind, id: key, n, total, note: `${key} +${n} = ${total}` };
    }
    if (kind === 'wing') return this.grantWing(session, Number(args[1]), Number(args[2] ?? 0), Number(args[3] ?? 0) === 1);
    if (kind === 'medal' || kind === 'medalexp' || kind === 'heart' || kind === 'prschip' || kind === 'fairy') return grantGrowth(session, this.store, this.gameData, kind, Number(args[1]), Number(args[kind === 'medalexp' ? 1 : 2] ?? 1));
    if (kind === 'rune' || kind === 'runechip') return this.grantRune(session, kind, Number(args[1]), Number(args[2] ?? 1));
    if (kind === 'item') return this.grantItem(session, Number(args[1]), parseAmount(args[2] ?? 1), Number(args[3] ?? 0));
    if (kind === 'equip') return this.grantEquip(session, Number(args[1]), Number(args[2] ?? 1), Number(args[3] ?? 0) === 1);
    if (kind === 'title') {
      const id = Number(args[1]);
      const secs = args[2] === undefined ? 0 : Number(args[2]);
      if (!Number.isInteger(id) || id <= 0) throw RpcException.invalidArgs('titleId');
      if (!Number.isInteger(secs) || secs < 0 || secs > MAX_TITLE_SECONDS) throw RpcException.invalidArgs('seconds');
      await this.titles.grant(cid, id, secs);
      return { kind, id: String(id), n: secs, note: `title ${id} granted${secs > 0 ? ` for ${secs}s` : ''}` };
    }
    throw RpcException.invalidArgs('kind');
  }

  /** Equipment (data_tbl_equipt_template id) x n (1..10), optionally bound; full durability. Magic weapons are kind-8 templates. */
  private async grantEquip(session: Session, tid: number, n: number, bound: boolean): Promise<GmGrantResult> {
    if (!Number.isInteger(tid) || tid <= 0) throw RpcException.invalidArgs('equipId');
    if (!Number.isInteger(n) || n < 1 || n > 10) throw RpcException.invalidArgs('n');
    const tpl = await this.gameData.template(19, tid);
    if (!tpl) throw RpcException.notFound(`equipment ${tid} not found`);
    const spec = { templateId: tid, itemType: ItemKind.EQUIP, bound, color: Number(tpl.color_code ?? 0) || 0, amount: 1, maxStack: 1 };
    const cid = session.characterId!;
    const changed = await withCharLock(cid, async () => {
      const out = [];
      for (let i = 0; i < n; i++) out.push(...(await this.inventory.add(cid, spec, Number(tpl.endure_max ?? 0) || 0, mwStartLines(tpl))));
      return out;
    });
    session.callback('onAddItem', { i: tid, q: n, t: ItemKind.EQUIP, n: String(tpl.name ?? `#${tid}`) });
    for (const item of changed) session.callback('onAddCharactorSlot', item);
    return { kind: 'equip', id: String(tid), n, note: `equip ${tid} x${n}${bound ? ' (bound)' : ''}` };
  }

  /** A wing (equipment kind 13) of the given colour 0..4 with its four lines and the bind percents rolled for that colour; new wings have all ten holes open. */
  private async grantWing(session: Session, tid: number, colour: number, bound: boolean): Promise<GmGrantResult> {
    if (!Number.isInteger(tid) || tid <= 0) throw RpcException.invalidArgs('wingId');
    if (!Number.isInteger(colour) || colour < 0 || colour > WING_COLOUR_MAX) throw RpcException.invalidArgs('colour');
    const tpl = await this.gameData.template(19, tid);
    if (!tpl || Number(tpl.kind) !== WING_KIND) throw RpcException.notFound(`wing ${tid} not found`);
    const spec = { templateId: tid, itemType: ItemKind.EQUIP, bound, color: wingColorCodeOf(colour), amount: 1, maxStack: 1 };
    const cid = session.characterId!;
    const lines = Object.fromEntries(Object.entries(lineSet(rollWingLines(tpl, colour, Math.random))).map(([k, v]) => [k.replace('properties.', ''), v]));
    const changed = await withCharLock(cid, () => this.inventory.add(cid, spec, Number(tpl.endure_max ?? 0) || 0, lines));
    session.callback('onAddItem', { i: tid, q: 1, t: ItemKind.EQUIP, n: String(tpl.name ?? `#${tid}`) });
    for (const item of changed) session.callback('onAddCharactorSlot', item);
    return { kind: 'wing', id: String(tid), n: colour, note: `wing ${tid} colour ${colour}${bound ? ' (bound)' : ''}` };
  }

  /** M13 E1 test source: kind rune = deco_rune id x n into the bag of its kind (pushes onRuneBagUpdate); kind runechip = rune_chip id x n (updateRuneChipBag). */
  private async grantRune(session: Session, kind: 'rune' | 'runechip', id: number, n: number): Promise<GmGrantResult> {
    if (!Number.isInteger(id) || id <= 0) throw RpcException.invalidArgs('id');
    if (!Number.isInteger(n) || n < 1 || n > 999) throw RpcException.invalidArgs('n');
    const cid = session.characterId!;
    if (kind === 'rune') {
      const def = this.gameData.decoRune(id);
      if (!def) throw RpcException.notFound(`rune ${id} not found`);
      const bag = await withCharLock(cid, async () => {
        const next = addRune(parseRuneBag(await this.store.get(cid, RUNE_FEATURE_KEY, {})), runeBagOfKind(def.kind), id, n);
        if (!next) throw RpcException.forbidden('rune bag full');
        await this.store.put(cid, RUNE_FEATURE_KEY, { chaBag: next.chaBag, petBag: next.petBag, upLvlHole: next.upLvlHole });
        return next;
      });
      session.callback('onRuneBagUpdate', bag);
      return { kind, id: String(id), n, note: `rune ${id} (${def.name}) x${n}` };
    }
    const chip = this.gameData.runeChip(id);
    if (!chip) throw RpcException.notFound(`rune chip ${id} not found`);
    const chips = await withCharLock(cid, async () => {
      const next = addChips(parseChipBag(await this.store.get(cid, RUNE_CHIP_FEATURE_KEY, {})), id, n);
      if (!next) throw RpcException.forbidden('chip bag full');
      await this.store.put(cid, RUNE_CHIP_FEATURE_KEY, { bag: next });
      return next;
    });
    session.callback('updateRuneChipBag', chips);
    return { kind, id: String(id), n, note: `rune chip ${id} (${chip.name}) x${n}` };
  }

  /** Item template x n; the optional 4th argument is the instance colour 0..8 (crafting recipes match materials by colour, e.g. Mật Bảo needs colour 2). */
  private async grantItem(session: Session, itemId: number, n: number | null, color = 0): Promise<GmGrantResult> {
    if (!Number.isInteger(itemId) || itemId <= 0) throw RpcException.invalidArgs('itemId');
    if (n === null) throw RpcException.invalidArgs('n');
    const tpl = await this.gameData.template(29, itemId);
    if (!tpl) throw RpcException.notFound(`item ${itemId} not found`);
    if (!Number.isInteger(color) || color < 0 || color > 8) throw RpcException.invalidArgs('color');
    const spec = { templateId: itemId, itemType: ItemKind.ITEM, bound: false, color, amount: n, maxStack: maxStack(tpl) };
    const changed = await withCharLock(session.characterId!, () => this.inventory.add(session.characterId!, spec));
    session.callback('onAddItem', { i: itemId, q: n, t: ItemKind.ITEM, n: String(tpl.name ?? `#${itemId}`) });
    for (const item of changed) session.callback('onAddCharactorSlot', item);
    return { kind: 'item', id: String(itemId), n, note: `item ${itemId} x${n}${color ? ` colour ${color}` : ''}` };
  }
}
