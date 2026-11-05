// Executes the trade swap without Mongo transactions: under both per-character locks (ascending id order) it re-reads the
// bags and pets, plans slots, then runs a saga: debit both sides -> move pet rows -> move item rows -> credit. Any failure undoes
// the completed steps in reverse, so a failed trade leaves both characters unchanged.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SlotType, type MoneyKey, type TradeOffer } from '@mc/shared';
import { CharacterService } from '../character/character.service';
import { withCharLock } from '../inventory/char-lock';
import { CharacterItem } from '../inventory/character-item.schema';
import { InventoryService } from '../inventory/inventory.service';
import { TRADE_NOTE } from './trade-rules';
import { TradePetService } from './trade-pets.service';
import { petMoveStep, planPetMoves, planSwap, runSaga, type PetMove, type SagaStep, type SwapMove } from './trade-swap';

export interface TradeParty {
  cid: number;
  offer: TradeOffer;
}

export type SwapOutcome = { ok: true; moves: SwapMove[]; petMoves: PetMove[] } | { ok: false; info: string };

/** A refusal with a player-visible message (anything else thrown inside the saga is reported generically). */
class TradeFail extends Error {}

@Injectable()
export class TradeSwapService {
  private readonly logger = new Logger(TradeSwapService.name);

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly characters: CharacterService,
    private readonly inventory: InventoryService,
    private readonly tradePets: TradePetService,
  ) {}

  async execute(a: TradeParty, b: TradeParty): Promise<SwapOutcome> {
    const [lo, hi] = a.cid < b.cid ? [a.cid, b.cid] : [b.cid, a.cid];
    return withCharLock(lo, () => withCharLock(hi, () => this.run(a, b)));
  }

  private async run(a: TradeParty, b: TradeParty): Promise<SwapOutcome> {
    const rows = await this.items.find({ characterId: { $in: [a.cid, b.cid] }, slotType: SlotType.BAG }).lean();
    const bagOf = (cid: number) => rows.filter((r) => r.characterId === cid).map((r) => ({ id: r._id, slotIndex: r.slotIndex }));
    for (const p of [a, b]) {
      for (const id of p.offer.items) {
        const r = rows.find((x) => x._id === id);
        if (!r || r.characterId !== p.cid || r.isBound) return { ok: false, info: TRADE_NOTE.CHANGED };
      }
    }
    const [capA, capB] = [await this.inventory.capacity(a.cid), await this.inventory.capacity(b.cid)];
    const plan = planSwap(
      { cid: a.cid, bag: bagOf(a.cid), out: a.offer.items, capacity: capA },
      { cid: b.cid, bag: bagOf(b.cid), out: b.offer.items, capacity: capB },
      Math.min(capA, capB),
    );
    if (!plan.ok) return { ok: false, info: plan.reason === 'full' ? TRADE_NOTE.BAG_FULL : TRADE_NOTE.CHANGED };
    const petRefusal = await this.tradePets.check({ cid: a.cid, pets: a.offer.pets }, { cid: b.cid, pets: b.offer.pets });
    if (petRefusal) return { ok: false, info: petRefusal };
    const petMoves = planPetMoves({ cid: a.cid, pets: a.offer.pets }, { cid: b.cid, pets: b.offer.pets });

    // Pets move before items (Go): debits -> pet moves -> item moves -> credits, undone in reverse on the first failure.
    const steps: SagaStep[] = [
      ...this.debits(a), ...this.debits(b),
      ...petMoves.map((m) => petMoveStep(m, this.tradePets, new TradeFail(TRADE_NOTE.CHANGED))),
      ...plan.moves.map((m) => this.moveStep(m)),
      ...this.credits(a.cid, b.offer), ...this.credits(b.cid, a.offer),
    ];
    const result = await runSaga(steps);
    if (result.ok) return { ok: true, moves: plan.moves, petMoves };
    if (result.undoErrors.length > 0) {
      this.logger.error(`trade ${a.cid}<->${b.cid} failed at ${result.failedStep}; undo failed for: ${result.undoErrors.join(', ')}`);
    }
    const info = result.error instanceof TradeFail ? result.error.message : 'Giao dịch thất bại';
    return { ok: false, info };
  }

  private debits(p: TradeParty): SagaStep[] {
    const one = (key: MoneyKey, amount: number, note: string): SagaStep[] => amount <= 0 ? [] : [{
      name: `debit ${p.cid} ${key}`,
      run: async () => {
        if ((await this.characters.spendMoney(p.cid, key, amount)) === null) throw new TradeFail(note);
      },
      undo: async () => void (await this.characters.addMoney(p.cid, key, amount)),
    }];
    return [...one('money', p.offer.money, TRADE_NOTE.NO_MONEY), ...one('gold', p.offer.gold, TRADE_NOTE.NO_GOLD)];
  }

  private credits(cid: number, from: TradeOffer): SagaStep[] {
    const one = (key: MoneyKey, amount: number): SagaStep[] => amount <= 0 ? [] : [{
      name: `credit ${cid} ${key}`,
      run: async () => void (await this.characters.addMoney(cid, key, amount)),
      undo: async () => void (await this.characters.spendMoney(cid, key, amount)),
    }];
    return [...one('money', from.money), ...one('gold', from.gold)];
  }

  private moveStep(m: SwapMove): SagaStep {
    return {
      name: `move ${m.id}`,
      run: async () => {
        const r = await this.items.updateOne(
          { _id: m.id, characterId: m.from, slotType: SlotType.BAG, slotIndex: m.fromSlot, isBound: false },
          { $set: { characterId: m.to, slotIndex: m.toSlot } },
        );
        if (r.modifiedCount !== 1) throw new TradeFail(TRADE_NOTE.CHANGED);
      },
      undo: async () => {
        await this.items.updateOne(
          { _id: m.id, characterId: m.to, slotType: SlotType.BAG, slotIndex: m.toSlot },
          { $set: { characterId: m.from, slotIndex: m.fromSlot } },
        );
      },
    };
  }
}
