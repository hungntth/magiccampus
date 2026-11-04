// Magic crystal (Pháp Tinh): the 16 pools in the feature store and the four mutations. Dust / crystals are spent first (conditional
// $inc), the pool is persisted, then refunds (Recovery) are credited; a failed write gives the spend back. The Flash client has null
// responders and never re-polls, so every mutation pushes onInitMagicCrystalData (+ onUPP currencies, stat refresh).

import { Injectable } from '@nestjs/common';
import type { CrystalSlot, CurrencyKey, MagicCrystalData } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { withCharLock } from '../inventory/char-lock';
import { CurrencyService } from '../progression/currency.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { addPower, activate, levelUp, recover, type CrystalOutcome } from './crystal-rules';
import { FeatureCommonService, refuse } from './feature-common.service';
import { FEATURE_KEYS, parseCrystals } from './feature-state';

const SHORT: Partial<Record<CurrencyKey, string>> = {
  magiccystalrec: 'Bụi Ảo Năng không đủ', magiccystalpre: 'Pha Lê Vĩnh Hằng không đủ', magiccystallimit: 'Pha Lê Cực Hạn không đủ',
};

@Injectable()
export class CrystalService {
  constructor(
    private readonly store: FeatureStoreService,
    private readonly currencies: CurrencyService,
    private readonly common: FeatureCommonService,
  ) {}

  async data(cid: number): Promise<MagicCrystalData> {
    return parseCrystals(await this.store.get(cid, FEATURE_KEYS.crystal, {}));
  }

  /** initMagicCrystalData: the reply IS the onInitMagicCrystalData push. */
  async init(session: Session): Promise<MagicCrystalData> {
    const data = await this.data(session.characterId!);
    session.callback('onInitMagicCrystalData', data);
    return data;
  }

  activate = (s: Session, index: number): Promise<void> => this.mutate(s, index, (i, c) => activate(i, c));
  levelUp = (s: Session, index: number): Promise<void> => this.mutate(s, index, (i, c) => levelUp(i, c));
  recover = (s: Session, index: number): Promise<void> => this.mutate(s, index, (i, c) => recover(i, c));
  addPower = (s: Session, index: number, amount: number, type: string): Promise<void> =>
    this.mutate(s, index, (i, c) => addPower(i, c, amount, type));

  private mutate(session: Session, index: number, rule: (index: number, c: CrystalSlot) => CrystalOutcome): Promise<void> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const data = await this.data(cid);
      const out = rule(index, data[String(index)] ?? { a: 0, max: 0, l: 0, s: 0, lv: 0 });
      if (!out.ok) return refuse(out.note);
      const spent: [CurrencyKey, number][] = [];
      const refunds: [CurrencyKey, number][] = [];
      for (const [key, n] of Object.entries(out.change.spend) as [CurrencyKey, number][]) {
        if (n > 0) spent.push([key, n]);
        else if (n < 0) refunds.push([key, -n]);
      }
      const done: [CurrencyKey, number][] = [];
      for (const [key, n] of spent) {
        if ((await this.currencies.spend(cid, key, n)) === null) {
          for (const [k, v] of done) await this.currencies.credit(cid, k, v);
          return refuse(SHORT[key] ?? 'Không đủ tài nguyên');
        }
        done.push([key, n]);
      }
      data[String(index)] = out.change.slot;
      try {
        await this.store.put(cid, FEATURE_KEYS.crystal, { crystals: data });
      } catch (e) {
        for (const [k, v] of done) await this.currencies.credit(cid, k, v);
        throw e;
      }
      for (const [key, n] of refunds) await this.currencies.credit(cid, key, n);
      session.callback('onInitMagicCrystalData', data);
      await this.common.push(session, { currencies: true });
    });
  }
}
