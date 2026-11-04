// Stat providers of the M7 phase C-D features, one per system: train soul (current level row), awakening (rows 1..level), war sprite
// (aggregated chains), magic crystal (16 pools), heiyaoshi (triangles + completion bonuses) and zodiac stars (add_value x addition). They read the character_features documents through the model only (the pure
// rules live in modules/feature/*-rules.ts), so StatsModule stays free of feature services.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Bonuses } from '../character/character-stats';
import { awakenBonuses } from '../feature/awaken-rules';
import { crystalBonuses } from '../feature/crystal-rules';
import { FEATURE_KEYS, parseAwaken, parseCrystals, parseSoul, parseWsp } from '../feature/feature-state';
import { computeBuff, heiyaoshiBonuses, parseHy } from '../feature/heiyaoshi-rules';
import { parseStars, starBonuses } from '../feature/zodiac-rules';
import { soulBonuses } from '../feature/soul-rules';
import { mountTables } from '../mount/mount-data';
import { MOUNT_FEATURE_KEY, mountBonuses, ownedDresses, parseMount } from '../mount/mount-rules';
import { PRA_FEATURE_KEY, parsePraTracks, praBonuses } from '../prabuff/prabuff-rules';
import { wspBonuses, wspTotals } from '../feature/warsprite-rules';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterFeature } from '../progression/feature.schema';
import type { StatBonusProvider } from './stat-provider';

abstract class FeatureProvider implements StatBonusProvider {
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

@Injectable()
export class SoulBonusProvider extends FeatureProvider {
  readonly key = 'trainSoul';
  protected readonly featureKey = FEATURE_KEYS.soul;
  constructor(@InjectModel(CharacterFeature.name) features: Model<CharacterFeature>, gameData: GameDataService) {
    super(features, gameData);
  }

  async bonuses(characterId: number): Promise<Bonuses> {
    return soulBonuses(this.gameData.soulRow(parseSoul(await this.state(characterId)).lvl));
  }
}

@Injectable()
export class AwakenBonusProvider extends FeatureProvider {
  readonly key = 'awakening';
  protected readonly featureKey = FEATURE_KEYS.awaken;
  constructor(@InjectModel(CharacterFeature.name) features: Model<CharacterFeature>, gameData: GameDataService) {
    super(features, gameData);
  }

  async bonuses(characterId: number): Promise<Bonuses> {
    return awakenBonuses(parseAwaken(await this.state(characterId)).level, (l) => this.gameData.awakenRow(l));
  }
}

@Injectable()
export class WarSpriteBonusProvider extends FeatureProvider {
  readonly key = 'warSprite';
  protected readonly featureKey = FEATURE_KEYS.warSprite;
  constructor(@InjectModel(CharacterFeature.name) features: Model<CharacterFeature>, gameData: GameDataService) {
    super(features, gameData);
  }

  async bonuses(characterId: number): Promise<Bonuses> {
    return wspBonuses(wspTotals(parseWsp(await this.state(characterId)), (id) => this.gameData.warSpriteRow(id)));
  }
}

@Injectable()
export class CrystalBonusProvider extends FeatureProvider {
  readonly key = 'magicCrystal';
  protected readonly featureKey = FEATURE_KEYS.crystal;
  constructor(@InjectModel(CharacterFeature.name) features: Model<CharacterFeature>, gameData: GameDataService) {
    super(features, gameData);
  }

  async bonuses(characterId: number): Promise<Bonuses> {
    return crystalBonuses(parseCrystals(await this.state(characterId)));
  }
}

@Injectable()
export class HeiyaoshiBonusProvider extends FeatureProvider {
  readonly key = 'heiyaoshi';
  protected readonly featureKey = FEATURE_KEYS.heiyaoshi;
  constructor(@InjectModel(CharacterFeature.name) features: Model<CharacterFeature>, gameData: GameDataService) {
    super(features, gameData);
  }

  async bonuses(characterId: number): Promise<Bonuses> {
    return heiyaoshiBonuses(computeBuff(this.gameData.heiyaoshiTables(), parseHy(await this.state(characterId))));
  }
}

@Injectable()
export class ZodiacBonusProvider extends FeatureProvider {
  readonly key = 'zodiacStars';
  protected readonly featureKey = FEATURE_KEYS.zodiac;
  constructor(@InjectModel(CharacterFeature.name) features: Model<CharacterFeature>, gameData: GameDataService) {
    super(features, gameData);
  }

  async bonuses(characterId: number): Promise<Bonuses> {
    const look = { byId: (id: number) => this.gameData.starTemplate(id), at: (t: number, l: number) => this.gameData.starTemplateAt(t, l) };
    return starBonuses(parseStars(await this.state(characterId)), look);
  }
}

@Injectable()
export class PrabuffBonusProvider extends FeatureProvider {
  readonly key = 'prabuff';
  protected readonly featureKey = PRA_FEATURE_KEY;
  constructor(@InjectModel(CharacterFeature.name) features: Model<CharacterFeature>, gameData: GameDataService) {
    super(features, gameData);
  }

  async bonuses(characterId: number): Promise<Bonuses> {
    return praBonuses(parsePraTracks(await this.state(characterId)));
  }
}

/** Mount percents of the evolution rank and the worn skin, only while riding (useDress set and still owned). */
@Injectable()
export class MountBonusProvider extends FeatureProvider {
  readonly key = 'mount';
  protected readonly featureKey = MOUNT_FEATURE_KEY;
  constructor(@InjectModel(CharacterFeature.name) features: Model<CharacterFeature>, gameData: GameDataService) {
    super(features, gameData);
  }

  async bonuses(characterId: number): Promise<Bonuses> {
    const state = parseMount(await this.state(characterId));
    if (state.useDress <= 0) return mountBonuses(undefined, undefined);
    const t = await mountTables(this.gameData);
    if (!ownedDresses(state, t.rows, Date.now()).has(state.useDress)) return mountBonuses(undefined, undefined);
    return mountBonuses(t.rows.find((r) => r.type === 2 && r.level === state.upLv), t.dresses.get(state.useDress));
  }
}
