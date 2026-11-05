// Persistence of the PPVE state (character feature `pet_pve`): load with the daily reset applied in memory, full-document save and the
// onUpdatePPVEPanel push. Callers hold the character lock (withCharLock is not reentrant), so read-modify-write is safe.

import { Injectable } from '@nestjs/common';
import type { PPVEConfig, PPVEState } from '@mc/shared';
import { dayKey } from '@mc/shared';
import { push, type Push } from '../inventory/pushes';
import { FeatureStoreService } from '../progression/feature-store.service';
import { applyDailyReset, kpDataOf, normalizePpve, ppveDataOf, PPVE_FEATURE } from './ppve-rules';

export interface LoadedPpve {
  state: PPVEState;
  /** The daily reset changed the state (not yet saved). */
  reset: boolean;
}

@Injectable()
export class PpveStateService {
  /** Clock, swappable for tests / tools. */
  now: () => number = Date.now;

  constructor(private readonly features: FeatureStoreService) {}

  today(): string {
    return dayKey(this.now());
  }

  async load(characterId: number): Promise<LoadedPpve> {
    const state = normalizePpve(await this.features.get(characterId, PPVE_FEATURE, {}));
    return { state, reset: applyDailyReset(state, this.today()) };
  }

  save(characterId: number, state: PPVEState): Promise<void> {
    return this.features.put(characterId, PPVE_FEATURE, { ...state });
  }

  /** onUpdatePPVEPanel(kpData, ppveData, config | null, clear): `config` is echoed after savePPVEConf (the client toasts "Cai dat thanh cong"). */
  panelPush(state: PPVEState, config: PPVEConfig | null = null): Push {
    return push('onUpdatePPVEPanel', kpDataOf(state), ppveDataOf(state), config, false);
  }

  /** The login field `petPVEData` (the ppveData half only). */
  async loginData(characterId: number): Promise<ReturnType<typeof ppveDataOf>> {
    return ppveDataOf((await this.load(characterId)).state);
  }
}
