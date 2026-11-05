// World boss in-memory state (event state stays in memory like Go, M10 decision 3; per-character exp / silver / honor are persisted as
// they are earned and the unclaimed gifts go to the owed list): the single event, its participants and the activity strip flag of
// icon 15. Dependency-free so the activity login payload can read it without pulling the whole world boss module.

import { Injectable } from '@nestjs/common';
import { WB_ACTIVITY_ID, WbFlag, type ActivityStripEntry, type UpdateActivityStatePush, type WbAwardItem } from '@mc/shared';
import { WB } from './wb-config';
import type { WbPhase } from './wb-schedule';
import type { WbRanked } from './wb-settle';

export interface ReturnPoint {
  map: number;
  x: number;
  y: number;
}

export interface WbParticipant extends WbRanked {
  level: number;
  exp: number;
  money: number;
  honor: number;
  cheer: number;
  auto: boolean;
  ret: ReturnPoint | null;
  inMap: boolean;
  inBattle: boolean;
  battleId: string;
  dead: boolean;
  /** EndBattle done, the client has not reported battlePlayEnd yet (its battle scene would wipe a result window) */
  playPending: boolean;
  /** the result window waits for battlePlayEnd */
  resultPending: boolean;
  /** a level gain of a battle whose onPlayerLevelUp waits for battlePlayEnd */
  leveled: boolean;
  worldRank: number;
  classRank: number;
  luckyNum: number;
  /** gift bags (template ids) not yet claimed */
  pending: WbAwardItem[];
}

export interface WbEvent {
  phase: WbPhase | 'running';
  startedAt: number;
  endsAt: number;
  /** lobby: when the fights start */
  fightAt: number;
  /** a GM lobby starts its run by itself at fightAt (a scheduled one follows the schedule) */
  manualLobby: boolean;
  hp: number;
  maxHp: number;
  lastHitter: string;
  lastHitterId: number;
  runSeq: number;
  participants: Map<number, WbParticipant>;
}

export function newParticipant(cid: number, name: string, classId: number, level: number): WbParticipant {
  return {
    cid, name, classId, level, damage: 0, exp: 0, money: 0, honor: 0, cheer: 0, auto: false, ret: null, inMap: false, inBattle: false,
    battleId: '', dead: false, playPending: false, resultPending: false, leveled: false, worldRank: 0, classRank: 0, luckyNum: 0, pending: [],
  };
}

export function newEvent(runSeq: number): WbEvent {
  return {
    phase: 'idle', startedAt: 0, endsAt: 0, fightAt: 0, manualLobby: false, hp: WB.POOL_HP, maxHp: WB.POOL_HP, lastHitter: '', lastHitterId: 0, runSeq,
    participants: new Map(),
  };
}

@Injectable()
export class WbState {
  event: WbEvent = newEvent(0);
  /** UTC+7 day key of the last scheduled window that was opened (once per day; a kill or GM stop does not reopen it) */
  windowDay = '';
  now = (): number => Date.now();
  rng: () => number = Math.random;

  get running(): boolean {
    return this.event.phase === 'running';
  }

  get lobby(): boolean {
    return this.event.phase === 'lobby';
  }

  flag(): 0 | 1 | 2 {
    return this.running ? WbFlag.FIGHT : this.lobby ? WbFlag.LOBBY : WbFlag.IDLE;
  }

  /** Strip entry of icon 15: always a type-3 state row (flag 0 = hidden) so the seed's level-gate row never shows it all the time. */
  stripEntry(sortType: number): ActivityStripEntry {
    return { id: WB_ACTIVITY_ID, type: 3, flag: this.flag(), sortType };
  }

  /** updateActivityState push for the current phase. */
  statePush(): UpdateActivityStatePush {
    return { id: WB_ACTIVITY_ID, sortType: WB_ACTIVITY_ID, flag: this.flag() };
  }

  inMapCount(): number {
    let n = 0;
    for (const p of this.event.participants.values()) if (p.inMap) n++;
    return n;
  }

  /** Seconds the HUD counts down: the run's end, or the fight start while in the lobby. */
  secondsLeft(): number {
    const until = this.lobby ? this.event.fightAt : this.event.endsAt;
    return this.running || this.lobby ? Math.max(0, Math.floor((until - this.now()) / 1000)) : 0;
  }
}
