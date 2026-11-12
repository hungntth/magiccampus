// Team rooms ("Chiêu mộ nhóm", M14 phase F): a recruit ad on a party. Create / apply / accept / kick / leave / host / config and the
// board reads. Pushes: onCreateRoom, onGetRoomList, onGetMyRoom, onApplyToRoom, onApplyListChange, onAcceptRoomApply, onKickRoomMember,
// onMemberLeave (bare cid), onSetRoomHost, onSetRoomConfig, onSystemMidMsgOrNote plus the party pushes of PartyService.

import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  DiaryTask, nextScheduledAt, roomExpired, ROOM, ROOM_TEXT, validateRecruitWill,
  type ApplyListChangePush, type CreateRoomArg, type MyRoomReply, type MyRoomView, type RoomAd, type RoomListReply, type RoomMemberRow,
  type SetRoomConfigArg, type SetRoomConfigPush,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { DiaryEvents } from '../activity/diary-events.service';
import { CharacterService } from '../character/character.service';
import { PartyManager, RoomManager } from './party.manager';
import type { LeaveResult, Party } from './party-rules';
import { PartyService } from './party.service';

const SWEEP_MS = 20_000;
const note = (s: Session, text: string): void => s.callback('onSystemMidMsgOrNote', text);

@Injectable()
export class RoomService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Characters being kicked right now: they get onKickRoomMember instead of onMemberLeave. */
  private readonly kicking = new Set<number>();

  constructor(
    private readonly parties: PartyManager,
    private readonly rooms: RoomManager,
    private readonly party: PartyService,
    private readonly scenes: SceneManager,
    private readonly characters: CharacterService,
    private readonly diary: DiaryEvents,
  ) {}

  onModuleInit(): void {
    this.party.onLeave((r) => this.onLeft(r));
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** createRoom(arg): upgrades the caller's own party (leader only) or opens a one-member room. Returns the room number. */
  async create(session: Session, arg: CreateRoomArg): Promise<number> {
    const me = session.characterId!;
    const level = (await this.characters.getById(me)).level;
    if (level < ROOM.minUiLevel) throw RpcException.forbidden(ROOM_TEXT.LEVEL_UI);
    const check = validateRecruitWill(arg, level);
    if (!check.ok) throw RpcException.forbidden(check.note);
    const at = nextScheduledAt(Date.now(), arg.hour, arg.minute);
    if (at === null) throw RpcException.forbidden(ROOM_TEXT.BAD_TIME);
    const existing = this.parties.partyOf(me);
    if (existing && existing.leaderId !== me) throw RpcException.forbidden(ROOM_TEXT.NOT_TEAM_LEADER);
    if (existing?.room) throw RpcException.forbidden(ROOM_TEXT.HAS_ROOM);
    if (this.rooms.cooldownLeft(me) > 0) throw RpcException.forbidden(ROOM_TEXT.COOLDOWN);
    const party = existing ?? this.parties.createSolo(me);
    if (!party) throw RpcException.forbidden(ROOM_TEXT.IN_GROUP);
    party.room = { fid: arg.fid, type: arg.type, minLevel: arg.minLevel, maxLevel: arg.maxLevel, scheduledAt: at };
    this.rooms.markCreated(me);
    this.rooms.drop(me);
    await this.party.refreshOf(me);
    this.party.announce(me);
    if (!existing) this.diary.record(me, DiaryTask.PARTY);
    session.callback('onCreateRoom', party.id);
    await this.pushView(party);
    return party.id;
  }

  /** getRoomList(): open (not expired) rooms by time then id; also pushed as onGetRoomList. */
  async list(session: Session): Promise<RoomListReply> {
    await this.sweep();
    const me = session.characterId!;
    const rooms = this.parties.allParties().filter((p) => p.room).sort((a, b) => a.room!.scheduledAt - b.room!.scheduledAt || a.id - b.id);
    const leaders = new Map((await this.characters.findByIds(rooms.map((p) => p.leaderId))).map((d) => [d._id, d.name]));
    const reply: RoomListReply = {
      st: this.parties.partyOf(me)?.room || this.rooms.pendingOf(me) !== undefined ? 1 : 0,
      d: rooms.map((p) => ({
        roomNo: p.id, cid: p.leaderId, leaderName: leaders.get(p.leaderId) ?? '?', minLevel: p.room!.minLevel, maxLevel: p.room!.maxLevel,
        fid: p.room!.fid, type: p.room!.type, time: p.room!.scheduledAt, memberNum: p.members.length,
      })),
    };
    session.callback('onGetRoomList', reply);
    return reply;
  }

  /** getMyRoom(): f 1 in a room, 2 waiting on an application, 0 none; also pushed as onGetMyRoom. */
  async mine(session: Session): Promise<MyRoomReply> {
    const me = session.characterId!;
    const own = this.parties.partyOf(me);
    let reply: MyRoomReply = { f: 0 };
    if (own?.room) {
      reply = { f: 1, d: await this.view(own, me === own.leaderId) };
    } else {
      const pending = this.rooms.pendingOf(me);
      const target = pending === undefined ? undefined : this.parties.partyById(pending);
      if (target?.room) reply = { f: 2, d: { ...(await this.view(target, false)), members: [] } };
      else this.rooms.drop(me);
    }
    session.callback('onGetMyRoom', reply);
    return reply;
  }

  async apply(session: Session, roomNo: number): Promise<void> {
    await this.sweep();
    const me = session.characterId!;
    const party = this.parties.partyById(roomNo);
    if (!party?.room) throw RpcException.forbidden(ROOM_TEXT.NO_ROOM);
    const doc = await this.characters.getById(me);
    if (doc.level < party.room.minLevel) throw RpcException.forbidden(ROOM_TEXT.LEVEL_LOW);
    if (this.parties.partyOf(me)) throw RpcException.forbidden(ROOM_TEXT.IN_GROUP);
    if (party.members.length >= ROOM.memberLimit) throw RpcException.forbidden(ROOM_TEXT.FULL);
    const out = this.rooms.apply(me, party.id);
    if (out === 'already') throw RpcException.forbidden(ROOM_TEXT.ALREADY_APPLIED);
    if (out === 'full') throw RpcException.forbidden(ROOM_TEXT.APPLY_FULL);
    session.callback('onApplyToRoom');
    const leader = this.scenes.findByCharacter(party.leaderId);
    const row: RoomMemberRow = { cid: me, name: doc.name, level: doc.level, classId: doc.classId };
    leader?.callback('onApplyListChange', { f: true, d: row, leaderId: party.leaderId } satisfies ApplyListChangePush);
    if (leader) note(leader, ROOM_TEXT.APPLY(doc.name));
  }

  /** acceptRoomApply(cid): the leader takes an applicant in; an applicant that joined elsewhere or left is dropped. */
  async accept(session: Session, applicantCid: number): Promise<void> {
    const me = session.characterId!;
    const party = this.leadRoom(me);
    if (this.rooms.pendingOf(applicantCid) !== party.id) throw RpcException.forbidden(ROOM_TEXT.NOT_APPLICANT);
    const [doc] = await this.characters.findByIds([applicantCid]);
    const row: RoomMemberRow | null = doc ? { cid: doc._id, name: doc.name, level: doc.level, classId: doc.classId } : null;
    const dropped = (text: string): never => {
      this.rooms.drop(applicantCid);
      if (row) session.callback('onApplyListChange', { f: false, d: row, leaderId: me } satisfies ApplyListChangePush);
      throw RpcException.forbidden(text);
    };
    const applicant = this.scenes.findByCharacter(applicantCid);
    if (!doc || !applicant) return dropped('Người chơi không trực tuyến');
    if (this.parties.partyOf(applicantCid)) return dropped(ROOM_TEXT.IN_GROUP);
    const joined = this.parties.addToParty(party.id, applicantCid);
    if (!joined.ok) throw RpcException.forbidden(joined.reason === 'full' ? ROOM_TEXT.FULL : ROOM_TEXT.NO_ROOM);
    this.rooms.drop(applicantCid);
    this.party.afterJoin(party, applicantCid);
    await this.party.refreshOf(me);
    this.party.announce(applicantCid);
    this.diary.record(applicantCid, DiaryTask.PARTY);
    this.pushTo(party.members, 'onAcceptRoomApply', applicantCid);
    await this.pushView(party);
  }

  /** kickRoomMember(cid): onKickRoomMember to every pre-kick member, then the usual party leave pushes. */
  async kick(session: Session, targetCid: number): Promise<void> {
    const me = session.characterId!;
    const party = this.leadRoom(me);
    if (targetCid === me) throw RpcException.forbidden(ROOM_TEXT.SELF);
    if (!party.members.includes(targetCid)) throw RpcException.forbidden(ROOM_TEXT.NOT_MEMBER);
    const [row] = await this.rows([targetCid]);
    const before = [...party.members];
    const r = this.parties.kick(me, targetCid);
    if (!r.ok) throw RpcException.forbidden(ROOM_TEXT.NOT_MEMBER);
    if (row) this.pushTo(before, 'onKickRoomMember', row);
    this.kicking.add(targetCid);
    try {
      await this.party.afterLeave(r.result);
    } finally {
      this.kicking.delete(targetCid);
    }
    await this.pushView(party);
  }

  /** leaveRoom(): a member leaves; a bare applicant just cancels the application. */
  async leave(session: Session): Promise<void> {
    const me = session.characterId!;
    const own = this.parties.partyOf(me);
    if (!own) {
      if (!this.rooms.drop(me)) throw RpcException.forbidden(ROOM_TEXT.NOT_IN_ROOM);
      session.callback('onGetMyRoom', { f: 0 });
      return;
    }
    if (!own.room) throw RpcException.forbidden(ROOM_TEXT.NOT_IN_ROOM);
    await this.party.afterLeave(this.parties.leave(me));
    if (this.parties.partyById(own.id)) await this.pushView(own);
  }

  /** setRoomHost(cid): hands the lead over (same rules as groupGiveLeader) and tells the room. */
  async setHost(session: Session, targetCid: number): Promise<boolean> {
    const me = session.characterId!;
    const party = this.leadRoom(me);
    if (targetCid === me) throw RpcException.forbidden(ROOM_TEXT.SELF);
    if (!(await this.party.giveLeader(session, targetCid))) return false;
    this.pushTo(party.members, 'onSetRoomHost', targetCid);
    await this.pushView(party);
    return true;
  }

  /** setRoomConfig(arg): leader edits the ad; the merged ad is validated like a new one. */
  async setConfig(session: Session, arg: SetRoomConfigArg): Promise<void> {
    const me = session.characterId!;
    const party = this.leadRoom(me);
    const ad = party.room!;
    const next: RoomAd = {
      fid: arg.fid ?? ad.fid, type: arg.type ?? ad.type, minLevel: arg.minLevel ?? ad.minLevel, maxLevel: arg.maxLevel ?? ad.maxLevel,
      scheduledAt: ad.scheduledAt,
    };
    if (arg.time) {
      const at = nextScheduledAt(Date.now(), arg.time.hour, arg.time.minute);
      if (at === null) throw RpcException.forbidden(ROOM_TEXT.BAD_TIME);
      next.scheduledAt = at;
    }
    const check = validateRecruitWill(next, (await this.characters.getById(me)).level);
    if (!check.ok) throw RpcException.forbidden(check.note);
    if (this.parties.partyById(party.id) !== party || party.leaderId !== me || !party.room) throw RpcException.forbidden(ROOM_TEXT.NO_ROOM);
    party.room = next;
    const push: SetRoomConfigPush = { fid: next.fid, type: next.type, minLevel: next.minLevel, maxLevel: next.maxLevel, time: next.scheduledAt };
    this.pushTo(party.members, 'onSetRoomConfig', push);
  }

  /** Dissolves rooms past their scheduled time + 30 min: the ad goes, a lone leader's party with it. */
  async sweep(): Promise<void> {
    const now = Date.now();
    this.rooms.prune();
    for (const party of this.parties.allParties()) {
      if (!party.room || !roomExpired(party.room, now)) continue;
      delete party.room;
      const waiting = this.rooms.dropParty(party.id);
      const members = [...party.members];
      for (const cid of [...members, ...waiting]) {
        const s = this.scenes.findByCharacter(cid);
        s?.callback('onGetMyRoom', { f: 0 });
        if (s) note(s, ROOM_TEXT.EXPIRED);
      }
      if (members.length === 1) await this.party.afterLeave(this.parties.leave(members[0]));
    }
  }

  /** Leave hook (leave, kick, disconnect): the bare-cid onMemberLeave and onSetRoomHost for a room that goes on. */
  private onLeft(r: LeaveResult): void {
    if (r.kind !== 'left') {
      if (r.kind === 'dismissed') this.rooms.drop(r.leaverId);
      return;
    }
    this.rooms.drop(r.leaverId);
    if (!r.party.room) return;
    if (!this.kicking.has(r.leaverId)) this.pushTo([...r.party.members, r.leaverId], 'onMemberLeave', r.leaverId);
    if (r.newLeaderId !== null) this.pushTo(r.party.members, 'onSetRoomHost', r.newLeaderId);
  }

  private leadRoom(me: number): Party {
    const party = this.parties.partyOf(me);
    if (!party?.room) throw RpcException.forbidden(ROOM_TEXT.NOT_IN_ROOM);
    if (party.leaderId !== me) throw RpcException.forbidden(ROOM_TEXT.NOT_LEADER);
    return party;
  }

  private async rows(cids: number[]): Promise<RoomMemberRow[]> {
    const docs = new Map((await this.characters.findByIds(cids)).map((d) => [d._id, d]));
    return cids.flatMap((cid) => {
      const d = docs.get(cid);
      return d ? [{ cid, name: d.name, level: d.level, classId: d.classId }] : [];
    });
  }

  private async view(party: Party, withApplicants: boolean): Promise<MyRoomView> {
    const ad = party.room!;
    const [members, applyList] = await Promise.all([
      this.rows(party.members), this.rows(withApplicants ? this.rooms.applicantsOf(party.id) : []),
    ]);
    return {
      roomNo: party.id, cid: party.leaderId, fid: ad.fid, type: ad.type, time: ad.scheduledAt, minLevel: ad.minLevel, maxLevel: ad.maxLevel,
      members, applyList,
    };
  }

  /** Fresh `onGetMyRoom` to every member (the leader's copy carries the applicants). */
  private async pushView(party: Party): Promise<void> {
    if (!party.room) return;
    for (const cid of party.members) {
      const s = this.scenes.findByCharacter(cid);
      if (s) s.callback('onGetMyRoom', { f: 1, d: await this.view(party, cid === party.leaderId) } satisfies MyRoomReply);
    }
  }

  private pushTo(cids: number[], method: string, ...args: unknown[]): void {
    for (const cid of new Set(cids)) this.scenes.findByCharacter(cid)?.callback(method, ...args);
  }
}
