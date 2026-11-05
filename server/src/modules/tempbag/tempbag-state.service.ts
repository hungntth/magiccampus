// Túi Tiện Dụng state reads: the character's holders / dire flag, capacity (holders + VIP right 5 + Ma Tâm base), the rows of each
// sub-bag keyed by posId and the `tBag` payload (login snapshot, getTBag, updateTempBags, tempBagSort / mxBagSort reply).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { SlotType, TEMP_BAG, rightValue, tempIndex, tempPos, type TBag, type TempSlotData, type TempSubBag } from '@mc/shared';
import { Character, type TempBagState } from '../character/character.schema';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { toBagItem } from '../inventory/bag-mapping';
import { maxStack } from '../inventory/bag-rules';
import { CharacterItem } from '../inventory/character-item.schema';
import { PmStateService } from '../vip/pm-state.service';
import { capacityOf, holderExpired, sectionOf, type TempRow } from './tempbag-rules';

type ItemDoc = Pick<CharacterItem, '_id' | 'slotIndex' | 'templateId' | 'itemType' | 'isBound' | 'colorCode' | 'stackCount'>;

/** Legacy {t, n, b, c} of a stack (no H5 display row). */
const legacySlot = (d: Pick<CharacterItem, 'templateId' | 'stackCount' | 'isBound' | 'colorCode'>): TempSlotData => ({
  t: d.templateId, n: d.stackCount, b: d.isBound ? 1 : 0, c: d.colorCode,
});

@Injectable()
export class TempBagStateService {
  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly pm: PmStateService,
  ) {}

  private readonly templates = new Map<number, Row | undefined>();

  private async tpl(tid: number): Promise<Row | undefined> {
    if (!this.templates.has(tid)) this.templates.set(tid, await this.gameData.template(29, tid));
    return this.templates.get(tid);
  }

  /** Slot payload of a row: the legacy {t, n, b, c} plus the H5 display row (templates are static, cached). */
  async slot(d: ItemDoc): Promise<TempSlotData> {
    const item = toBagItem(
      { ...d, characterId: 0, slotType: SlotType.TEMP_BAG, durability: 0, maxDurability: 0, properties: {}, star: 0 },
      await this.tpl(d.templateId),
    );
    return { ...legacySlot(d), item };
  }

  /** Slot payload of a planner row of one sub-bag. */
  slotRow(r: TempRow, mx: boolean): Promise<TempSlotData> {
    return this.slot({ _id: r.id, slotIndex: tempIndex(mx, r.pos), templateId: r.templateId, itemType: r.itemType, isBound: r.isBound, colorCode: r.colorCode, stackCount: r.stackCount });
  }

  async state(cid: number): Promise<TempBagState> {
    const doc = await this.chars.findById(cid, { tempBag: 1 }).lean();
    return doc?.tempBag ?? {};
  }

  /** Extra normal-bag slots of the active PM level (data_tbl_pm_right id 5, value2..9 = 6..48), 0 without PM. */
  async vipBonus(cid: number): Promise<number> {
    const level = await this.pm.levelOf(cid);
    if (level < 1) return 0;
    const right = (await this.pm.rights()).find((r) => r.id === TEMP_BAG.VIP_RIGHT);
    return right ? Math.max(rightValue(right, level) ?? 0, 0) : 0;
  }

  async capacity(cid: number, mx: boolean, state?: TempBagState): Promise<number> {
    const st = state ?? (await this.state(cid));
    return capacityOf(mx, sectionOf(mx ? st.mx : st.n), mx ? 0 : await this.vipBonus(cid), Date.now());
  }

  /** Rows of one sub-bag as planner rows keyed by posId (stack limits from the templates). */
  async rows(cid: number, mx: boolean): Promise<TempRow[]> {
    const docs = await this.items.find({ characterId: cid, slotType: SlotType.TEMP_BAG }).lean();
    return this.toRows(docs, mx);
  }

  /** Items held in one sub-bag (curNum). */
  async count(cid: number, mx: boolean): Promise<number> {
    const docs = await this.items.find({ characterId: cid, slotType: SlotType.TEMP_BAG }, { slotIndex: 1 }).lean();
    return docs.filter((d) => tempPos(d.slotIndex)?.mx === mx).length;
  }

  async toRows(docs: readonly ItemDoc[], mx: boolean): Promise<TempRow[]> {
    const mine = docs.filter((d) => {
      const p = tempPos(d.slotIndex);
      return p !== null && p.mx === mx;
    });
    const tpls = await this.gameData.templatesByIds(29, [...new Set(mine.map((d) => d.templateId))]);
    return mine.map((d) => ({
      id: d._id, pos: tempPos(d.slotIndex)!.pos, templateId: d.templateId, itemType: d.itemType, isBound: d.isBound,
      colorCode: d.colorCode, stackCount: d.stackCount, maxStack: d.itemType === 1 ? maxStack(tpls.get(d.templateId)) : 1,
    }));
  }

  /** The full `tBag` payload (legacy BuildTBagPayload). */
  async payload(cid: number): Promise<TBag> {
    const [state, docs, bonus] = await Promise.all([
      this.state(cid), this.items.find({ characterId: cid, slotType: SlotType.TEMP_BAG }).lean(), this.vipBonus(cid),
    ]);
    const now = Date.now();
    const section = async (mx: boolean): Promise<TempSubBag> => {
      const sec = sectionOf(mx ? state.mx : state.n);
      const cap = capacityOf(mx, sec, mx ? 0 : bonus, now);
      const tempList: TempSubBag['tempList'] = {};
      let cur = 0;
      for (const d of docs) {
        const p = tempPos(d.slotIndex);
        if (!p || p.mx !== mx) continue;
        tempList[String(p.pos)] = await this.slot(d);
        cur++;
      }
      const tempBag: TempSubBag['tempBag'] = {};
      for (const [key, h] of Object.entries(sec.holders)) {
        if (h.tid <= 0) continue;
        const tpl = await this.tpl(h.tid);
        tempBag[key] = {
          tid: h.tid, t: h.exp, ot: holderExpired(h, now) ? 1 : 0, name: tpl?.name ? String(tpl.name) : '#' + h.tid,
          iconCode: tpl?.icon_code ? String(tpl.icon_code) : '0', slots: h.num,
        };
      }
      return { tempList, tempBag, tempSlotNum: cap, tempbagNum: sec.opened, curNum: cur, ot: cur >= cap ? 1 : 0 };
    };
    return { ...(await section(false)), dire: state.dire ? 1 : 0, mx: await section(true) };
  }
}
