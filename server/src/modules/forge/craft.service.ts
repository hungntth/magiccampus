// Equipment crafting (legacy craft.go R24-R27): recipe list (makable equipment templates), getMakeColor preview and
// newMake. Materials are consumed before the roll and also on failure; the result is rolled with quality-roll.ts.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ItemKind, MAX_MATERIAL_COLOR, SlotType, type GetMakeColorReply, type MakeRecipe, type MaterialRefs,
} from '@mc/shared';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { maxStack } from '../inventory/bag-rules';
import { push, type Push } from '../inventory/pushes';
import { colorOfQuality, craftRates, qualityOf, rollBucket, rollPrefix, type MaterialInfo, type Rates, type Rng } from './craft-rules';
import { ForgeItemsService } from './forge-items.service';
import { rollCraftedProperties } from './quality-roll';

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

interface Picked {
  row: CharacterItem;
  need: number;
  info: MaterialInfo;
}

export interface MakeResult {
  flag: boolean;
  pushes: Push[];
  /** Player-visible reason when the craft did not produce an item. */
  note?: string;
}

@Injectable()
export class CraftService {
  private recipeList: MakeRecipe[] | null = null;

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly forgeItems: ForgeItemsService,
  ) {}

  /** Recipes with their materials (H5 `getMakeRecipes`), built once. */
  async recipes(): Promise<MakeRecipe[]> {
    if (this.recipeList) return this.recipeList;
    const rows = await this.gameData.makableEquipment();
    const matIds = new Set<number>();
    for (const r of rows) for (const k of [1, 2, 3]) if (int(r[`require_item${k}`]) > 0) matIds.add(int(r[`require_item${k}`]));
    const mats = await this.gameData.templatesByIds(29, [...matIds]);
    this.recipeList = rows.map((r) => ({
      tid: int(r.id), name: String(r.name ?? `#${r.id}`), iconCode: r.icon_code ? String(r.icon_code) : '0', type: int(r.type),
      position: int(r.position), reqLevel: int(r.req_level), reqClass: r.req_class ? String(r.req_class) : '',
      color: int(r.color),
      materials: [1, 2, 3].filter((k) => int(r[`require_item${k}`]) > 0).map((k) => {
        const tid = int(r[`require_item${k}`]);
        const m = mats.get(tid);
        return {
          slot: k, tid, name: String(m?.name ?? `#${tid}`), iconCode: m?.icon_code ? String(m.icon_code) : '0',
          num: int(r[`require_num${k}`]),
        };
      }),
    }));
    return this.recipeList;
  }

  async preview(characterId: number, refs: MaterialRefs, equipTid: number): Promise<GetMakeColorReply> {
    const tpl = await this.gameData.template(19, equipTid);
    if (!tpl || int(tpl.makable) !== 1) return { canMake: false, flag: 0 };
    const picked = await this.pick(characterId, refs, tpl);
    if (!picked) return { canMake: false, flag: 0 };
    const rates = craftRates(picked.map((p) => p.info), int(tpl.req_level), this.gameData.recipePlan(equipTid));
    if (rates === 'blocked') return { canMake: false, flag: 1 };
    return { canMake: true, colorPerList: { makePer1: rates[0], makePer2: rates[1], makePer3: rates[2], makePer4: rates[3] }, flag: 0 };
  }

  make(characterId: number, maker: string, refs: MaterialRefs, equipTid: number, rng: Rng = Math.random): Promise<MakeResult> {
    return withCharLock(characterId, () => this.doMake(characterId, maker, refs, equipTid, rng));
  }

  private async doMake(characterId: number, maker: string, refs: MaterialRefs, equipTid: number, rng: Rng): Promise<MakeResult> {
    const tpl = await this.gameData.template(19, equipTid);
    if (!tpl || int(tpl.makable) !== 1) return { flag: false, pushes: [], note: 'Không tìm thấy công thức.' };
    const picked = await this.pick(characterId, refs, tpl);
    if (!picked) return { flag: false, pushes: [], note: 'Vui lòng xác nhận số nguyên liệu đặt vào.' };
    const rates: Rates | 'blocked' = craftRates(picked.map((p) => p.info), int(tpl.req_level), this.gameData.recipePlan(equipTid));
    if (rates === 'blocked') return { flag: false, pushes: [], note: 'Chỉ có trang bị cấp 61 trở lên mới có thể dùng nguyên liệu cấp 6!' };
    const bucket = rollBucket(rates, rng);
    const bound = picked.some((p) => p.row.isBound);
    const spec = { templateId: equipTid, itemType: ItemKind.EQUIP, bound, color: bucket + 1, amount: 1, maxStack: maxStack(tpl) };
    const freed = picked.some((p) => p.row.stackCount === p.need);
    if (bucket > 0 && !freed && !(await this.inventory.canFit(characterId, spec))) {
      return { flag: false, pushes: [], note: 'Túi đồ đã đầy, cần ít nhất 1 chỗ trống.' };
    }
    const spent = await this.forgeItems.consume(characterId, picked.map((p) => ({ id: p.row._id, count: p.need })));
    if (bucket === 0) {
      return { flag: false, pushes: spent.pushes, note: 'Chế tạo thất bại! Nguyên liệu đã bị tiêu hao.' };
    }
    const prefix = rollPrefix(bucket, rates, rng);
    const quality = qualityOf(bucket, prefix);
    const props = rollCraftedProperties(tpl, quality, prefix, maker, rng);
    const created = await this.inventory.add(
      characterId, { ...spec, color: colorOfQuality(quality) }, int(tpl.endure_max), props,
    );
    const notice = { i: equipTid, q: 1, t: ItemKind.EQUIP, n: String(tpl.name ?? '') };
    return {
      flag: true,
      pushes: [...spent.pushes, push('onAddItem', notice), ...created.map((c) => push('onAddCharactorSlot', c))],
    };
  }

  /** Resolves the three material slots against the recipe; null when anything is missing, foreign or too small. */
  private async pick(characterId: number, refs: MaterialRefs, recipe: Row): Promise<Picked[] | null> {
    const out: Picked[] = [];
    const seen = new Set<number>();
    const wanted = [1, 2, 3].filter((k) => int(recipe[`require_item${k}`]) > 0);
    if (wanted.length === 0) return null;
    for (const k of wanted) {
      const ref = refs?.[String(k)];
      if (!ref || ref.tempBagFlag || !Number.isInteger(Number(ref.idx)) || seen.has(Number(ref.idx))) return null;
      seen.add(Number(ref.idx));
      const row = await this.items.findOne({ _id: Number(ref.idx), characterId, slotType: SlotType.BAG }).lean();
      const need = int(recipe[`require_num${k}`]);
      if (!row || row.itemType !== ItemKind.ITEM || row.templateId !== int(recipe[`require_item${k}`]) || row.stackCount < need) return null;
      out.push({ row, need, info: { colorCode: Math.min(MAX_MATERIAL_COLOR, row.colorCode), tplLevel: 0, tplColorCode: 0, tplColor: -1 } });
    }
    const tpls = await this.gameData.templatesByIds(29, out.map((p) => p.row.templateId));
    for (const p of out) {
      const t = tpls.get(p.row.templateId);
      p.info.tplLevel = int(t?.level) || int(t?.item_level);
      p.info.tplColorCode = int(t?.color_code);
      p.info.tplColor = int(t?.color ?? -1);
    }
    return out;
  }
}
