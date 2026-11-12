// Marriage panel RPC logic (Go service.go + handlers requests.go / panel.go): initMarriage, marriageSeeking (1 000 000 silver,
// overwrite charges again), marriageRequest (day limits), marriageReqFeedback (accept marries under both locks), cancelMarriageSekInfo.
// Refusals are `RpcException.forbidden` toasts with the Go texts. Panel refreshes go to every involved online character.

import { Injectable } from '@nestjs/common';
import { MARRIAGE, MARRIAGE_TEXT } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { chargeSilver, refundSilver } from './marriage-money';
import { withMarriageLocks } from './marriage-locks';
import { MarriagePanelView } from './marriage-panel.view';
import { MarriagePush } from './marriage-push.service';
import { checkRequest, checkSeek, requestRefusalText } from './marriage-rules';
import { MarriageService } from './marriage.service';
import { MarriageStore } from './marriage.store';

@Injectable()
export class MarriagePanelService {
  /** Replaceable in tests. */
  now: () => number = Date.now;

  constructor(
    private readonly store: MarriageStore,
    private readonly marriages: MarriageService,
    private readonly characters: CharacterService,
    private readonly view: MarriagePanelView,
    private readonly push: MarriagePush,
  ) {}

  /** `initMarriage(firstFlag)`: seek board then the caller's own list. */
  init(session: Session): Promise<void> {
    return this.view.push(session.characterId!);
  }

  /** `marriageSeeking(content, flag)`: Lv 30, unmarried, 1 000 000 silver (moneyBind first); a new post overwrites and charges again. */
  async seek(session: Session, content: string): Promise<void> {
    const cid = session.characterId!;
    const me = await this.characters.getById(cid);
    const out = await withMarriageLocks([cid], async () => {
      const refusal = checkSeek(me.level, await this.store.isMarried(cid));
      if (refusal === 'level') throw RpcException.forbidden(MARRIAGE_TEXT.seekLevel);
      if (refusal === 'married') throw RpcException.forbidden(MARRIAGE_TEXT.married);
      const update = (await this.store.getSeeking(cid)) !== null;
      const paid = await chargeSilver(this.characters, cid, MARRIAGE.seekCost);
      if (!paid) throw RpcException.forbidden(MARRIAGE_TEXT.noMoney);
      try {
        await this.store.saveSeeking(cid, content, 0, this.now());
      } catch (e) {
        await refundSilver(this.characters, cid, paid);
        throw e;
      }
      return { paid, update };
    });
    this.push.paid(cid, out.paid, -1);
    this.push.sysEvent({ t: 120, c: cid, n: me.name, update: out.update });
    await this.view.push(cid);
  }

  /** `marriageRequest(cid, name, content)`: proposer gates then a free request row; both panels refresh. */
  async request(session: Session, targetId: number, content: string): Promise<void> {
    const cid = session.characterId!;
    if (targetId === cid) throw RpcException.forbidden(MARRIAGE_TEXT.samePerson);
    const docs = await this.characters.findByIds([cid, targetId]);
    const me = docs.find((d) => d._id === cid);
    const target = docs.find((d) => d._id === targetId);
    if (!me || !target) throw RpcException.notFound(MARRIAGE_TEXT.notFound);
    await withMarriageLocks([cid], async () => {
      const refusal = checkRequest({
        from: { id: cid, name: me.name, level: me.level, gender: me.gender },
        to: { id: targetId, name: target.name, level: target.level, gender: target.gender },
        fromMarried: await this.store.isMarried(cid),
        toMarried: await this.store.isMarried(targetId),
        sent: await this.store.sentBy(cid),
        now: this.now(),
      });
      if (refusal) throw RpcException.forbidden(requestRefusalText(refusal));
      await this.store.createRequest(cid, targetId, content, this.now());
    });
    await this.view.push(cid);
    await this.view.push(targetId);
  }

  /** `marriageReqFeedback(id, 1|2)`: only the target; a request that is not open is a silent no-op; accept marries. */
  async feedback(session: Session, requestId: number, response: 1 | 2): Promise<void> {
    const cid = session.characterId!;
    const req = await this.store.getRequest(requestId);
    if (!req) throw RpcException.notFound(MARRIAGE_TEXT.noRequest);
    if (req.toId !== cid) throw RpcException.forbidden(MARRIAGE_TEXT.noRequest);
    if (req.flag !== 0) return;
    if (response === 2) {
      if (await this.store.reply(requestId, 2, this.now())) await this.refreshBoth(cid, req.fromId);
      return;
    }
    const doc = await withMarriageLocks([req.fromId, req.toId], async () => {
      const fresh = await this.store.getRequest(requestId);
      if (!fresh || fresh.flag !== 0) return null;
      const married = await this.marriages.marryLocked(req.fromId, req.toId);
      await this.store.reply(requestId, 1, this.now());
      return married;
    });
    if (!doc) return;
    await this.refreshBoth(cid, req.fromId);
    await this.marriages.announceMarried(doc, req.fromId, req.toId);
  }

  /** `cancelMarriageSekInfo()`: drops the caller's ad, no refund. */
  async cancelSeek(session: Session): Promise<void> {
    const cid = session.characterId!;
    await this.store.deleteSeeking(cid);
    await this.view.push(cid);
  }

  /** Panel refresh for both sides of a proposal (the replier first). */
  async refreshBoth(first: number, second: number): Promise<void> {
    await this.view.push(first);
    await this.view.push(second);
  }
}
