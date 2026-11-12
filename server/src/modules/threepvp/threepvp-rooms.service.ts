// 3v3 room flows on top of the pure RoomBook (M14 phase H): entering map 73 (teleport before the reply, origin remembered), create / join /
// leave / kick / limit / password / ready / start / invite and the disconnect + stray sweep. Refusals are `onMidNote` and a null reply
// (Go). Pushes: onSceneEnter, onCreatePVPRoom, onAddRoomMember, onEnterPVPRoom, onPVPKickByLeader, onUpdatePVPRoom, onPushPVPQueue,
// inviteByLeader, onUpdateMyPoint.

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  THREE_PVP, THREE_PVP_TEXT, type InviteByLeaderPush, type PvpQueuePush, type PvpRoom, type PvpRoomMap, type UpdateMyPointPush, type UpdatePvpRoomPush,
} from '@mc/shared';
import { GameGateway } from '../../gateway/game.gateway';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { midNote } from '../npcscript/menu';
import { PartyManager } from '../party/party.manager';
import { PartyService } from '../party/party.service';
import { SceneTransportService } from '../scene/scene-transport.service';
import { clampLimit, normalizePass, REFUSAL_TEXT, type Room } from './threepvp-rooms';
import { ThreePvpProgressService } from './threepvp-progress.service';
import { ThreePvpState } from './threepvp-state';
import { ThreePvpStreakService } from './threepvp-streak.service';

interface Origin {
  map: number;
  x: number;
  y: number;
}

@Injectable()
export class ThreePvpRoomsService implements OnModuleInit {
  private readonly logger = new Logger(ThreePvpRoomsService.name);
  /** Where each character stood before entering map 73 (memory only). */
  private readonly back = new Map<number, Origin>();

  constructor(
    private readonly state: ThreePvpState,
    private readonly scenes: SceneManager,
    private readonly gateway: GameGateway,
    private readonly characters: CharacterService,
    private readonly gameData: GameDataService,
    private readonly transport: SceneTransportService,
    private readonly parties: PartyManager,
    private readonly party: PartyService,
    private readonly progress: ThreePvpProgressService,
    private readonly streak: ThreePvpStreakService,
  ) {}

  onModuleInit(): void {
    const gone = (s: Session): Promise<void> => this.onGone(s);
    this.gateway.onDisconnect(gone);
    this.gateway.onCharacterLeave(gone);
  }

  private get book() {
    return this.state.book;
  }

  /** checkPVPLine: an open run and level >= 50 (the single process has one line). */
  async checkLine(session: Session): Promise<boolean> {
    return this.gate(session);
  }

  /** initPVPRoom: teleports to map 73 first (the room list must still be on screen after the scene change), then answers with every room. */
  async enter(session: Session): Promise<PvpRoomMap | null> {
    if (!(await this.gate(session))) return null;
    const cid = session.characterId!;
    if (this.parties.partyOf(cid)) {
      await this.party.leave(session);
      midNote(session, THREE_PVP_TEXT.PARTY_LEFT);
    }
    if (session.mapId !== THREE_PVP.MAP_ID) {
      const doc = await this.characters.getById(cid);
      this.back.set(cid, { map: doc.mapId, x: doc.posX, y: doc.posY });
      session.callback('onSceneEnter', await this.transport.moveToMap(session, THREE_PVP.MAP_ID, THREE_PVP.ENTRY.x, THREE_PVP.ENTRY.y, false));
    }
    const room = this.book.roomOf(cid);
    if (room) {
      this.later(async () => {
        session.callback('onEnterPVPRoom', this.book.toWire(room));
        session.callback('onUpdateMyPoint', this.pointOf(cid));
        this.armLeader(room);
      });
    }
    return this.roomMap();
  }

  async create(session: Session): Promise<PvpRoom | null> {
    if (!(await this.gate(session)) || !this.onMap(session)) return null;
    const cid = session.characterId!;
    if (this.book.roomOf(cid)) return this.refuse(session, THREE_PVP_TEXT.IN_ROOM);
    const doc = await this.characters.getById(cid);
    if (this.book.roomOf(cid)) return this.refuse(session, THREE_PVP_TEXT.IN_ROOM);
    const room = this.book.create({ cid, name: doc.name, level: doc.level });
    const wire = this.book.toWire(room);
    this.pushViewers('onCreatePVPRoom', wire);
    this.later(async () => this.armLeader(room));
    return wire;
  }

