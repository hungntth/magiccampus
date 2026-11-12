// The vow and the rings (M14 phase E; Go ceremony.go): `changeRing()` records the caller's vow on a started hall (the first vow
// pushes nothing), the second one finishes the wedding once (conditional stamp): the marriage rises to the hall tier, each partner
// gets the bound tier ring (bag, or mail when the bag is full), the world `onSysEvent {t:119}`, `onInitCouple` to both and, for a
// Quý Giá wedding, title 126. Using a ring grants titles 61-63 through the existing item_award rows (type 33), no extra hook.

import { Injectable, Logger } from '@nestjs/common';
import { WEDDING_ITEMS, WEDDING_TEXT } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { TitleService } from '../title/title.service';
import { MarriagePush } from './marriage-push.service';
import { MarriageService } from './marriage.service';
import { MarriageStore } from './marriage.store';
import { WeddingItems } from './wedding-items.service';
import { ringPlan, type Booking } from './wedding-rules';
import { WeddingStore } from './wedding.store';

@Injectable()
export class WeddingCeremony {
  private readonly logger = new Logger(WeddingCeremony.name);
  /** Replaceable in tests. */
  now: () => number = Date.now;

  constructor(
    private readonly store: WeddingStore,
    private readonly marriageStore: MarriageStore,
    private readonly marriages: MarriageService,
    private readonly characters: CharacterService,
    private readonly items: WeddingItems,
    private readonly titles: TitleService,
    private readonly push: MarriagePush,
  ) {}

  /** `changeRing()`: the caller's vow. */
  async changeRing(session: Session): Promise<null> {
    const cid = session.characterId!;
    const b = await this.store.ofCharacter(cid);
    if (!b || !b.started) throw RpcException.forbidden(WEDDING_TEXT.notStarted);
    if (b.finishedAt !== null) throw RpcException.forbidden(WEDDING_TEXT.alreadyRings);
    const voted = await this.store.vow(b.id, cid === b.maleId ? 'male' : 'female');
    if (!voted) throw RpcException.forbidden(WEDDING_TEXT.alreadyRings);
    if (!voted.maleAgreed || !voted.femaleAgreed) return null;
    const done = await this.store.finish(voted.id, this.now());
    if (done) await this.complete(done);
    return null;
  }

  /** Everything the second vow triggers; the stamp above guarantees it runs once per wedding. */
  private async complete(b: Booking): Promise<void> {
    const plan = ringPlan(b.tier);
    if (!plan) return;
    await this.marriageStore.setType(b.marriageId, b.tier);
    const names = new Map((await this.characters.findByIds([b.maleId, b.femaleId])).map((c) => [c._id, c.name]));
    for (const id of [b.maleId, b.femaleId]) await this.items.give(id, plan.ring, 1, `wedding-ring:${b.id}:${id}`);
    this.push.sysEvent({ t: 119, c1: b.femaleId, n1: names.get(b.femaleId) ?? '', c2: b.maleId, n2: names.get(b.maleId) ?? '' });
    for (const id of [b.maleId, b.femaleId]) await this.marriages.pushCouple(id);
    if (!plan.title) return;
    for (const id of [b.maleId, b.femaleId]) {
      try {
        await this.titles.grant(id, WEDDING_ITEMS.preciousTitle);
      } catch (e) {
        this.logger.warn(`title ${WEDDING_ITEMS.preciousTitle} for ${id} failed: ${(e as Error).message}`);
      }
    }
  }
}
