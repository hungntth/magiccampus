// Kết bái state changes (Go application/brotherhood ceremony.go runJoin / runDisband, service.go Leave / SetTitle): the final
// step of a swear / join ceremony, disbanding, leaving and the 300-gold group title. Everything runs under the members' brother
// locks (ascending ids), re-validates first and spends before it writes; a failed write refunds and rolls back. Pushes follow.

import { Injectable, Logger } from '@nestjs/common';
import { BROTHER, BROTHER_SAY, BrotherKind, RelationType, normalizeBrotherTitle } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { withKeyLock } from '../inventory/char-lock';
import { RelationshipService, type IntimacyChange } from '../social/relationship.service';
import { idsOf, type Ceremony } from './brother-ceremony';
import { BrotherPush } from './brother-push.service';
import { TEXT, planLeave, silverSplit, type Planned } from './brother-rules';
import { BrotherTeam } from './brother-team.service';
import { BrotherhoodStore, MemberTakenError } from './brotherhood.store';

interface Paid {
  bind: number;
  money: number;
  bindTotal: number;
  moneyTotal: number;
}

const FAIL = (text: string): { ok: false; text: string } => ({ ok: false, text });
const sameSet = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

/** Locks `brother:<id>` for every id in ascending order (not reentrant, like the other key locks). */
export function withBrotherLocks<T>(ids: readonly number[], fn: () => Promise<T>): Promise<T> {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const run = (i: number): Promise<T> => (i >= sorted.length ? fn() : withKeyLock(`brother:${sorted[i]}`, () => run(i + 1)));
  return run(0);
}

@Injectable()
export class BrotherExec {
  private readonly logger = new Logger(BrotherExec.name);

  constructor(
    private readonly store: BrotherhoodStore,
    private readonly team: BrotherTeam,
    private readonly relations: RelationshipService,
    private readonly characters: CharacterService,
    private readonly push: BrotherPush,
  ) {}

  /** Last agreement of a swear / join ceremony: re-check, charge the leader, write the group and the brother rows, announce. */
  async runJoin(c: Ceremony): Promise<void> {
    const ids = idsOf(c);
    const out = await withBrotherLocks(ids, () => this.joinLocked(c));
    if (!out.ok) return this.push.sayAll(ids, BROTHER_SAY.failed(out.text));
    const { paid, groupId, newIds } = out;
    this.pushPaid(c.leaderId, paid, -1);
    await this.push.refreshIm(ids);
    const group = await this.store.view(groupId);
    const names = c.participants.filter((p) => newIds.includes(p.id)).map((p) => p.name).join(', ');
    this.logger.log(`brotherhood ${groupId} ${c.kind === BrotherKind.SWEAR ? 'created' : 'joined'}: ${ids.join(',')}`);
    if (c.kind === BrotherKind.SWEAR) {
      this.push.sayAll(ids, BROTHER_SAY.success);
      this.push.world(BROTHER_SAY.world(c.participants.map((p) => p.name).join(', ')));
      this.push.session(c.leaderId)?.callback('onSetBrotherTitle');
      return;
    }
    this.push.sayAll(group?.members.map((m) => m.id) ?? ids, BROTHER_SAY.joined(names));
    if (group?.title) await this.push.grantTitle(newIds, group.title);
  }