  /** addPVPGroup / quickEnterRoom / an accepted invite. */
  async join(session: Session, roomId: number, pass: unknown, fromInvite = false): Promise<PvpRoom | null> {
    if (!(await this.gate(session)) || !this.onMap(session)) return null;
    const cid = session.characterId!;
    if (this.book.roomOf(cid)) return this.refuse(session, THREE_PVP_TEXT.IN_ROOM);
    if (!this.book.get(roomId)) return this.refuse(session, THREE_PVP_TEXT.NO_ROOM);
    const doc = await this.characters.getById(cid);
    const room = this.book.get(roomId);
    if (!room) return this.refuse(session, THREE_PVP_TEXT.NO_ROOM);
    if (this.book.roomOf(cid)) return this.refuse(session, THREE_PVP_TEXT.IN_ROOM);
    const why = this.book.joinRefusal(room, doc.level, typeof pass === 'string' ? pass : '', fromInvite || room.invited.has(cid) ? cid : undefined);
    if (why) return this.refuse(session, REFUSAL_TEXT[why]);
    this.book.join(room, { cid, name: doc.name, level: doc.level });
    const wire = this.book.toWire(room);
    session.callback('onEnterPVPRoom', wire);
    session.callback('onUpdateMyPoint', this.pointOf(cid));
    this.pushRoom(room, 'onAddRoomMember', wire, cid);
    this.pushViewers('onAddRoomMember', wire);
    this.armLeader(room);
    return wire;
  }

  /** leavePVPRoom: leaves the room (allowed while queued) and goes back to where the player came from; ignored in a battle. */
  async leave(session: Session): Promise<void> {
    if (session.battleId !== null) return;
    await this.removeFromRoom(session.characterId!);
    if (session.mapId === THREE_PVP.MAP_ID) await this.moveOut(session);
  }

  /** leftPVPGroup: leaves the room but stays on the map; `{}` when not in a room, null while queued or fighting. */
  async leftGroup(session: Session): Promise<PvpRoomMap | null> {
    const room = this.book.roomOf(session.characterId!);
    if (!room) return {};
    if (room.queued || room.fighting) return this.refuse(session, THREE_PVP_TEXT.QUEUED_ACT);
    await this.removeFromRoom(session.characterId!);
    return this.roomMap();
  }

  async kick(session: Session, targetCid: number): Promise<void> {
    const room = this.leaderRoom(session);
    if (!room) return;
    if (room.queued || room.fighting) return void midNote(session, THREE_PVP_TEXT.QUEUED_ACT);
    if (targetCid === room.leaderId || !room.members.some((m) => m.cid === targetCid)) return;
    await this.removeFromRoom(targetCid);
    this.scenes.findByCharacter(targetCid)?.callback('onPVPKickByLeader', this.roomMap());
  }

  setLimit(session: Session, min: unknown, max: unknown): void {
    const room = this.leaderRoom(session);
    const lim = clampLimit(min, max);
    if (!room || !lim) return;
    room.min = lim.min;
    room.max = lim.max;
    const push: UpdatePvpRoomPush = { type: 'level', roomId: room.id, lev: lim };
    this.pushRoom(room, 'onUpdatePVPRoom', push);
    this.pushViewers('onUpdatePVPRoom', push);
  }

  /** The leader's push carries the digits; everybody else only sees whether the room is locked ('*'). */
  setPass(session: Session, raw: unknown): void {
    const room = this.leaderRoom(session);
    if (!room) return;
    const pass = normalizePass(raw);
    if (pass === null) return void midNote(session, THREE_PVP_TEXT.BAD_PASS_FORMAT);
    room.pass = pass;
    const masked: UpdatePvpRoomPush = { type: 'pass', roomId: room.id, pass: pass === '' ? '' : '*' };
    session.callback('onUpdatePVPRoom', { type: 'pass', roomId: room.id, pass } satisfies UpdatePvpRoomPush);
    this.pushRoom(room, 'onUpdatePVPRoom', masked, room.leaderId);
    this.pushViewers('onUpdatePVPRoom', masked);
  }

