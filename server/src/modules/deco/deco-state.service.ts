// Load / save of the Hồn Khí state document (feature store key `deco`). Callers hold withCharLock; refusals and pushes live in DecoService.

import { Injectable } from '@nestjs/common';
import { FeatureStoreService } from '../progression/feature-store.service';
import { DECO_FEATURE_KEY, parseDeco, type DecoState } from './deco-state';

@Injectable()
export class DecoStateService {
  constructor(private readonly store: FeatureStoreService) {}

  async load(characterId: number): Promise<DecoState> {
    return parseDeco(await this.store.get(characterId, DECO_FEATURE_KEY, {}));
  }

  save(characterId: number, state: DecoState): Promise<void> {
    return this.store.put(characterId, DECO_FEATURE_KEY, { pos: state.pos });
  }
}
