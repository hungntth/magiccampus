// 3v3 run lifecycle (M14 phase H): a 1 s tick opens the Friday 19:00-22:00 (UTC+7) window or a GM test window, announces at 18:30 / 18:55,
// ends the fighting at the window end (queues off), settles once no arena battle is left (cap +5 min), then empties map 73 after the
// grace. Pushes: updateActivityState {id 22} (everyone + at login), onSystemSay (announcements), onPushPVPQueue {type 2, state 0}.

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { announceMark, dayKey, gmWindow, THREE_PVP, THREE_PVP_TEXT, weeklyWindow, type PvpQueuePush, type RunWindow } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import { SceneHooks } from '../scene/scene-hooks.service';
import { ThreePvpMatchService } from './threepvp-match.service';
import { ThreePvpProgressService } from './threepvp-progress.service';
import { ThreePvpRoomsService } from './threepvp-rooms.service';
import { ThreePvpState, type ThreePvpRun } from './threepvp-state';
import { ThreePvpStreakService } from './threepvp-streak.service';

export interface RunStatus {
  key: string;
  gm: boolean;
  phase: string;
  endMs: number;
}

@Injectable()
export class ThreePvpRunService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ThreePvpRunService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    private readonly state: ThreePvpState,
    private readonly rooms: ThreePvpRoomsService,
    private readonly match: ThreePvpMatchService,
    private readonly progress: ThreePvpProgressService,
    private readonly streak: ThreePvpStreakService,
    private readonly scenes: SceneManager,
    private readonly sceneHooks: SceneHooks,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), THREE_PVP.TICK_MS);
    this.timer.unref();
    // fromMap 0 = entering the world: the icon state is also pushed at login (the strip list carries it too).
    this.sceneHooks.onMapChanged('threepvp-icon', (session, fromMap) => {
      if (fromMap === 0 && this.state.flag() !== 0) session.callback('updateActivityState', this.state.statePush());
    });
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(now = Date.now()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.step(now);
    } catch (e) {
      this.logger.error(`3v3 tick failed: ${(e as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  private async step(now: number): Promise<void> {
    const phase = this.state.phase(now);
    const weekly = phase === 'closed' ? weeklyWindow(now) : null;
    if (weekly && this.state.lastOpenedDay !== weekly.key && (!this.state.run || this.state.run.settledAt !== undefined)) await this.open(weekly);
    this.announce(now);
    const run = this.state.run;
    if (run && phase === 'settling') {
      if (!run.settling) this.enterSettling(run);
      if (this.match.activeFights() === 0 || now >= run.endMs + THREE_PVP.SETTLE_CAP_MS) await this.settle(run, now);
    }
    await this.match.tick(now);
    await this.sweep(now);
  }

  /** gmThreePvp(minutes): opens a test window now (default 15, at least 5). */
  async gmOpen(minutes: unknown, now = Date.now()): Promise<RunStatus> {
    if (this.state.run && this.state.run.settledAt === undefined) throw RpcException.forbidden('Chiến Trường Dũng Sĩ đang diễn ra');
    const run = await this.open(gmWindow(now, minutes));
    return this.status(run, now);
  }

  /** H5 dev helper gmThreePvpStop: ends the fighting now (settles once the arena battles finish); on a settled run it just empties the map. */
  async gmStop(now = Date.now()): Promise<RunStatus | null> {
    const run = this.state.run;
    if (!run) return null;
    if (run.settledAt === undefined) {
      if (now < run.endMs) run.endMs = now;
      await this.step(now + 1);
    } else {
      run.settledAt = now - THREE_PVP.SETTLE_GRACE_MS;
      await this.sweep(now);
    }
    return this.status(run, now);
  }

  private status(run: ThreePvpRun, now: number): RunStatus {
    return { key: run.key, gm: run.gm, phase: this.state.phase(now), endMs: run.endMs };
  }

  private async open(window: RunWindow): Promise<ThreePvpRun> {
    const run: ThreePvpRun = { ...window, settling: false, points: new Map() };
    await this.progress.loadRun(run);
    this.state.run = run;
    this.state.lastOpenedDay = window.key.slice(0, 10);
    this.state.lastRank = [];
    this.scenes.broadcastAll('updateActivityState', [this.state.statePush()]);
    this.scenes.broadcastAll('onSystemSay', [THREE_PVP_TEXT.OPENED]);
    this.logger.log(`3v3 run ${run.key} opened until ${new Date(run.endMs).toISOString()}`);
    return run;
  }

  /** 18:30 and 18:55 on event days, once each. */
  private announce(now: number): void {
    const mark = announceMark(now);
    if (mark === null) return;
    const id = `${dayKey(now)}:${mark}`;
    if (this.state.announced.has(id)) return;
    this.state.announced.add(id);
    this.scenes.broadcastAll('onSystemSay', [THREE_PVP_TEXT.ANNOUNCE(mark)]);
  }

  /** The window ended: no new match, queued rooms are switched off, the icon goes dark. */
  private enterSettling(run: ThreePvpRun): void {
    run.settling = true;
    for (const room of this.state.book.all()) {
      if (!room.queued) continue;
      room.queued = false;
      this.rooms.pushRoom(room, 'onPushPVPQueue', { type: 2, state: 0 } satisfies PvpQueuePush);
    }
    this.scenes.broadcastAll('updateActivityState', [this.state.statePush()]);
    this.scenes.broadcastAll('onSystemSay', [THREE_PVP_TEXT.SETTLING]);
  }

  private async settle(run: ThreePvpRun, now: number): Promise<void> {
    run.settledAt = now; // closed from here on (also the guard against a second settlement)
    try {
      await this.progress.settle(run);
    } catch (e) {
      this.logger.error(`3v3 settlement of ${run.key} failed: ${(e as Error).message}`);
    }
    for (const room of this.state.book.all()) for (const m of room.members) await this.streak.clear(m.cid);
  }

  /** No run (restart, event over) or the settlement grace is over: rooms are dropped and map 73 is emptied. */
  private async sweep(now: number): Promise<void> {
    const run = this.state.run;
    if (run && (run.settledAt === undefined || now < run.settledAt + THREE_PVP.SETTLE_GRACE_MS)) return;
    this.state.book.clear();
    await this.rooms.sweepMap(() => false);
    if (run) this.state.run = null;
  }
}
