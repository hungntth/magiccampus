// 3v3 matching and scoring (M14 phase H): every 5 s the queued, rested rooms whose members all stand on map 73 are paired
// (pairRooms) and fought as a system PvP battle (PvpService.startSystem, characters + battle pets, full HP / MP at the end). The battle
// end hook decides the result, pays points by room size, pushes the score, rests the rooms, runs the loss streak and posts the notice.
// Pushes: onRefreshPVPPoint, onUpdateMyPoint, onPushPVPQueue (queue off after the event), onSystemSay (rest), onRedMsg (world notice).

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  decideResult, matchNotice, pairRooms, pointsFor, streakBuff, THREE_PVP, THREE_PVP_TEXT, type PvpQueuePush, type RefreshPvpPointPush,
} from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { BattleHooks, type BattleEndEvent } from '../combat/battle-hooks';
import { CombatService } from '../combat/combat.service';
import { PvpService, type Duelist } from '../combat/pvp.service';
import { aliveCharacters } from '../combat/pvp-rules';
import { CharacterStatsService } from '../stats/character-stats.service';
import type { Room } from './threepvp-rooms';
import { ThreePvpProgressService } from './threepvp-progress.service';
import { ThreePvpRoomsService } from './threepvp-rooms.service';
import { ThreePvpState } from './threepvp-state';
import { ThreePvpStreakService } from './threepvp-streak.service';

export const THREE_PVP_SOURCE = 'threepvp';

interface Side {
  roomId: number;
  size: number;
  cids: number[];
  names: string[];
}

interface Fight {
  a: Side;
  b: Side;
}

@Injectable()
export class ThreePvpMatchService implements OnModuleInit {
  private readonly logger = new Logger(ThreePvpMatchService.name);
  private readonly fights = new Map<string, Fight>();
  private lastTick = 0;

  constructor(
    private readonly state: ThreePvpState,
    private readonly rooms: ThreePvpRoomsService,
    private readonly scenes: SceneManager,
    private readonly combat: CombatService,
    private readonly pvp: PvpService,
    private readonly stats: CharacterStatsService,
    private readonly hooks: BattleHooks,
    private readonly progress: ThreePvpProgressService,
    private readonly streak: ThreePvpStreakService,
  ) {}

  onModuleInit(): void {
    this.hooks.onEnd(THREE_PVP_SOURCE, (e) => this.onEnd(e));
  }

  /** Arena battles still running (the settlement waits for them). */
  activeFights(): number {
    return this.fights.size;
  }

  /** The 1 s run tick calls this; a pairing pass runs every MATCH_INTERVAL_MS while the event fights. */
  async tick(now: number): Promise<void> {
    if (this.state.phase(now) !== 'fighting' || now - this.lastTick < THREE_PVP.MATCH_INTERVAL_MS) return;
    this.lastTick = now;
    const pool = this.state.book.all().filter((r) => r.queued && !r.fighting && now >= r.restUntil && this.present(r).length === r.members.length);
    const pairs = pairRooms(pool.map((r) => ({
      id: r.id, size: r.members.length, strength: r.members.reduce((n, m) => n + m.level, 0), lastOpponent: r.lastOpponent,
    })));
    for (const [a, b] of pairs) {
      try {
        await this.start(this.state.book.get(a)!, this.state.book.get(b)!);
      } catch (e) {
        this.logger.error(`3v3 match start failed (rooms ${a} / ${b}): ${(e as Error).message}`);
      }
    }
  }

  /** Members standing on map 73 outside a battle, leader first. */
  private present(room: Room): Session[] {
    return room.members.flatMap((m) => {
      const s = this.scenes.findByCharacter(m.cid);
      return s && s.mapId === THREE_PVP.MAP_ID && s.battleId === null ? [s] : [];
    });
  }

  private async duelists(room: Room, pets: Awaited<ReturnType<CombatService['loadPets']>>): Promise<Duelist[]> {
    const out: Duelist[] = [];
    for (const s of this.present(room)) {
      const st = await this.stats.compute(s.characterId!);
      st.doc.currentHp = st.maxHp; // the arena always starts at full HP / MP (and ends that way)
      st.doc.currentMp = st.maxMp;
      out.push({ session: s, st, pet: pets.get(s.characterId!) });
    }
    return out;
  }

