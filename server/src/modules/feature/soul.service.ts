// Train soul (Luyện Hồn): trainSoul spends Kết Tinh Thần Bí 1:1 into the exp of the current level (soul-rules.ts). The crystals are
// spent first (conditional $inc) and given back when the state write fails. Pushes: onUPP currencies + stat refresh.

import { Injectable } from '@nestjs/common';
import { TRAIN_SOUL, type TrainSoulInfo, type TrainSoulResult } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CurrencyService } from '../progression/currency.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { FeatureCommonService, refuse } from './feature-common.service';
import { FEATURE_KEYS, parseSoul } from './feature-state';
import { applySoul, soulGain, soulGate } from './soul-rules';

@Injectable()
export class SoulService {
  constructor(
    private readonly store: FeatureStoreService,
    private readonly currencies: CurrencyService,
    private readonly characters: CharacterService,
    private readonly gameData: GameDataService,
    private readonly common: FeatureCommonService,
  ) {}

  /** H5 getTrainSoulInfo: the panel view (bar, current / next level rows). */
  async info(characterId: number): Promise<TrainSoulInfo> {
    const s = parseSoul(await this.store.get(characterId, FEATURE_KEYS.soul, {}));
    const maxed = s.lvl >= TRAIN_SOUL.MAX_LEVEL;
    return {
      soulLvl: s.lvl, soulExp: s.exp, maxed,
      need: maxed ? 0 : (this.gameData.soulRow(s.lvl + 1)?.requireNum ?? 0),
      current: this.gameData.soulRow(s.lvl)?.props ?? [],
      next: maxed ? [] : (this.gameData.soulRow(s.lvl + 1)?.props ?? []),
    };
  }

  train(session: Session): Promise<TrainSoulResult> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const level = (await this.characters.getById(cid)).level;
      const state = parseSoul(await this.store.get(cid, FEATURE_KEYS.soul, {}));
      const held = await this.currencies.balance(cid, 'mysteryCrystal');
      const note = soulGate(level, state, held);
      if (note) refuse(note);
      const need = this.gameData.soulRow(state.lvl + 1)?.requireNum ?? 0;
      const gain = soulGain(held, need, state.exp);
      if (gain <= 0) refuse('Thiếu dữ liệu Luyện Hồn');
      if ((await this.currencies.spend(cid, 'mysteryCrystal', gain)) === null) refuse('Kết Tinh Thần Bí không đủ');
      const next = applySoul(state, gain, need);
      try {
        await this.store.put(cid, FEATURE_KEYS.soul, { ...next });
      } catch (e) {
        await this.currencies.credit(cid, 'mysteryCrystal', gain);
        throw e;
      }
      await this.common.push(session, { currencies: true });
      return { soulLvl: next.lvl, soulExp: next.exp };
    });
  }
}
