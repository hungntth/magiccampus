// Party orchestration on top of PartyManager: invite / request flows with pushes, membership changes, AFK, the movement
// relay and the follower lookups used by the scene module. Pushes: onGroupInvited, onGroupRequest, onGroupDeny,
// onGroupRequestDeny, onGroupCantJoin, onGroupJoined, onGroupLeave, onGroupDismiss, onGroupGiveLeader, onGroupAfk,
// unGroupAfk, onGroupFlag (H5, map broadcast) and onSystemMidMsgOrNote (notes).

import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  GroupCantJoinCode, type GroupAfkPush, type GroupAfkReply, type GroupFlagPush, type GroupGiveLeaderPush, type GroupJoined,
  type GroupLeavePush, type GroupMember, type SceneCharacter,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameGateway } from '../../gateway/game.gateway';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { PartyManager } from './party.manager';
import { buildMList, withinAfkReturn, type LeaveResult, type Party } from './party-rules';

const NOTE = {
  OFFLINE: 'Người chơi không trực tuyến',
  EXPIRED: 'Lời mời đã hết hạn',
  NO_PARTY: 'Người chơi này chưa có nhóm',
  NOT_LEADER: 'Chỉ nhóm trưởng mới làm được việc này',
  LEADER_AFK: 'Nhóm trưởng không thể tạm rời nhóm',
  FOLLOW: 'Đã ở trong nhóm thì cần nghe lời nhóm trưởng!',
  TOO_FAR: 'Cách nhóm trưởng quá xa, hãy đến gần nhóm trưởng',
  NOT_AFK: 'Bạn không ở trạng thái tạm rời nhóm',
  NEED_BOOK: 'Về nhóm từ xa cần Sách Hồi Nhóm (chưa hỗ trợ)',
  GIVE_FAIL: 'Đổi nhóm trưởng thất bại.',
} as const;

type Shell = Pick<Party, 'leaderId' | 'afk'>;
const SOLO: Shell = { leaderId: -1, afk: new Set() };

@Injectable()
export class PartyService implements OnModuleInit {
  constructor(
    private readonly parties: PartyManager,
    private readonly scenes: SceneManager,
    private readonly gateway: GameGateway,
    private readonly characters: CharacterService,
  ) {}

  onModuleInit(): void {
    const gone = (s: Session): Promise<void> => this.onGone(s);
    this.gateway.onDisconnect(gone);
    this.gateway.onCharacterLeave(gone);
  }

  /** Scene payloads (createChars, onScenePlayerEntered, sceneLogin self) carry the party flags. */
  decorate(sc: SceneCharacter): SceneCharacter {
    return { ...sc, ...this.parties.flagsOf(sc.id) };
  }

  async invite(session: Session, targetCid: number): Promise<void> {
    const me = session.characterId!;
    const target = this.scenes.findByCharacter(targetCid);
    if (!target) return this.note(session, NOTE.OFFLINE);
    if (target.battleId !== null) return void session.callback('onGroupCantJoin', targetCid, GroupCantJoinCode.SPECIAL_STATE);
    const r = this.parties.invite(me, targetCid);
    if (!r.ok) {
      if (r.reason === 'self') throw RpcException.invalidArgs('cid');
      return void session.callback('onGroupCantJoin', targetCid, r.code);
    }
    const info = await this.memberInfo(me, SOLO);
    const dis = target.mapId !== session.mapId ? ({ dis: 'far' } as const) : {};
    target.callback('onGroupInvited', { cid: me, name: info?.name ?? session.characterName ?? '?', level: info?.level ?? 1, ...dis });
    this.note(session, `Bạn đã gửi cho ${target.characterName} lời mời gia nhập nhóm.`);
  }

  async join(session: Session, inviterCid: number): Promise<void> {
    const me = session.characterId!;
    if (!this.scenes.findByCharacter(inviterCid)) {
      this.parties.deny(me, inviterCid);
      return this.note(session, NOTE.OFFLINE);
    }
    const r = this.parties.accept(me, inviterCid);
    if (!r.ok) return this.joinFailed(session, r.reason, r.code);
    this.afterJoin(r.party, me);
    await this.refresh(r.party);
    for (const cid of r.created ? [r.party.leaderId, me] : [me]) this.announce(cid);
  }

  async deny(session: Session, otherCid: number): Promise<void> {
    const me = session.characterId!;
    const kind = this.parties.deny(me, otherCid);
    const other = this.scenes.findByCharacter(otherCid);
    if (kind === 'none' || !other) return;
    other.callback(kind === 'invite' ? 'onGroupDeny' : 'onGroupRequestDeny', { cid: me, name: session.characterName ?? '?' });
  }

