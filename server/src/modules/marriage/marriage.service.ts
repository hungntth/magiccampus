// Marriage core (M14 D): who is married to whom, creating a marriage (couple rows via RelationshipService, the seek ads of both
// dropped) and ending one (couple rows restored, intimacy reset, booking dropped). Writes run under `marriage:<id>` locks of both
// partners (ascending); the `*Locked` methods expect the caller to hold them. Phase E registers `onEnded` listeners (hall exit).

import { Injectable, Logger } from '@nestjs/common';
import { MARRIAGE_TEXT, RelationType, formatCoupleTime, type CouplePush, type RelationTypeId } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { CharacterService } from '../character/character.service';
import { RelationshipService, type IntimacyChange } from '../social/relationship.service';
import { TAKEN_TEXT } from '../social/relationship-rules';
import { withMarriageLocks } from './marriage-locks';
import { MarriagePush } from './marriage-push.service';
import { orderCouple, priorBond } from './marriage-rules';
import { MarriageRewards } from './marriage-rewards.service';
import { AlreadyMarriedError, MarriageStore } from './marriage.store';
import type { MarriageDocument } from './marriage.schema';

export interface EndedMarriage {
  id: number;
  maleId: number;
  femaleId: number;
  changes: IntimacyChange[];
}

export type EndedListener = (ended: EndedMarriage) => Promise<void> | void;

@Injectable()
export class MarriageService {
  private readonly logger = new Logger(MarriageService.name);
  private readonly endListeners: { name: string; fn: EndedListener }[] = [];

  constructor(
    private readonly store: MarriageStore,
    private readonly relations: RelationshipService,
    private readonly characters: CharacterService,
    private readonly push: MarriagePush,
    private readonly rewards: MarriageRewards,
  ) {}

  /** Phase E: called (after the divorce is done) with the ended marriage, e.g. to close a hall. Failures are logged. */
  onEnded(name: string, fn: EndedListener): void {
    this.endListeners.push({ name, fn });
  }

  // ---- reads ----

  isMarried(characterId: number): Promise<boolean> {
    return this.store.isMarried(characterId);
  }

  /** The partner's id, or null when single. */
  async partnerOf(characterId: number): Promise<number | null> {
    const m = await this.store.activeOf(characterId);
    return m ? (m.maleId === characterId ? m.femaleId : m.maleId) : null;
  }

  async coupleOf(characterId: number): Promise<CouplePush | null> {
    const m = await this.store.activeOf(characterId);
    return m ? this.payload(m) : null;
  }

  /** The `onInitCouple` payload of a marriage row (null when a partner character vanished). */
  async payload(m: MarriageDocument): Promise<CouplePush | null> {
    const docs = new Map((await this.characters.findByIds([m.maleId, m.femaleId])).map((c) => [c._id, c]));
    const male = docs.get(m.maleId);
    const female = docs.get(m.femaleId);
    if (!male || !female) return null;
    return {
      maleId: male._id, maleName: male.name, femaleId: female._id, femaleName: female.name, type: m.type,
      time: formatCoupleTime(m.marriedAt.getTime()),
    };
  }

  /** `onInitCouple` to an online character (the couple or null). */
  async pushCouple(characterId: number): Promise<void> {
    if (!this.push.session(characterId)) return;
    this.push.couple(characterId, await this.coupleOf(characterId));
  }

  // ---- marry ----

  /** Marries two characters (both locked); refusals throw `RpcException.forbidden` with the Go texts. Announce afterwards. */
  marry(fromId: number, toId: number): Promise<MarriageDocument> {
    return withMarriageLocks([fromId, toId], () => this.marryLocked(fromId, toId));
  }

  /** The write sequence of a marriage; the caller holds both marriage locks. */
  async marryLocked(fromId: number, toId: number): Promise<MarriageDocument> {
    const docs = await this.characters.findByIds([fromId, toId]);
    if (docs.length !== 2) throw RpcException.notFound(MARRIAGE_TEXT.notFound);
    if ((await this.store.isMarried(fromId)) || (await this.store.isMarried(toId))) throw RpcException.forbidden(MARRIAGE_TEXT.married);
    const [ab, ba] = await Promise.all([this.relations.get(fromId, toId), this.relations.get(toId, fromId)]);
    const bond = priorBond([ab?.type, ba?.type]);
    if (!bond.ok) throw RpcException.forbidden(TAKEN_TEXT);
    const { male, female } = orderCouple(docs[0], docs[1]);
    await this.relations.link(fromId, toId, RelationType.COUPLE); // refuses a black row
    let doc: MarriageDocument;
    try {
      doc = await this.store.create(male._id, female._id, bond.prior);
    } catch (e) {
      await this.restoreRows(fromId, toId, bond.prior);
      if (e instanceof AlreadyMarriedError) throw RpcException.forbidden(MARRIAGE_TEXT.married);
      throw e;
    }
    await this.store.deleteSeeking(fromId, toId);
    this.logger.log(`marriage ${doc._id}: ${male._id} + ${female._id}`);
    return doc;
  }

  /** After a marriage was made (outside the locks): `onInitCouple` proposer then target, skills, IM lists. */
  async announceMarried(doc: MarriageDocument, firstId: number, secondId: number): Promise<void> {
    const payload = await this.payload(doc);
    for (const id of [firstId, secondId]) this.push.couple(id, payload);
    await this.rewards.grantAll([firstId, secondId]);
    for (const id of [firstId, secondId]) await this.relations.pushSnapshot(id).catch((e: Error) => this.logger.warn(`IM refresh ${id}: ${e.message}`));
  }

  // ---- divorce ----

  /** Ends the character's marriage (locks both partners); null when single. The card / follow-up pushes are the caller's. */
  async endMarriage(characterId: number): Promise<EndedMarriage | null> {
    const pre = await this.store.activeOf(characterId);
    if (!pre) return null;
    return withMarriageLocks([pre.maleId, pre.femaleId], async () => {
      const ended = await this.store.end(pre._id);
      if (!ended) return null;
      await this.store.dropBookings(ended._id);
      const changes = await this.relations.resetIntimacy(ended.maleId, ended.femaleId);
      await this.restoreRows(ended.maleId, ended.femaleId, ended.priorType ?? 0);
      return { id: ended._id, maleId: ended.maleId, femaleId: ended.femaleId, changes };
    });
  }

  /** Everything a divorce pushes (outside the locks): intimacy resets, rewards revoked, `onInitCouple(null)`, IM lists, the partner line. */
  async announceEnded(ended: EndedMarriage, byId: number): Promise<void> {
    const ids = [ended.maleId, ended.femaleId];
    this.relations.announce(ended.changes);
    await this.rewards.revokeAll(ids);
    for (const id of ids) {
      this.push.couple(id, null);
      await this.relations.pushSnapshot(id).catch((e: Error) => this.logger.warn(`IM refresh ${id}: ${e.message}`));
    }
    this.push.say(ids.find((id) => id !== byId) ?? 0, MARRIAGE_TEXT.partnerDivorced);
    for (const l of this.endListeners) {
      try {
        await l.fn(ended);
      } catch (e) {
        this.logger.error(`marriage-ended listener ${l.name} failed: ${(e as Error).message}`);
      }
    }
  }

  /** Couple rows go back to what the pair held before (friend / enemy) or are deleted. */
  private async restoreRows(a: number, b: number, prior: number): Promise<void> {
    if (prior === RelationType.FRIEND || prior === RelationType.ENEMY) await this.relations.convert(a, b, prior as RelationTypeId);
    else await this.relations.unlink(a, b);
  }
}
