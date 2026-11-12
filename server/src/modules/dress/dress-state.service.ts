// Load / save of the Tủ Đồ state document (feature store key `dress`) with the UTC+7 daily reset. Callers hold withCharLock; refusals
// and pushes live in DressService / DressDrawService.

import { Injectable } from '@nestjs/common';
import { dayKey } from '@mc/shared';
import { FeatureStoreService } from '../progression/feature-store.service';
import { DRESS_FEATURE_KEY, parseDress, rollover, type DressState } from './dress-state';

@Injectable()
export class DressStateService {
  /** Replaceable in tests. */
  now: () => number = Date.now;

  constructor(private readonly store: FeatureStoreService) {}

  /** The stored state with today's reset applied (not persisted: `save` it when the caller mutates anyway). */
  async load(characterId: number): Promise<DressState> {
    return rollover(parseDress(await this.store.get(characterId, DRESS_FEATURE_KEY, {})), dayKey(this.now()));
  }

  save(characterId: number, state: DressState): Promise<void> {
    return this.store.put(characterId, DRESS_FEATURE_KEY, { ...state });
  }
}
