// Kết bái ceremonies (Go handlers/brotherhood ceremony + answers): the NPC starts a swear / join (fee draft -> beginBrother) or a
// disband, every participant answers within 60 s, one NO cancels (fail push to the refuser's map, a plain line elsewhere) and the
// last agreement hands over to BrotherExec. Drafts and ceremonies live in memory; disconnect / character leave drops them.

import { Injectable } from '@nestjs/common';
import { BROTHER_SAY, BrotherKind, type AgreeSetBrother, type BrotherKindId } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { BrotherCeremonies, idsOf, type Ceremony } from './brother-ceremony';
import { BrotherExec } from './brother-exec.service';
import { BrotherPush } from './brother-push.service';
import { TEXT, planDisband } from './brother-rules';
import { BrotherTeam } from './brother-team.service';
import { BrotherhoodStore } from './brotherhood.store';

const FAIL_PUSH: Record<BrotherKindId, string> = {
  [BrotherKind.SWEAR]: 'onFailToBecomeBrother',
  [BrotherKind.JOIN]: 'onFailToAcceptNewBroMem',
  [BrotherKind.DISBAND]: 'onFailToDiabondBrothers',
};

@Injectable()
export class BrotherhoodService {
  readonly ceremonies = new BrotherCeremonies();
  /** Replaceable in tests. */
  now: () => number = Date.now;

  constructor(
    private readonly team: BrotherTeam,
    private readonly exec: BrotherExec,
    private readonly push: BrotherPush,
    private readonly store: BrotherhoodStore,
  ) {}

  /** NPC menu "Kết bái": plans the team, keeps the draft and asks the leader to confirm the fee (`onLeaderConfirmToBro`). */
  async startSwear(session: Session): Promise<void> {
    const leaderId = session.characterId!;
    const r = await this.team.swearPlan(leaderId);
    if (!r.ok) throw RpcException.forbidden(r.text);
    this.ceremonies.putDraft(this.ceremonyOf(r.plan, leaderId, r.leaderName), this.now());
    session.callback('onSystemSay', BROTHER_SAY.fee(r.plan.newcomers.length, r.plan.fee));
    session.callback('onLeaderConfirmToBro');
  }

  /** beginBrother (the leader confirmed the fee): re-plans the same team, registers the ceremony and prompts the others. */
  async begin(session: Session): Promise<null> {
    const leaderId = session.characterId!;
    const draft = this.ceremonies.takeDraft(leaderId, this.now());
    if (!draft) throw RpcException.forbidden(BROTHER_SAY.restart);
    const r = await this.team.swearPlan(leaderId);
    if (!r.ok) throw RpcException.forbidden(r.text);
    const c = this.ceremonyOf(r.plan, leaderId, r.leaderName);
    const same = idsOf(c).length === idsOf(draft).length && idsOf(c).every((id) => idsOf(draft).includes(id));
    if (!same) throw RpcException.forbidden(BROTHER_SAY.teamChanged);
    if (!this.ceremonies.register(c, this.now(), true)) throw RpcException.forbidden(BROTHER_SAY.busy);
    const newNames = r.plan.newcomers.map((p) => p.name);
    const oldNames = r.plan.participants.filter((p) => p.existing).map((p) => p.name);
    for (const p of c.participants) {
      if (p.id === leaderId) continue;
      const s = this.push.session(p.id);
      if (!s) continue;
      if (c.kind === BrotherKind.SWEAR) s.callback('onAgreeSetBrother', { cname: c.leaderName } satisfies AgreeSetBrother);
      else if (p.existing) s.callback('onAcceptNewBroMem', newNames, true);
      else s.callback('onAcceptNewBroMem', oldNames, false);
    }
    session.callback('onSystemSay', BROTHER_SAY.sent);
    return null;
  }

  /** NPC menu "Giải tán nhóm kết bái": the leader's group must stand in the team; every member (leader included) is asked. */
  async startDisband(session: Session): Promise<void> {
    const leaderId = session.characterId!;
    const group = await this.store.groupOf(leaderId);
    if (!group) throw RpcException.forbidden(TEXT.notMember);
    const team = await this.team.teamOnMap(leaderId);
    if (!team.ok) throw RpcException.forbidden(team.text);
    const plan = planDisband(group, team.ids);
    if (!plan.ok) throw RpcException.forbidden(plan.text);
    const c: Ceremony = {
      kind: BrotherKind.DISBAND, leaderId, leaderName: session.characterName ?? '', groupId: plan.groupId,
      participants: plan.participants, fee: 0, expires: 0, agreed: new Set(),
    };
    if (!this.ceremonies.register(c, this.now(), false)) throw RpcException.forbidden(BROTHER_SAY.busy);
    for (const id of idsOf(c)) this.push.session(id)?.callback('onBeginDisbondBrothers');
  }

  /** becomeBrother / acceptNewMemToBrother / disbandBrothers: one participant's answer. */
  async answer(session: Session, kind: BrotherKindId, agree: boolean): Promise<null> {
    const cid = session.characterId!;
    const r = this.ceremonies.answer(cid, kind, agree, this.now());
    if (r.state === 'expired') session.callback('onSystemSay', BROTHER_SAY.expired);
    else if (r.state === 'waiting') session.callback('onSystemSay', BROTHER_SAY.waiting);
    else if (r.state === 'refused') this.refused(session, r.ceremony);
    else if (kind === BrotherKind.DISBAND) await this.exec.runDisband(r.ceremony);
    else await this.exec.runJoin(r.ceremony);
    return null;
  }

  /** Disconnect / character leave: the character's draft and ceremony go; the other participants are told. */
  forget(characterId: number, name: string): void {
    const c = this.ceremonies.dropFor(characterId);
    if (!c) return;
    const line = c.kind === BrotherKind.DISBAND ? 'giải tán kết bái thất bại' : 'kết bái thất bại';
    for (const id of idsOf(c)) if (id !== characterId) this.push.say(id, `'${name}' đã rời đi, ${line}`);
  }

  /** Fail push (cid of the refuser) to participants on the refuser's map, the same line as onSystemSay to the others. */
  private refused(refuser: Session, c: Ceremony): void {
    const name = c.participants.find((p) => p.id === refuser.characterId)?.name ?? refuser.characterName ?? '';
    const line = c.kind === BrotherKind.DISBAND ? `'${name}' không đồng ý, giải tán kết bái thất bại` : `'${name}' không đồng ý kết bái, kết bái thất bại`;
    for (const id of idsOf(c)) {
      if (id === refuser.characterId) continue;
      const s = this.push.session(id);
      if (!s) continue;
      if (s.mapId === refuser.mapId && s.mapId > 0) s.callback(FAIL_PUSH[c.kind], refuser.characterId);
      else s.callback('onSystemSay', line);
    }
  }

  private ceremonyOf(plan: { kind: BrotherKindId; groupId: number; participants: Ceremony['participants']; fee: number }, leaderId: number, leaderName: string): Ceremony {
    return { kind: plan.kind, leaderId, leaderName, groupId: plan.groupId, participants: plan.participants, fee: plan.fee, expires: 0, agreed: new Set() };
  }
}
