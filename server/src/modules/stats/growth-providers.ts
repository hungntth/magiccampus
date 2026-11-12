// Stat providers of the M13 phase E2 gear-growth systems: worn medals (character side), the stone seal of the worn gear and the Ma Tâm hearts / combines;
// phase F Mật Bảo collection; phase G guarding Tiểu Tinh Linh (five attributes + passive skill buffs).
// Models and pure rules only (no feature services), so StatsModule stays free of cycles. The pet side of the medals is MedalPetService (PetStatRegistry).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { fairyGuardStats, heartPropTotals, heartStatLines } from '@mc/shared';
import { buffBonuses } from '../buff/buff-stats';
import { BUFF_PROP, EQUIP_PROP, emptyBonuses, mergeBonuses, type Bonuses } from '../character/character-stats';
import { passiveBuffIds } from '../fairy/fairy-skills';
import { FAIRY_FEATURE_KEY, guardFairy, parseFairyState } from '../fairy/fairy-state';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { MEDAL_FEATURE_KEY, parseMedal } from '../medal/medal-state';
import { medalBonuses, wornRows } from '../medal/medal-stats';
import { collectedRows, collectionTotals } from '../mystery/mystery-rules';
import { MYSTERY_FEATURE_KEY, parseMystery } from '../mystery/mystery-state';
import { MONSTER_HEART_FEATURE_KEY, parseMonsterHeart } from '../monsterheart/monsterheart-state';
import { runeBonuses } from '../rune/rune-stats';
import { loadSealContext } from '../stoneseal/stoneseal-loader';
import { sealBonuses } from '../stoneseal/stoneseal-stats';
import { STONE_SEAL_FEATURE_KEY, parseStoneSeal } from '../stoneseal/stoneseal-state';
import { CharacterFeature } from '../progression/feature.schema';
import type { StatBonusProvider } from './stat-provider';

abstract class GrowthProvider implements StatBonusProvider {
  abstract readonly key: string;
  protected abstract readonly featureKey: string;

  constructor(
    private readonly features: Model<CharacterFeature>,
    protected readonly gameData: GameDataService,
  ) {}

  protected async state(characterId: number): Promise<Record<string, unknown> | undefined> {
    return (await this.features.findOne({ characterId, featureKey: this.featureKey }, { state: 1 }).lean())?.state;
  }

  abstract bonuses(characterId: number): Promise<Bonuses>;
}

/** Worn character medals (2001..2005) + the engrave line computed from them (Go statfeature/medal_stats.go). */
@Injectable()
export class MedalBonusProvider extends GrowthProvider {
  readonly key = 'medal';
  protected readonly featureKey = MEDAL_FEATURE_KEY;
  constructor(@InjectModel(CharacterFeature.name) features: Model<CharacterFeature>, gameData: GameDataService) {
    super(features, gameData);
  }

  async bonuses(characterId: number): Promise<Bonuses> {
    const state = parseMedal(await this.state(characterId));
    return medalBonuses(wornRows(state, 'char', (id) => this.gameData.medal(id), this.gameData.medalLines()), BUFF_PROP);
  }
}

/** Stones of the Ấn Thạch holes of worn equipment + the gem / stone add lines (Go statfeature/stoneseal_stats.go). */
@Injectable()
export class StoneSealBonusProvider extends GrowthProvider {
  readonly key = 'stoneSeal';
  protected readonly featureKey = STONE_SEAL_FEATURE_KEY;
  constructor(
    @InjectModel(CharacterFeature.name) features: Model<CharacterFeature>,
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    gameData: GameDataService,
  ) {
    super(features, gameData);
  }

  async bonuses(characterId: number): Promise<Bonuses> {
    const state = parseStoneSeal(await this.state(characterId));
    if (Object.values(state).every((s) => Object.keys(s.holes).length === 0)) return runeBonuses(new Map(), BUFF_PROP);
    const ctx = await loadSealContext(this.items, this.gameData, characterId, state);
    return sealBonuses(state, ctx.worn, ctx.itemOf);
  }
}

/** Placed hearts and active combines (Go statfeature/monster_heart_stats.go): flat stats round after summing, rate stats stay fractional. */
@Injectable()
export class MonsterHeartBonusProvider extends GrowthProvider {
  readonly key = 'monsterHeart';
  protected readonly featureKey = MONSTER_HEART_FEATURE_KEY;
  constructor(@InjectModel(CharacterFeature.name) features: Model<CharacterFeature>, gameData: GameDataService) {
    super(features, gameData);
  }

  async bonuses(characterId: number): Promise<Bonuses> {
    const g = this.gameData;
    const state = parseMonsterHeart(await this.state(characterId));
    const lines = heartStatLines(state.data, { heart: (id) => g.heart(id), combine: (id) => g.heartCombine(id), contain: (id) => g.heartContain(id) });
    return runeBonuses(heartPropTotals(lines), BUFF_PROP);
  }
}

/** Mật Bảo collection (Thu Thập, Go mysterytreasure/collection.go): every piece ever owned counts once; flat prop_num by prop_type through the equipment prop table. */
@Injectable()
export class MysteryBonusProvider extends GrowthProvider {
  readonly key = 'mystery';
  protected readonly featureKey = MYSTERY_FEATURE_KEY;
  constructor(@InjectModel(CharacterFeature.name) features: Model<CharacterFeature>, gameData: GameDataService) {
    super(features, gameData);
  }

  async bonuses(characterId: number): Promise<Bonuses> {
    const state = parseMystery(await this.state(characterId));
    return runeBonuses(collectionTotals(collectedRows(state, (id) => this.gameData.mystre(id))), EQUIP_PROP);
  }
}

/**
 * Guarding Tiểu Tinh Linh (Go fairy/guard.go + guard_skills.go): Nhẫn / Lực / Xảo / Trí / Thần = round(eff x (base + (lv - 1) x (growth + 0.2 g))) as
 * flat attribute points, plus the TBL_BUFF row of each learned passive (type 11) skill, one per family at its highest level. A resting fairy gives nothing.
 */
@Injectable()
export class FairyBonusProvider extends GrowthProvider {
  readonly key = 'fairy';
  protected readonly featureKey = FAIRY_FEATURE_KEY;
  constructor(@InjectModel(CharacterFeature.name) features: Model<CharacterFeature>, gameData: GameDataService) {
    super(features, gameData);
  }

  async bonuses(characterId: number): Promise<Bonuses> {
    const f = guardFairy(parseFairyState(await this.state(characterId)));
    const b = emptyBonuses();
    if (!f) return b;
    const a = fairyGuardStats(f);
    b.attr.sta += a.sta;
    b.attr.str += a.ste;
    b.attr.agi += a.agi;
    b.attr.int += a.inte;
    b.attr.eng += a.ener;
    const buffs = passiveBuffIds(f, (id) => this.gameData.skill(id)).map((id) => this.gameData.getBuff(id)).filter((r) => r !== undefined);
    return mergeBonuses(b, buffBonuses(buffs));
  }
}
