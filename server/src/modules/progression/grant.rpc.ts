// H5 dev command gmGrant(kind, id, n) (chat `/grant <currency|item|title> <id> <n>`), next to gmAddBuff / gmGoMap: the panels of
// M7 need currencies, items and titles that have no income in the legacy data. kind currency: id = key or Go id, n = amount;
// kind item: id = data_tbl_item id, n = count; kind equip: id = data_tbl_equipt_template id, n = count (1..10), 4th arg 1 = bound; kind title: id = title id, n = seconds (0 / absent = permanent).
// Pushes: onUPP {currencies} + stat refresh (currency), onAddItem + onAddCharactorSlot (item), onAddTitle (title).

import { Injectable } from '@nestjs/common';
import { ItemKind, MW, resolveCurrency, type EquipProperties, type GmGrantResult } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { TitleService } from '../title/title.service';
import { CurrencyService } from './currency.service';
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
    if (kind === 'item') return this.grantItem(session, Number(args[1]), parseAmount(args[2] ?? 1));
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

  private async grantItem(session: Session, itemId: number, n: number | null): Promise<GmGrantResult> {
    if (!Number.isInteger(itemId) || itemId <= 0) throw RpcException.invalidArgs('itemId');
    if (n === null) throw RpcException.invalidArgs('n');
    const tpl = await this.gameData.template(29, itemId);
    if (!tpl) throw RpcException.notFound(`item ${itemId} not found`);
    const spec = { templateId: itemId, itemType: ItemKind.ITEM, bound: false, color: 0, amount: n, maxStack: maxStack(tpl) };
    const changed = await withCharLock(session.characterId!, () => this.inventory.add(session.characterId!, spec));
    session.callback('onAddItem', { i: itemId, q: n, t: ItemKind.ITEM, n: String(tpl.name ?? `#${itemId}`) });
    for (const item of changed) session.callback('onAddCharactorSlot', item);
    return { kind: 'item', id: String(itemId), n, note: `item ${itemId} x${n}` };
  }
}
