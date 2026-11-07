// Special currencies per character (Character.currencies): atomic credit / spend and the onUPP push of the balances.
// Spend before you credit: callers persist the consumption (spend) first, then credit the reward.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Currencies, CurrencyKey } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { PushSink } from '../rewards/push-sink';
import { Character } from '../character/character.schema';
import { creditPipeline, currencyPath, parseAmount, spendOp } from './currency-rules';

@Injectable()
export class CurrencyService {
  constructor(@InjectModel(Character.name) private readonly chars: Model<Character>) {}

  async balances(characterId: number): Promise<Currencies> {
    const doc = await this.chars.findById(characterId, { currencies: 1 }).lean();
    return { ...(doc?.currencies ?? {}) };
  }

  async balance(characterId: number, key: CurrencyKey): Promise<number> {
    return (await this.balances(characterId))[key] ?? 0;
  }

  /** Adds `amount` (capped at MAX_CURRENCY); returns the new balance. */
  async credit(characterId: number, key: CurrencyKey, amount: number): Promise<number> {
    const n = parseAmount(amount);
    if (n === null) throw RpcException.invalidArgs('amount');
    const doc = await this.chars.findOneAndUpdate({ _id: characterId }, creditPipeline(key, n), {
      new: true, projection: { [currencyPath(key)]: 1 },
    }).lean();
    if (!doc) throw RpcException.notFound('character not found');
    return doc.currencies?.[key] ?? 0;
  }

  /** Conditional $inc: returns the new balance, or null (nothing changed) when the balance is below `cost`. */
  async spend(characterId: number, key: CurrencyKey, cost: number): Promise<number | null> {
    const n = parseAmount(cost);
    if (n === null) throw RpcException.invalidArgs('cost');
    const op = spendOp(characterId, key, n);
    const doc = await this.chars.findOneAndUpdate(op.filter, op.update, { new: true, projection: { [currencyPath(key)]: 1 } }).lean();
    return doc ? (doc.currencies?.[key] ?? 0) : null;
  }

  /** onUPP {currencies} to the session (the full small map, so the client's Object.assign keeps every key). */
  async push(session: PushSink): Promise<Currencies> {
    const currencies = await this.balances(session.characterId!);
    session.callback('onUPP', { currencies });
    return currencies;
  }
}
