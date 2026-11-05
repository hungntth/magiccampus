// Blood bag (M9 phase D, Go combat/blood_bag.go): buyBloodBag spends gold (gold only) and fills a pool; useBloodBag (sent by the
// client after every battle end) refills a living character to its effective max from pools 1/2. Pushes onUPP {gold, ep} /
// {ep, currentHp, currentMp}; refusals onSystemMidMsgOrNote. H5 pets always start a battle full, so pools 3/4 are only stored.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BLOOD_BAG_TEXT, formatEp } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { ensureBloodBag } from '../character/blood-bag-doc';
import { Character } from '../character/character.schema';
import { withCharLock } from '../inventory/char-lock';
import { CharacterStatsService } from '../stats/character-stats.service';
import { drawFrom, planBuy } from './blood-bag';

const pools = (raw: readonly number[] | undefined): number[] => [0, 1, 2, 3].map((i) => Math.max(0, Number(raw?.[i] ?? 0)));

@Injectable()
export class BloodBagService {
  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly stats: CharacterStatsService,
  ) {}

  buy(session: Session, bt: number, bn: number): Promise<void> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      await ensureBloodBag(this.chars, cid);
      const doc = await this.chars.findById(cid, { bloodBag: 1, gold: 1 }).lean();
      const bag = pools(doc?.bloodBag);
      const plan = planBuy(bag, bt, bn);
      if (!plan.ok) return void session.callback('onSystemMidMsgOrNote', plan.err);
      const key = `bloodBag.${bt - 1}`;
      const saved = await this.chars.findOneAndUpdate(
        { _id: cid, gold: { $gte: plan.cost }, [key]: bag[bt - 1] },
        { $inc: { gold: -plan.cost, [key]: plan.added } },
        { new: true, projection: { gold: 1, bloodBag: 1 } },
      ).lean();
      if (!saved) return void session.callback('onSystemMidMsgOrNote', BLOOD_BAG_TEXT.NO_GOLD);
      session.callback('onUPP', { gold: saved.gold, ep: formatEp(pools(saved.bloodBag)) });
    });
  }

  /** Silent on failure. Only a living character is refilled (Go: currentHp > 0). */
  use(session: Session): Promise<void> {
    const cid = session.characterId!;
    if (session.battleId !== null) return Promise.resolve();
    return withCharLock(cid, async () => {
      await ensureBloodBag(this.chars, cid);
      const st = await this.stats.compute(cid);
      const bag = pools(st.doc.bloodBag);
      if (st.doc.currentHp <= 0 || (bag[0] <= 0 && bag[1] <= 0)) return;
      const hp = drawFrom(bag[0], st.maxHp - st.doc.currentHp);
      const mp = drawFrom(bag[1], st.maxMp - st.doc.currentMp);
      if (hp <= 0 && mp <= 0) return;
      const saved = await this.chars.findOneAndUpdate(
        { _id: cid, currentHp: st.doc.currentHp, 'bloodBag.0': bag[0], 'bloodBag.1': bag[1] },
        { $inc: { currentHp: hp, currentMp: mp, 'bloodBag.0': -hp, 'bloodBag.1': -mp } },
        { new: true, projection: { currentHp: 1, currentMp: 1, bloodBag: 1 } },
      ).lean();
      if (saved) session.callback('onUPP', { ep: formatEp(pools(saved.bloodBag)), currentHp: saved.currentHp, currentMp: saved.currentMp });
    });
  }
}