  private async joinLocked(c: Ceremony): Promise<Planned<{ paid: Paid; groupId: number; newIds: number[] }>> {
    const fresh = await this.team.swearPlan(c.leaderId);
    if (!fresh.ok) return fresh;
    const plan = fresh.plan;
    if (plan.kind !== c.kind || plan.groupId !== c.groupId || !sameSet(plan.participants.map((p) => p.id), idsOf(c))) {
      return FAIL(BROTHER_SAY.teamChanged);
    }
    const paid = await this.charge(c.leaderId, plan.fee);
    if (!paid) return FAIL(TEXT.noSilver);
    const ids = idsOf(c);
    const newIds = plan.newcomers.map((p) => p.id);
    let groupId = plan.groupId;
    try {
      if (plan.kind === BrotherKind.SWEAR) groupId = await this.store.createGroup(ids);
      else await this.store.addMembers(groupId, newIds);
    } catch (e) {
      await this.refund(c.leaderId, paid);
      if (e instanceof MemberTakenError) return FAIL(TEXT.taken);
      throw e;
    }
    const linked: [number, number][] = [];
    try {
      for (const [i, p] of plan.participants.entries()) {
        for (const q of plan.participants.slice(i + 1)) {
          if (p.existing && q.existing) continue;
          await this.relations.link(p.id, q.id, RelationType.BROTHER);
          linked.push([p.id, q.id]);
        }
      }
    } catch (e) {
      this.logger.error(`brotherhood link failed, rolling back: ${(e as Error).message}`);
      for (const [a, b] of linked) await this.relations.convert(a, b, RelationType.FRIEND);
      if (plan.kind === BrotherKind.SWEAR) await this.store.dissolve(groupId);
      else for (const id of newIds) await this.store.removeMember(id);
      await this.refund(c.leaderId, paid);
      return FAIL('Không thể kết quan hệ huynh đệ, hãy thử lại.');
    }
    return { ok: true, paid, groupId, newIds };
  }

  /** Last agreement of a disband ceremony: the group goes, brother rows turn back into friend rows, title 153 is revoked for all. */
  async runDisband(c: Ceremony): Promise<void> {
    const ids = idsOf(c);
    const out = await withBrotherLocks(ids, async (): Promise<Planned<{ former: number[] }>> => {
      const g = await this.store.view(c.groupId);
      if (!g || !sameSet(g.members.map((m) => m.id), ids)) return FAIL(BROTHER_SAY.teamChanged);
      const former = await this.store.dissolve(g.id);
      await this.unbrother(former);
      return { ok: true, former };
    });
    if (!out.ok) return this.push.sayAll(ids, out.text);
    await this.push.revokeTitle(out.former);
    await this.push.refreshIm(out.former);
    this.push.sayAll(out.former, BROTHER_SAY.disbanded);
  }

  /** breakBrotherShip: 100 gold, the leaver's rows become friend rows minus 2500 intimacy, title 153 revoked, group < 2 dissolves. */
  async leave(session: Session): Promise<null> {
    const cid = session.characterId!;
    const pre = await this.store.groupOf(cid);
    if (!pre) throw RpcException.forbidden(TEXT.notMember);
    const out = await withBrotherLocks(pre.members.map((m) => m.id), async () => {
      const g = await this.store.groupOf(cid);
      if (!g) return FAIL(TEXT.notMember);
      const gold = await this.characters.spendMoney(cid, 'gold', BROTHER.leaveGold);
      if (gold === null) return FAIL(TEXT.noGold);
      try {
        const others = g.members.filter((m) => m.id !== cid);
        const changes: IntimacyChange[] = [];
        for (const o of others) {
          await this.relations.convert(cid, o.id, RelationType.FRIEND);
          for (const [owner, other] of [[cid, o.id], [o.id, cid]]) {
            const ch = await this.relations.addIntimacy(owner, other, -BROTHER.leavePenalty);
            if (ch && ch.applied !== 0) changes.push(ch);
          }
        }
        const plan = planLeave(g.members.map((m) => m.id), cid);
        await this.store.removeMember(cid);
        if (plan.dissolved) await this.store.dissolve(g.id);
        return { ok: true as const, g, plan, gold, changes };
      } catch (e) {
        await this.characters.addMoney(cid, 'gold', BROTHER.leaveGold);
        throw e;
      }
    });
    if (!out.ok) throw RpcException.forbidden(out.text);
    this.push.wallet(cid, 'gold', -BROTHER.leaveGold, out.gold);
    this.relations.announce(out.changes);
    await this.push.revokeTitle(out.plan.revokeIds);
    const everyone = out.g.members.map((m) => m.id);
    await this.push.refreshIm(everyone);
    const name = out.g.members.find((m) => m.id === cid)?.name ?? session.characterName ?? '';
    for (const id of everyone) {
      if (id === cid) continue;
      this.push.say(id, BROTHER_SAY.left(name));
      if (out.plan.dissolved) this.push.say(id, BROTHER_SAY.dissolved);
    }
    this.push.say(cid, BROTHER_SAY.youLeft);
    return null;
  }

