// Invitation cards and red envelopes (M14 phase E; Go invitation.go): `useWeddingBag(slotId)` on 1691-1693 (a partner with a booking
// sends the card to up to ten online friends not yet invited, consumed only when delivered; a guest opens it into the guest bag
// 1715-1717 and is taken into an open hall that lists them) and `useRedBag(slotId)` on 1710 (in an open hall it goes to the groom
// and bride in turn, anywhere else a married player opens it for 300 000 bound silver). Spend before credit; one character lock at
// a time (a card delivery never holds the sender's lock while taking a guest's).

import { Injectable, Logger } from '@nestjs/common';
import { RelationType, WEDDING, WEDDING_ITEMS, WEDDING_TEXT, guestBagOf, isHallMap, weddingTier, type BagItem } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { RelationshipService } from '../social/relationship.service';
import { MarriagePush } from './marriage-push.service';
import { MarriageService } from './marriage.service';
import { WeddingHall } from './wedding-hall.service';
import { WeddingItems } from './wedding-items.service';
import { isSpouseIn, pickInvitees, redBagRecipient, type Booking } from './wedding-rules';
import { WeddingStore } from './wedding.store';

@Injectable()
export class WeddingInvites {
  private readonly logger = new Logger(WeddingInvites.name);

  constructor(
    private readonly store: WeddingStore,
    private readonly items: WeddingItems,
    private readonly hall: WeddingHall,
    private readonly marriages: MarriageService,
    private readonly relations: RelationshipService,
    private readonly characters: CharacterService,
    private readonly push: MarriagePush,
  ) {}

  private async stack(cid: number, slotId: number, ok: (tid: number) => boolean, refusal: string): Promise<BagItem> {
    const item = await this.items.peek(cid, slotId);
    if (!item) throw RpcException.forbidden(WEDDING_TEXT.noItem);
    if (!ok(item.tid)) throw RpcException.forbidden(refusal);
    return item;
  }

  // ---- invitation cards ----

  async useWeddingBag(session: Session, slotId: number): Promise<null> {
    const cid = session.characterId!;
    const card = await this.stack(cid, slotId, (t) => guestBagOf(t) !== undefined, WEDDING_TEXT.notCard);
    const booking = await this.store.ofCharacter(cid);
    if (booking) await this.send(session, card, booking);
    else await this.open(session, card);
    return null;
  }

  /** A partner with a booking: cards to online friends, the card is spent only when something was delivered. */
  private async send(session: Session, card: BagItem, booked: Booking): Promise<void> {
    const cid = session.characterId!;
    const fresh = await this.store.get(booked.id);
    if (!fresh) throw RpcException.forbidden(WEDDING_TEXT.noBooking);
    const friends = (await this.relations.list(cid, [RelationType.FRIEND])).map((e) => ({ cid: e.cid, name: e.name }));
    const picks = pickInvitees(friends, fresh, (id) => this.push.session(id) !== undefined);
    if (picks.length === 0) throw RpcException.forbidden(WEDDING_TEXT.noFriends);
    const delivered = [];
    for (const g of picks) if (await this.items.giveIfFits(g.cid, card.tid, 1)) delivered.push(g);
    if (delivered.length === 0) throw RpcException.forbidden(WEDDING_TEXT.friendsFull);
    if (!(await this.items.consumeOne(cid, card))) {
      for (const g of delivered) await this.items.takeBack(g.cid, card.tid);
      throw RpcException.forbidden(WEDDING_TEXT.noItem);
    }
    await this.store.invite(fresh.id, delivered.map((g) => g.cid));
    const me = (await this.characters.getById(cid)).name;
    for (const g of delivered) this.push.say(g.cid, WEDDING_TEXT.invitedBy(me));
    this.push.say(cid, WEDDING_TEXT.sentTo(delivered.map((g) => g.name)));
  }

  /** A guest: the card becomes the guest bag; an open hall that lists the guest takes them in. */
  private async open(session: Session, card: BagItem): Promise<void> {
    const cid = session.characterId!;
    const bag = guestBagOf(card.tid)!;
    if (!(await this.items.giveIfFits(cid, bag, 1))) throw RpcException.forbidden(WEDDING_TEXT.bagFull);
    if (!(await this.items.consumeOne(cid, card))) {
      await this.items.takeBack(cid, bag);
      throw RpcException.forbidden(WEDDING_TEXT.noItem);
    }
    const hall = (await this.store.list()).find((b) => b.started && b.invited.includes(cid));
    if (!hall) return;
    try {
      await this.hall.moveIn(session, hall);
    } catch (e) {
      session.callback('onSystemMidMsgOrNote', (e as Error).message); // the card is spent either way: say why the hall did not open
    }
  }

  // ---- red envelope ----

  async useRedBag(session: Session, slotId: number): Promise<null> {
    const cid = session.characterId!;
    const bag = await this.stack(cid, slotId, (t) => t === WEDDING_ITEMS.redBag, WEDDING_TEXT.notRedBag);
    if (isHallMap(session.mapId) && (await this.giveToCouple(session, bag))) return null;
    if (!(await this.marriages.isMarried(cid))) throw RpcException.forbidden(WEDDING_TEXT.redBagOutside);
    if (!(await this.items.consumeOne(cid, bag))) throw RpcException.forbidden(WEDDING_TEXT.noItem);
    const total = await this.characters.addMoney(cid, 'moneyBind', WEDDING.redBagSilver);
    const money = (await this.characters.getById(cid)).money ?? 0;
    this.push.paid(cid, { bind: WEDDING.redBagSilver, money: 0, bindTotal: total, moneyTotal: money }, 1);
    return null;
  }

  /** A guest standing in an open hall: the envelope goes to the groom or the bride in turn. False when no hall here takes it. */
  private async giveToCouple(session: Session, bag: BagItem): Promise<boolean> {
    const cid = session.characterId!;
    const b = (await this.store.list()).find((x) => x.started && weddingTier(x.tier)?.mapId === session.mapId && !isSpouseIn(x, cid));
    if (!b) return false;
    if (!(await this.items.consumeOne(cid, bag))) throw RpcException.forbidden(WEDDING_TEXT.noItem);
    const n = await this.store.nextRedBag(b.id);
    if (n === null) {
      await this.items.give(cid, WEDDING_ITEMS.redBag, 1, `wedding-redbag-back:${b.id}:${cid}:${Date.now()}`); // hall closed under us
      throw RpcException.forbidden(WEDDING_TEXT.gone);
    }
    const to = redBagRecipient(b, n);
    await this.items.give(to, WEDDING_ITEMS.redBag, 1, `wedding-redbag:${b.id}:${n}`);
    const line = WEDDING_TEXT.redBagGiven((await this.characters.getById(cid)).name);
    this.push.say(cid, line);
    this.push.say(to, line);
    this.logger.log(`red bag ${n} of booking ${b.id}: ${cid} -> ${to}`);
    return true;
  }
}