  /** readyOrStartPVP: a member toggles ready; the leader starts matching (everyone ready) or cancels it. */
  ready(session: Session): void {
    const cid = session.characterId!;
    const room = this.book.roomOf(cid);
    if (!room) return void midNote(session, THREE_PVP_TEXT.NOT_IN_ROOM);
    if (room.fighting) return void midNote(session, THREE_PVP_TEXT.FIGHTING);
    if (cid !== room.leaderId) {
      if (room.queued) return void midNote(session, THREE_PVP_TEXT.QUEUED_ACT);
      const state = this.book.toggleReady(room, cid);
      if (state !== null) this.pushRoom(room, 'onPushPVPQueue', { type: 1, index: this.book.seatOf(room, cid), cid, state: state ? 1 : 0 } satisfies PvpQueuePush);
      return;
    }
    if (room.queued) {
      room.queued = false;
      return this.pushRoom(room, 'onPushPVPQueue', { type: 2, state: 0 } satisfies PvpQueuePush);
    }
    if (this.state.phase() !== 'fighting') return void midNote(session, THREE_PVP_TEXT.CLOSED);
    if (!this.book.canStart(room)) return void midNote(session, 'Còn thành viên chưa sẵn sàng.');
    room.queued = true;
    this.pushRoom(room, 'onPushPVPQueue', { type: 2, state: 2 } satisfies PvpQueuePush);
  }

  /** quickInvite: up to 20 map viewers inside the level range get inviteByLeader and may join without the password. */
  async invite(session: Session): Promise<void> {
    const room = this.leaderRoom(session);
    if (!room) return;
    if (room.queued || room.fighting) return void midNote(session, THREE_PVP_TEXT.QUEUED_ACT);
    const viewers = this.viewers();
    const levels = new Map((await this.characters.findByIds(viewers.map((s) => s.characterId!))).map((d) => [d._id, d.level]));
    const leaderName = room.members[0].name;
    let sent = 0;
    for (const s of viewers) {
      const lvl = levels.get(s.characterId!) ?? 0;
      if (sent >= THREE_PVP.INVITE_MAX) break;
      if (lvl < room.min || lvl > room.max || s === session) continue;
      room.invited.add(s.characterId!);
      s.callback('inviteByLeader', { cid: room.leaderId, index: room.id, name: leaderName } satisfies InviteByLeaderPush);
      sent++;
    }
  }

  /** sureInvite(inviterCid, roomId, 1 | -1). */
  async answerInvite(session: Session, inviterCid: number, roomId: number, answer: number): Promise<void> {
    if (answer === 1) {
      await this.join(session, roomId, '', true);
      return;
    }
    const inviter = this.scenes.findByCharacter(inviterCid);
    if (inviter) midNote(inviter, THREE_PVP_TEXT.INVITE_DECLINED);
  }

  roomMap(): PvpRoomMap {
    return Object.fromEntries(this.book.all().map((r) => [String(r.id), this.book.toWire(r)]));
  }

  /** Removes a character from its room (leave, kick, disconnect): pushes the roster, drops the queue and the streak buff. */
  async removeFromRoom(cid: number): Promise<void> {
    const r = this.book.remove(cid);
    if (!r) return;
    await this.streak.clear(cid);
    if (r.empty) return;
    if (r.wasQueued) this.pushRoom(r.room, 'onPushPVPQueue', { type: 2, state: 0 } satisfies PvpQueuePush);
    const wire = this.book.toWire(r.room);
    this.pushRoom(r.room, 'onAddRoomMember', wire);
    this.pushViewers('onAddRoomMember', wire);
    this.armLeader(r.room);
  }

  /** Sends a character back where it came from (the fallback map when none is remembered). */
  async moveOut(session: Session): Promise<void> {
    const cid = session.characterId;
    if (cid === null) return;
    const to = this.returnPoint(cid);
    this.back.delete(cid);
    try {
      session.callback('onSceneEnter', await this.transport.moveToMap(session, to.map, to.x, to.y, false));
    } catch (e) {
      this.logger.warn(`3v3: teleport back of ${cid} failed: ${(e as Error).message}`);
    }
  }