  /** groupRequest(..., targetCid): a player without a party asks the target's leader to take them in. */
  async request(session: Session, targetCid: number): Promise<void> {
    const me = session.characterId!;
    const r = this.parties.request(me, targetCid);
    if (!r.ok) {
      if (r.reason === 'self') throw RpcException.invalidArgs('cid');
      if (r.reason === 'noParty') return this.note(session, NOTE.NO_PARTY);
      return void session.callback('onGroupCantJoin', r.reason === 'inGroup' ? me : targetCid, r.code);
    }
    const info = await this.memberInfo(me, SOLO);
    this.scenes.findByCharacter(r.leaderId)?.callback('onGroupRequest', { cid: me, name: info?.name ?? '?', level: info?.level ?? 1 });
    this.note(session, 'Đã gửi yêu cầu gia nhập nhóm.');
  }

  /** groupAdd(cid): the leader accepts an applicant. */
  async add(session: Session, applicantCid: number): Promise<boolean> {
    const me = session.characterId!;
    if (!this.scenes.findByCharacter(applicantCid)) {
      this.parties.deny(me, applicantCid);
      this.note(session, NOTE.OFFLINE);
      return false;
    }
    const r = this.parties.acceptRequest(me, applicantCid);
    if (!r.ok) {
      if (r.reason === 'notLeader') this.note(session, NOTE.NOT_LEADER);
      else if (r.reason === 'expired') this.note(session, NOTE.EXPIRED);
      else session.callback('onGroupCantJoin', applicantCid, r.code);
      return false;
    }
    this.afterJoin(r.party, applicantCid);
    await this.refresh(r.party);
    this.announce(applicantCid);
    return true;
  }

  async leave(session: Session): Promise<void> {
    await this.afterLeave(this.parties.leave(session.characterId!));
  }

  async kick(session: Session, targetCid: number): Promise<void> {
    const r = this.parties.kick(session.characterId!, targetCid);
    if (!r.ok) {
      if (r.reason === 'notLeader') throw RpcException.forbidden(NOTE.NOT_LEADER);
      throw RpcException.invalidArgs('cid');
    }
    await this.afterLeave(r.result);
  }

  /** groupGiveLeader(cid): refused (false) for an AFK member or one on another map: the followers would be stranded. */
  async giveLeader(session: Session, targetCid: number): Promise<boolean> {
    const me = session.characterId!;
    const party = this.parties.partyOf(me);
    const target = this.scenes.findByCharacter(targetCid);
    if (!party || party.leaderId !== me || !target || party.afk.has(targetCid) || target.mapId !== session.mapId) {
      this.note(session, NOTE.GIVE_FAIL);
      return false;
    }
    const r = this.parties.giveLeader(me, targetCid);
    if (!r.ok) return false;
    const members = await this.members(r.party);
    this.pushTo(r.party.members, 'onGroupJoined', this.joined(members));
    const push: GroupGiveLeaderPush = {
      sid: me, oName: session.characterName ?? '?', tid: targetCid, nName: target.characterName ?? '?',
      mList: buildMList(members), members,
    };
    this.pushTo(r.party.members, 'onGroupGiveLeader', push);
    this.announce(me);
    this.announce(targetCid);
    return true;
  }

  async setAfk(session: Session): Promise<GroupAfkReply> {
    const me = session.characterId!;
    const r = this.parties.setAfk(me, true);
    if (!r.ok) throw RpcException.forbidden(r.reason === 'leader' ? NOTE.LEADER_AFK : NOTE.NO_PARTY);
    await this.pushAfk(r.party, 'onGroupAfk', me);
    return { cid: me };
  }

  /** unGroupAFK(near): needs near === true and the leader on this map within 300 px (the return book is not ported). */
  async returnFromAfk(session: Session, near: boolean): Promise<GroupAfkReply> {
    const me = session.characterId!;
    const party = this.parties.partyOf(me);
    if (!party || !party.afk.has(me)) throw RpcException.forbidden(NOTE.NOT_AFK);
    if (!near) throw RpcException.forbidden(NOTE.NEED_BOOK);
    const [mine, lead] = await Promise.all([this.characters.getById(me), this.characters.getById(party.leaderId)]);
    const at = (d: typeof mine): { mapId: number; x: number; y: number } => ({ mapId: d.mapId, x: d.posX, y: d.posY });
    if (!withinAfkReturn(at(mine), at(lead))) throw RpcException.forbidden(NOTE.TOO_FAR);
    this.parties.setAfk(me, false);
    await this.pushAfk(party, 'unGroupAfk', me);
    return { cid: me };
  }

  /** udcp / udcr gate: non-leader, non-AFK members cannot walk. */
  canMove(session: Session): boolean {
    return this.parties.canWalk(session.characterId!);
  }

  /** True when the session leads a party (a personal-only member or no party: false). */
  isLeader(session: Session): boolean {
    return this.parties.partyOf(session.characterId!)?.leaderId === session.characterId;
  }

  denyMove(session: Session): void {
    this.note(session, NOTE.FOLLOW);
  }

