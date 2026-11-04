// Quest item rewards (Go applyRewards / lifecycle.go grantQuestStartItems): the Quà slot views, the finish-time award
// plan (data_tbl_quest_award, bound, equipment colour from quality) and the accept-time start_grant_item.
// Pet (kind 2) and skill (kind 3) awards are shown but not granted: H5 has no pet / skill-book system yet.

import { Injectable, Logger } from '@nestjs/common';
import { ItemKind, QuestAwardKind, type AddItemNotice, type BagItem, type QuestAward } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import type { QuestAwardRow, QuestTemplate } from '../gamedata/quest-data';
import { maxStack, type AddSpec } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { awardColor, awardName, EQUIP_TABLE, PET_TABLE, pickAwards } from './quest-award';

/** One bag grant of a finish: the add spec plus what the onAddItem notice says. */
export interface PlannedAward {
  spec: AddSpec;
  durability: number;
  notice: AddItemNotice;
}

export interface GrantedAwards {
  pushes: Push[]; // onAddItem notices, then onAddCharactorSlot per changed slot (Go order)
  changed: BagItem[];
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

@Injectable()
export class QuestRewardService {
  private readonly logger = new Logger(QuestRewardService.name);

  constructor(
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
  ) {}

  /** Quà slot views for the quest panel (every row; the client filters CLASS mode by its own class like QuestCanvas). */
  async views(qid: number): Promise<QuestAward[]> {
    const rows = this.gameData.questAwards(qid);
    if (rows.length === 0) return [];
    const tpls = await this.templatesOf(rows);
    return rows.map((r) => {
      if (r.kind === QuestAwardKind.PET || r.type === PET_TABLE) {
        return this.view(r, this.gameData.creature(r.itemId)?.name ?? `#${r.itemId}`, '0', 0, '');
      }
      const tpl = tpls(r);
      const name = awardName(r, str(tpl?.name) || `#${r.itemId}`);
      return this.view(r, name, str(tpl?.icon_code) || '0', awardColor(r, Number(tpl?.color_code ?? 0)), str(tpl?.req_class));
    });
  }

  /**
   * Bag grants a finish will make. Throws FORBIDDEN 'Vui lòng chọn 1 phần thưởng!' when a choose-one quest has no pick.
   * Rows with a missing template are skipped (Go logs and skips them).
   */
  async plan(tpl: QuestTemplate, classId: number, selectId: number): Promise<PlannedAward[]> {
    const rows = this.gameData.questAwards(tpl.id);
    if (rows.length === 0) return [];
    const tpls = await this.templatesOf(rows);
    const picked = pickAwards(tpl.at, rows, selectId, classId, (r) => str(tpls(r)?.req_class));
    if (!picked) throw RpcException.forbidden('Vui lòng chọn 1 phần thưởng!');
    const out: PlannedAward[] = [];
    for (const r of picked) {
      if (r.kind !== QuestAwardKind.ITEM || r.type === PET_TABLE || r.num <= 0) {
        this.logger.warn(`quest ${tpl.id}: award row ${r.id} (kind ${r.kind}, type ${r.type}) is not granted yet`);
        continue;
      }
      const row = tpls(r);
      if (!row) {
        this.logger.warn(`quest ${tpl.id}: award row ${r.id} has no template ${r.type}/${r.itemId}`);
        continue;
      }
      const equip = r.type === EQUIP_TABLE;
      const itemType = equip ? ItemKind.EQUIP : ItemKind.ITEM;
      out.push({
        spec: {
          templateId: r.itemId, itemType, bound: true, color: awardColor(r, Number(row.color_code ?? 0)), amount: r.num,
          maxStack: maxStack(row),
        },
        durability: equip ? Number(row.endure_max ?? 0) || 0 : 0,
        notice: { i: r.itemId, q: r.num, t: itemType, n: awardName(r, str(row.name) || `#${r.itemId}`) },
      });
    }
    return out;
  }

  canFit(characterId: number, plan: readonly PlannedAward[]): Promise<boolean> {
    return this.inventory.canFitAll(characterId, plan.map((p) => p.spec));
  }

  /** Adds the planned rewards (call under the character lock, after canFit). A failed grant is logged, like Go. */
  async grant(characterId: number, plan: readonly PlannedAward[]): Promise<GrantedAwards> {
    const notices: Push[] = [];
    const changed: BagItem[] = [];
    for (const p of plan) {
      try {
        changed.push(...(await this.inventory.add(characterId, p.spec, p.durability)));
        notices.push(push('onAddItem', p.notice));
      } catch (e) {
        this.logger.warn(`character ${characterId}: quest reward ${p.spec.templateId} not granted: ${(e as Error).message}`);
      }
    }
    return { pushes: [...notices, ...changed.map((item) => push('onAddCharactorSlot', item))], changed };
  }

  /** Accept-time item (data_tbl_quest.start_grant_item, unbound). A full bag skips it with a warning, like Go. */
  async grantStart(characterId: number, tpl: QuestTemplate): Promise<Push[]> {
    if (tpl.startGrantItem <= 0) return [];
    const row = await this.gameData.template(29, tpl.startGrantItem);
    if (!row) return [];
    const amount = tpl.startGrantQty > 0 ? tpl.startGrantQty : 1;
    const spec: AddSpec = {
      templateId: tpl.startGrantItem, itemType: ItemKind.ITEM, bound: false, color: 0, amount, maxStack: maxStack(row),
    };
    return withCharLock(characterId, async () => {
      if (!(await this.inventory.canFit(characterId, spec))) {
        this.logger.warn(`character ${characterId}: bag full, quest ${tpl.id} start item ${spec.templateId} skipped`);
        return [];
      }
      const changed = await this.inventory.add(characterId, spec);
      const notice: AddItemNotice = { i: spec.templateId, q: amount, t: ItemKind.ITEM, n: str(row.name) || `#${spec.templateId}` };
      return [push('onAddItem', notice), ...changed.map((item) => push('onAddCharactorSlot', item))];
    });
  }

  /** Item / equipment template rows of the award rows (two queries at most), looked up per row. */
  private async templatesOf(rows: readonly QuestAwardRow[]): Promise<(r: QuestAwardRow) => Row | undefined> {
    const ids = (equip: boolean): number[] =>
      [...new Set(rows.filter((r) => r.type !== PET_TABLE && (r.type === EQUIP_TABLE) === equip).map((r) => r.itemId))];
    const [equips, items] = await Promise.all([
      this.gameData.templatesByIds(EQUIP_TABLE, ids(true)),
      this.gameData.templatesByIds(29, ids(false)),
    ]);
    return (r) => (r.type === EQUIP_TABLE ? equips.get(r.itemId) : items.get(r.itemId));
  }

  private view(r: QuestAwardRow, name: string, iconCode: string, color: number, reqClass: string): QuestAward {
    return { id: r.id, kind: r.kind, type: r.type, itemId: r.itemId, num: r.num, q: r.q, name, iconCode, color, reqClass };
  }
}
