// Silver charging for the forge upgrades: the selected money type (moneyBind / money) or unbound silver only, charged with a
// conditional decrement before anything is consumed and refunded when a later step fails.

import { Injectable } from '@nestjs/common';
import type { MoneyKey } from '@mc/shared';
import { CharacterService } from '../character/character.service';
import { push, type Push } from '../inventory/pushes';

export interface Charge {
  key: MoneyKey;
  amount: number;
  /** Balance after the charge. */
  total: number;
}

export type ChargeMode = 'selected' | 'unbound';

@Injectable()
export class ForgeMoneyService {
  constructor(private readonly characters: CharacterService) {}

  /** Charges `amount` silver; null when the balance is short. A zero amount charges nothing. */
  async spend(characterId: number, amount: number, mode: ChargeMode = 'selected'): Promise<Charge | null> {
    const key: MoneyKey = mode === 'unbound' ? 'money' : (await this.characters.paymentPrefs(characterId)).money;
    if (amount <= 0) return { key, amount: 0, total: -1 };
    const total = await this.characters.spendMoney(characterId, key, amount);
    return total === null ? null : { key, amount, total };
  }

  /** True when the balance covers `amount` (no charge); used by previews that only charge on confirm. */
  async canAfford(characterId: number, amount: number, mode: ChargeMode = 'selected'): Promise<boolean> {
    const key: MoneyKey = mode === 'unbound' ? 'money' : (await this.characters.paymentPrefs(characterId)).money;
    return (await this.characters.getById(characterId))[key] >= amount;
  }

  async refund(characterId: number, charge: Charge | null): Promise<void> {
    if (charge && charge.amount > 0) await this.characters.addMoney(characterId, charge.key, charge.amount);
  }

  /** onUPP of the new balance (nothing when no silver was charged). */
  pushes(charge: Charge | null): Push[] {
    return charge && charge.amount > 0 ? [push('onUPP', { [charge.key]: charge.total })] : [];
  }
}
