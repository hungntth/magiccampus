// Silver charging for marriage fees (seek ad now, hall tiers in phase E): moneyBind first, then money, each a conditional spend;
// nothing is taken (null) when the two together cannot cover the fee. `refundSilver` puts a charge back after a failed write.

import { CharacterService } from '../character/character.service';
import { silverSplit } from '../brotherhood/brother-rules';

export interface Paid {
  bind: number;
  money: number;
  bindTotal: number;
  moneyTotal: number;
}

export async function chargeSilver(characters: CharacterService, characterId: number, fee: number): Promise<Paid | null> {
  const doc = await characters.getById(characterId);
  const split = silverSplit(doc.moneyBind ?? 0, doc.money ?? 0, fee);
  if (!split) return null;
  let bindTotal = doc.moneyBind ?? 0;
  let moneyTotal = doc.money ?? 0;
  if (split.bind > 0) {
    const left = await characters.spendMoney(characterId, 'moneyBind', split.bind);
    if (left === null) return null;
    bindTotal = left;
  }
  if (split.money > 0) {
    const left = await characters.spendMoney(characterId, 'money', split.money);
    if (left === null) {
      if (split.bind > 0) await characters.addMoney(characterId, 'moneyBind', split.bind);
      return null;
    }
    moneyTotal = left;
  }
  return { bind: split.bind, money: split.money, bindTotal, moneyTotal };
}

export async function refundSilver(characters: CharacterService, characterId: number, paid: Paid): Promise<void> {
  if (paid.bind > 0) await characters.addMoney(characterId, 'moneyBind', paid.bind);
  if (paid.money > 0) await characters.addMoney(characterId, 'money', paid.money);
}