  /** updateBrotherTitle: any member, 300 gold; every member gets title 153 and the suffix. */
  async setTitle(session: Session, raw: unknown): Promise<null> {
    const cid = session.characterId!;
    const title = normalizeBrotherTitle(raw);
    if (!title) throw RpcException.forbidden(TEXT.badTitle);
    const pre = await this.store.groupOf(cid);
    if (!pre) throw RpcException.forbidden(TEXT.notMember);
    const out = await withBrotherLocks(pre.members.map((m) => m.id), async () => {
      const g = await this.store.groupOf(cid);
      if (!g) return FAIL(TEXT.notMember);
      const gold = await this.characters.spendMoney(cid, 'gold', BROTHER.titleGold);
      if (gold === null) return FAIL(TEXT.noGold);
      try {
        await this.store.setTitle(g.id, title);
      } catch (e) {
        await this.characters.addMoney(cid, 'gold', BROTHER.titleGold);
        throw e;
      }
      return { ok: true as const, ids: g.members.map((m) => m.id), gold };
    });
    if (!out.ok) throw RpcException.forbidden(out.text);
    this.push.wallet(cid, 'gold', -BROTHER.titleGold, out.gold);
    await this.push.grantTitle(out.ids, title);
    this.push.sayAll(out.ids, BROTHER_SAY.titleSet(title));
    return null;
  }

  /** Brother rows between the given characters become friend rows again (no penalty). */
  private async unbrother(ids: readonly number[]): Promise<void> {
    for (const [i, a] of ids.entries()) for (const b of ids.slice(i + 1)) await this.relations.convert(a, b, RelationType.FRIEND);
  }

  /** moneyBind first, then money, each a conditional spend; null (nothing taken) when the leader cannot cover the fee. */
  private async charge(leaderId: number, fee: number): Promise<Paid | null> {
    const doc = await this.characters.getById(leaderId);
    const split = silverSplit(doc.moneyBind ?? 0, doc.money ?? 0, fee);
    if (!split) return null;
    let bindTotal = doc.moneyBind ?? 0;
    let moneyTotal = doc.money ?? 0;
    if (split.bind > 0) {
      const left = await this.characters.spendMoney(leaderId, 'moneyBind', split.bind);
      if (left === null) return null;
      bindTotal = left;
    }
    if (split.money > 0) {
      const left = await this.characters.spendMoney(leaderId, 'money', split.money);
      if (left === null) {
        if (split.bind > 0) await this.characters.addMoney(leaderId, 'moneyBind', split.bind);
        return null;
      }
      moneyTotal = left;
    }
    return { bind: split.bind, money: split.money, bindTotal, moneyTotal };
  }

  private async refund(leaderId: number, paid: Paid): Promise<void> {
    if (paid.bind > 0) await this.characters.addMoney(leaderId, 'moneyBind', paid.bind);
    if (paid.money > 0) await this.characters.addMoney(leaderId, 'money', paid.money);
  }

  /** Wallet pushes of a charge (`sign` -1) of both silver kinds. */
  private pushPaid(leaderId: number, paid: Paid, sign: 1 | -1): void {
    if (paid.bind > 0) this.push.wallet(leaderId, 'moneyBind', sign * paid.bind, paid.bindTotal);
    if (paid.money > 0) this.push.wallet(leaderId, 'money', sign * paid.money, paid.moneyTotal);
  }
}
