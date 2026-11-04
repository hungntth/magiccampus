// Magic weapon upgrade (mWeaponUpgrade, getSpiritRequire) and the H5 panel read (getMWPanel).
// Upgrade (H5 decision, phase E): each attempt costs the NEXT ladder row's `spirit_num` spirituality and `item_num` Pha Lê Thần Giới
// (template 4758), is paid whether or not the roll succeeds, and succeeds with probability `rate` percent. A success sets the level,
// the colour and the two main lines. Spend before credit: spirituality first, then the crystals (refunded if they cannot be taken).

import { Injectable } from '@nestjs/common';
import { MW_STONE_TID, mwColorByLevel, type MWPanelInfo, type MWSpiritRequire, type MWUpgradeReply } from '@mc/shared';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import type { Push } from '../inventory/pushes';
import { CurrencyService } from '../progression/currency.service';
import { MwItemsService } from './mw-items.service';
import {
  effectiveLines, isMainTemplate, parseFlag, planUpgrade, resetMax, rollUpgrade, skillMap, upgradedLines, type Rng,
} from './mw-rules';

export interface MwResult<R> {
  reply: R;
  pushes: Push[];
}

@Injectable()
export class MagicWeaponService {
  constructor(
    private readonly mwItems: MwItemsService,
    private readonly gameData: GameDataService,
    private readonly currencies: CurrencyService,
    private readonly characters: CharacterService,
  ) {}

  async spiritRequire(characterId: number, equipId: number): Promise<MWSpiritRequire> {
    const { row, tpl } = await this.mwItems.load(characterId, equipId);
    const next = isMainTemplate(tpl) ? this.gameData.artifactRow(row.templateId, row.star + 1) : undefined;
    if (!next) return { value: 0 };
    return { value: next.spirit, rate: next.rate, itemNum: next.itemNum, itemHave: await this.mwItems.stoneCount(characterId, MW_STONE_TID.crystal) };
  }

  upgrade(characterId: number, equipId: number, rng: Rng = Math.random): Promise<MwResult<MWUpgradeReply>> {
    return withCharLock(characterId, () => this.doUpgrade(characterId, equipId, rng));
  }

  private async doUpgrade(characterId: number, equipId: number, rng: Rng): Promise<MwResult<MWUpgradeReply>> {
    const { row, tpl } = await this.mwItems.load(characterId, equipId);
    const char = await this.characters.getById(characterId);
    const plan = planUpgrade({
      main: isMainTemplate(tpl), bound: row.isBound, star: row.star, playerLevel: char.level,
      spirituality: await this.currencies.balance(characterId, 'spirituality'),
      crystals: await this.mwItems.stoneCount(characterId, MW_STONE_TID.crystal),
      next: this.gameData.artifactRow(row.templateId, row.star + 1),
    });
    if (!plan.ok) return { reply: { succ: false, failType: plan.failType, msg: plan.msg }, pushes: [] };
    const next = plan.row;
    if ((await this.currencies.spend(characterId, 'spirituality', next.spirit)) === null) {
      return { reply: { succ: false, failType: 1, msg: 'Điểm thần tu không đủ.' }, pushes: [] };
    }
    let crystals: Awaited<ReturnType<MwItemsService['takeStones']>>;
    try {
      crystals = await this.mwItems.takeStones(characterId, MW_STONE_TID.crystal, next.itemNum);
    } catch (e) {
      await this.currencies.credit(characterId, 'spirituality', next.spirit);
      throw e;
    }
    const pushes: Push[] = [...crystals.pushes];
    const after = this.gameData.artifactRow(row.templateId, next.level + 1);
    if (!rollUpgrade(next.rate, rng)) {
      pushes.push(await this.mwItems.walletPush(characterId), ...(await this.mwItems.statPushes(characterId)));
      const msg = `Thăng cấp thất bại! Đã tiêu hao ${next.spirit} thần tu và ${next.itemNum} Pha Lê Thần Giới (tỉ lệ ${next.rate}%).`;
      return { reply: { succ: false, failType: 1, msg, rolled: true, level: row.star, require: next.spirit }, pushes };
    }
    const lines = upgradedLines(effectiveLines(tpl, row.properties), tpl, next);
    const color = mwColorByLevel(next.level);
    await this.mwItems.patch(
      characterId, equipId,
      { mainProp1: lines.prop1, mainProp2: lines.prop2, mainPropNum1: lines.num1, mainPropNum2: lines.num2 },
      { star: next.level, colorCode: color },
    );
    pushes.push(...(await this.mwItems.slotPush(characterId, equipId)), await this.mwItems.walletPush(characterId));
    pushes.push(...(await this.mwItems.statPushes(characterId)));
    return { reply: { succ: true, level: next.level, require: after?.spirit ?? 0, color }, pushes };
  }

  /** getMWPanel (H5): every number the operation tabs show for one weapon. */
  async panel(characterId: number, equipId: number): Promise<MWPanelInfo> {
    const { row, tpl, worn } = await this.mwItems.load(characterId, equipId);
    const props = row.properties ?? {};
    const lines = effectiveLines(tpl, props);
    const main = isMainTemplate(tpl);
    const max = resetMax(tpl);
    const next = main ? this.gameData.artifactRow(row.templateId, row.star + 1) : undefined;
    const pool = this.gameData.mwSkills();
    const skills = Object.entries(skillMap(tpl, props)).map(([pos, sid]) => ({
      pos: Number(pos), sid, name: pool.get(sid)?.name ?? `#${sid}`, description: pool.get(sid)?.description ?? '',
    }));
    const count = (tid: number): Promise<number> => this.mwItems.stoneCount(characterId, tid);
    return {
      equipId, tid: row.templateId, name: String(tpl.name ?? `#${row.templateId}`), main, position: Number(tpl.position ?? 0), worn,
      binded: row.isBound, level: row.star, color: row.colorCode, durability: row.durability, maxDurability: row.maxDurability,
      mainProp1: lines.prop1, mainProp2: lines.prop2, mainPropNum1: lines.num1, mainPropNum2: lines.num2,
      tplPropNum1: max.num1 / 2, tplPropNum2: max.num2 / 2,
      next: next ? { level: next.level, spirit: next.spirit, itemNum: next.itemNum, rate: next.rate, propNum1: next.propNum1, propNum2: next.propNum2 } : null,
      skills, flag: parseFlag(props.flag),
      spirituality: await this.currencies.balance(characterId, 'spirituality'),
      stones: {
        repair: await count(MW_STONE_TID.repair), skillReset: await count(MW_STONE_TID.skillReset), trans: await count(MW_STONE_TID.trans),
        propReset: await count(MW_STONE_TID.propReset), crystal: await count(MW_STONE_TID.crystal),
      },
    };
  }
}