  private async start(a: Room, b: Room): Promise<void> {
    const run = this.state.run;
    if (!run) return;
    const pets = await this.combat.loadPets([...a.members, ...b.members].map((m) => m.cid));
    const sideA = await this.duelists(a, pets);
    const sideB = await this.duelists(b, pets);
    const stillOk = (r: Room): boolean => this.state.book.get(r.id) === r && r.queued && !r.fighting;
    if (!stillOk(a) || !stillOk(b) || sideA.length !== a.members.length || sideB.length !== b.members.length) return;
    const battle = this.pvp.startSystem(sideA, sideB, { source: THREE_PVP_SOURCE, key: run.key, restoreAll: true });
    if (!battle) return;
    a.fighting = b.fighting = true;
    a.lastOpponent = b.id;
    b.lastOpponent = a.id;
    const side = (r: Room): Side => ({ roomId: r.id, size: r.members.length, cids: r.members.map((m) => m.cid), names: r.members.map((m) => m.name) });
    this.fights.set(battle.id, { a: side(a), b: side(b) });
  }

  private async onEnd(e: BattleEndEvent): Promise<void> {
    const fight = this.fights.get(e.battle.id);
    if (!fight) return;
    this.fights.delete(e.battle.id);
    const alive = e.battle.ctx?.alive ?? {
      a: aliveCharacters(e.battle.fighters.values(), 'player'), b: aliveCharacters(e.battle.fighters.values(), 'enemy'),
    };
    const outcome = decideResult(e.result, alive.a, alive.b);
    for (const [key, side] of [['a', fight.a], ['b', fight.b]] as const) {
      const win = outcome === key;
      await this.scoreSide(e, side, win);
      await this.afterMatch(side, win, outcome === 'draw');
    }
    this.scenes.broadcastAll('onRedMsg', [matchNotice(outcome, fight.a.names, fight.b.names)]);
  }

  /** Points by the room size at the start; only members that fought, did not drop and still stand on map 73 count. */
  private async scoreSide(e: BattleEndEvent, side: Side, win: boolean): Promise<void> {
    const run = this.state.run;
    if (!run) return;
    const points = pointsFor(side.size, win);
    for (const cid of side.cids) {
      const member = e.members.find((m) => m.cid === cid);
      const session = this.scenes.findByCharacter(cid);
      if (!member || member.left || !session || session.mapId !== THREE_PVP.MAP_ID) continue;
      const { old, total } = await this.progress.addPoints(run, cid, points);
      session.callback('onRefreshPVPPoint', { type: 'PVPResult', score: points, oldScore: old, isWinner: win } satisfies RefreshPvpPointPush);
      session.callback('onUpdateMyPoint', { rank: this.progress.rankOf(run, cid), point: total });
    }
  }

  /** Room bookkeeping: rest (20 s win / 15 s otherwise), the loss streak (a win clears it, a draw keeps it) and the queue after the event. */
  private async afterMatch(side: Side, win: boolean, draw: boolean): Promise<void> {
    const room = this.state.book.get(side.roomId);
    if (!room || !side.cids.some((c) => room.members.some((m) => m.cid === c))) return;
    room.fighting = false;
    const rest = win ? THREE_PVP.WIN_REST_MS : THREE_PVP.LOSS_REST_MS;
    room.restUntil = Date.now() + rest;
    if (win) room.losses = 0;
    else if (!draw) room.losses++;
    const buff = win ? null : draw ? null : streakBuff(room.losses);
    for (const m of room.members) {
      if (win) await this.streak.clear(m.cid);
      else if (buff !== null) await this.streak.apply(m.cid, buff);
      const s = this.scenes.findByCharacter(m.cid);
      if (s && this.state.phase() === 'fighting') s.callback('onSystemSay', THREE_PVP_TEXT.REST(Math.round(rest / 1000)));
    }
    if (this.state.phase() !== 'fighting' && room.queued) {
      room.queued = false;
      this.rooms.pushRoom(room, 'onPushPVPQueue', { type: 2, state: 0 } satisfies PvpQueuePush);
    }
  }
}