  /** Strays on map 73 (login there, a closed event, the settlement grace over) that are not fighting go out. */
  async sweepMap(keep: (s: Session) => boolean): Promise<void> {
    for (const s of this.scenes.members(THREE_PVP.MAP_ID)) {
      if (s.characterId === null || s.battleId !== null || s.copyId !== 0 || keep(s)) continue;
      await this.removeFromRoom(s.characterId);
      await this.moveOut(s);
    }
  }

  returnPoint(cid: number): Origin {
    const o = this.back.get(cid);
    if (o && o.map > 0 && o.map !== THREE_PVP.MAP_ID && this.gameData.getMap(o.map)) return o;
    return { map: THREE_PVP.EXIT_FALLBACK.map, x: THREE_PVP.EXIT_FALLBACK.x, y: THREE_PVP.EXIT_FALLBACK.y };
  }

  /** Disconnect / back to character select: leaves the room and stores the return position (no stray on map 73). */
  private async onGone(session: Session): Promise<void> {
    const cid = session.characterId;
    if (cid === null) return;
    const wasOnMap = session.mapId === THREE_PVP.MAP_ID;
    await this.removeFromRoom(cid);
    if (wasOnMap) {
      const to = this.returnPoint(cid);
      await this.characters.updatePosition(cid, to.map, to.x, to.y, 0).catch((e: Error) => this.logger.warn(`3v3: return position of ${cid} failed: ${e.message}`));
    }
    this.back.delete(cid);
  }

  /** Flash start gate: for every empty seat the leader gets a ready placeholder (cid 0) so a partial room may start. */
  armLeader(room: Room): void {
    if (room.queued || room.fighting) return;
    const leader = this.scenes.findByCharacter(room.leaderId);
    if (!leader) return;
    for (const seat of this.book.emptySeats(room)) leader.callback('onPushPVPQueue', { type: 1, index: seat, cid: 0, state: 1 } satisfies PvpQueuePush);
    if (this.book.emptySeats(room).length > 0) leader.callback('onAddRoomMember', this.book.toWire(room));
  }

  pointOf(cid: number): UpdateMyPointPush {
    const run = this.state.run;
    return run ? { rank: this.progress.rankOf(run, cid), point: run.points.get(cid)?.total ?? 0 } : { rank: 0, point: 0 };
  }

  /** Online characters on map 73 that are in no room (they see the room list). */
  private viewers(): Session[] {
    return this.scenes.members(THREE_PVP.MAP_ID).filter((s) => s.characterId !== null && !this.book.roomOf(s.characterId));
  }

  private pushViewers(method: string, ...args: unknown[]): void {
    for (const s of this.viewers()) s.callback(method, ...args);
  }

  pushRoom(room: Room, method: string, payload: unknown, exceptCid?: number): void {
    for (const m of room.members) if (m.cid !== exceptCid) this.scenes.findByCharacter(m.cid)?.callback(method, payload);
  }

  private leaderRoom(session: Session): Room | undefined {
    const room = this.book.roomOf(session.characterId!);
    if (!room) return void midNote(session, THREE_PVP_TEXT.NOT_IN_ROOM);
    if (room.leaderId !== session.characterId) return void midNote(session, THREE_PVP_TEXT.NOT_LEADER);
    return room;
  }

  private onMap(session: Session): boolean {
    if (session.mapId === THREE_PVP.MAP_ID) return true;
    midNote(session, THREE_PVP_TEXT.NOT_ON_MAP);
    return false;
  }

  private refuse(session: Session, text: string): null {
    midNote(session, text);
    return null;
  }

  private async gate(session: Session): Promise<boolean> {
    if (this.state.phase() !== 'fighting') return !!this.refuse(session, THREE_PVP_TEXT.CLOSED);
    if ((await this.characters.getById(session.characterId!)).level < THREE_PVP.MIN_LEVEL) return !!this.refuse(session, THREE_PVP_TEXT.LEVEL);
    return true;
  }

  private later(fn: () => Promise<void>): void {
    setTimeout(() => void fn().catch((e: Error) => this.logger.warn(`3v3 delayed push failed: ${e.message}`)), THREE_PVP.LATER_MS).unref();
  }
}