  /** Followers currently with the leader on its map and not fighting (the ones that move with it). */
  followersOn(leader: Session): Session[] {
    return this.parties.followersOf(leader.characterId!)
      .map((cid) => this.scenes.findByCharacter(cid))
      .filter((s): s is Session => s !== undefined && s.mapId === leader.mapId && s.battleId === null);
  }

  /** Followers' stored position follows the leader's (clients animate the trail from the leader's onCR). */
  async relayMove(leader: Session, x: number, y: number, dir: number): Promise<void> {
    const ids = this.followersOn(leader).map((s) => s.characterId!);
    await this.characters.updatePositions(ids, leader.mapId, x, y, dir);
  }

  /** Re-sends the full snapshot to every member (map ids changed after a follow move). */
  async refreshOf(cid: number): Promise<void> {
    const party = this.parties.partyOf(cid);
    if (party) await this.refresh(party);
  }

  private async onGone(session: Session): Promise<void> {
    const cid = session.characterId;
    if (cid === null) return;
    this.parties.forget(cid);
    await this.afterLeave(this.parties.leave(cid));
  }

  private joinFailed(session: Session, reason: 'expired' | 'inGroup' | 'full', code?: number): void {
    if (reason === 'expired') this.note(session, NOTE.EXPIRED);
    else session.callback('onGroupCantJoin', session.characterId, code);
  }

  /** A joiner on another map than the leader starts AFK: free to walk over, then unGroupAFK(true) within 300 px. */
  private afterJoin(party: Party, joinerCid: number): void {
    const joiner = this.scenes.findByCharacter(joinerCid);
    const leader = this.scenes.findByCharacter(party.leaderId);
    if (joiner && leader && joiner.mapId !== leader.mapId) this.parties.setAfk(joinerCid, true);
  }

  private async afterLeave(r: LeaveResult): Promise<void> {
    if (r.kind === 'none') return;
    if (r.kind === 'left') {
      const members = await this.members(r.party);
      const leaver = await this.memberInfo(r.leaverId, SOLO);
      const push: GroupLeavePush = { sid: r.leaverId, name: leaver?.name ?? '?', mList: buildMList(members), members };
      this.pushTo([...r.party.members, r.leaverId], 'onGroupLeave', push);
      if (r.newLeaderId !== null) this.pushTo(r.party.members, 'onGroupJoined', this.joined(members));
      this.announce(r.leaverId);
      if (r.newLeaderId !== null) this.announce(r.newLeaderId);
      return;
    }
    const shell: Shell = { leaderId: r.members[0], afk: new Set() };
    const infos = await Promise.all(r.members.map((cid) => this.memberInfo(cid, shell)));
    this.pushTo(r.members, 'onGroupDismiss', buildMList(infos.filter((m): m is GroupMember => m !== null)));
    for (const cid of r.members) this.announce(cid);
  }

  private async pushAfk(party: Party, method: 'onGroupAfk' | 'unGroupAfk', cid: number): Promise<void> {
    const members = await this.members(party);
    const push: GroupAfkPush = { cid, mList: buildMList(members), members };
    this.pushTo(party.members, method, push);
    this.announce(cid);
  }

  private async refresh(party: Party): Promise<void> {
    this.pushTo(party.members, 'onGroupJoined', this.joined(await this.members(party)));
  }

  private joined(members: GroupMember[]): GroupJoined {
    return {
      groupCharactorList: members,
      groupAKFCidList: members.filter((m) => m.afk).map((m) => m.cid),
      mList: buildMList(members),
      members,
    };
  }

  private async members(party: Party): Promise<GroupMember[]> {
    const all = await Promise.all(party.members.map((cid) => this.memberInfo(cid, party)));
    return all.filter((m): m is GroupMember => m !== null);
  }

  private async memberInfo(cid: number, party: Shell): Promise<GroupMember | null> {
    const doc = await this.characters.getById(cid).catch(() => null);
    if (!doc) return null;
    return {
      cid, name: doc.name, level: doc.level, classId: doc.classId, gender: doc.gender,
      iconCode: this.characters.iconCode(doc.classId, doc.gender),
      isLeader: party.leaderId === cid, afk: party.afk.has(cid),
      mapId: this.scenes.findByCharacter(cid)?.mapId ?? doc.mapId,
    };
  }

  /** Map broadcast of a character's current party flags (leader flag over the entity). */
  private announce(cid: number): void {
    const s = this.scenes.findByCharacter(cid);
    if (!s || !s.mapId) return;
    const flag: GroupFlagPush = { cid, ...this.parties.flagsOf(cid) };
    this.scenes.broadcast(s.mapId, 'onGroupFlag', [flag]);
  }

  private pushTo(cids: number[], method: string, ...args: unknown[]): void {
    for (const cid of new Set(cids)) this.scenes.findByCharacter(cid)?.callback(method, ...args);
  }

  private note(session: Session, text: string): void {
    session.callback('onSystemMidMsgOrNote', text);
  }
}
