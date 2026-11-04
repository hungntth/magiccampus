// Feature store access: get / put / patch / list of the per-character state documents (character_features).
// `patch` writes dotted `state.<field>` paths so concurrent patches of different fields do not overwrite each other.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CharacterFeature } from './feature.schema';
import { statePatch, type FeatureState } from './feature-rules';

@Injectable()
export class FeatureStoreService {
  constructor(@InjectModel(CharacterFeature.name) private readonly features: Model<CharacterFeature>) {}

  async get<T extends FeatureState>(characterId: number, featureKey: string, fallback: T): Promise<T> {
    const row = await this.features.findOne({ characterId, featureKey }).lean();
    return row ? ({ ...fallback, ...row.state } as T) : fallback;
  }

  async put(characterId: number, featureKey: string, state: FeatureState): Promise<void> {
    await this.features.updateOne({ characterId, featureKey }, { $set: { state } }, { upsert: true });
  }

  async patch(characterId: number, featureKey: string, fields: FeatureState): Promise<void> {
    await this.features.updateOne({ characterId, featureKey }, { $set: statePatch(fields) }, { upsert: true });
  }

  async list(characterId: number): Promise<Record<string, FeatureState>> {
    const rows = await this.features.find({ characterId }).lean();
    return Object.fromEntries(rows.map((r) => [r.featureKey, r.state]));
  }

  async remove(characterId: number, featureKey: string): Promise<void> {
    await this.features.deleteOne({ characterId, featureKey });
  }
}
