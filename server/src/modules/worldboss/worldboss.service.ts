// World boss event lifecycle (Go application/worldboss event.go + lobby.go + scheduler.go): a 5 s tick opens the lobby 30 min before a
// scheduled window (map open, no fights), turns it into the run at the window start (players already on the map are carried in and
// fight after 2 s), finishes at the window end, sweeps strays. GM start / stop / lobby (chat /wb) work outside the schedule. A
// scheduled day opens once (a kill or GM stop does not reopen it). Map-change / disconnect / login hooks are wired here.

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { dayKey } from '@mc/shared';
import { GameGateway } from '../../gateway/game.gateway';
import { SceneHooks } from '../scene/scene-hooks.service';
import { WB, WB_TEXT_SERVER as T } from './wb-config';
import { WbBattleService } from './wb-battle.service';
import { WbExitService } from './wb-exit.service';
import { WbFinishService } from './wb-finish.service';
import { WbPayoutService } from './wb-payout.service';
import { WbPush } from './wb-push.service';
import { wbClockLabel, wbPhaseAt, wbWindowOn } from './wb-schedule';
import { WbState, newEvent, newParticipant, type WbEvent } from './wb-state.service';

export const WB_TICK_MS = 5000;

@Injectable()
export class WorldBossService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorldBossService.name);
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(
    private readonly state: WbState,
    private readonly push: WbPush,
    private readonly payout: WbPayoutService,
    private readonly exit: WbExitService,
    private readonly finisher: WbFinishService,
    private readonly battles: WbBattleService,
    private readonly gateway: GameGateway,
    private readonly sceneHooks: SceneHooks,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.payout.loadOwed();
    this.timer = setInterval(() => void this.tick(), WB_TICK_MS);
    this.gateway.onDisconnect((s) => this.exit.onGone(s));
    this.gateway.onCharacterLeave((s) => this.exit.onGone(s));
    this.sceneHooks.onMapChanged('worldboss', async (session, from, to) => {
      await this.exit.onMapChanged(session, from, to);
      if (from === 0) await this.payout.claimOwed(session); // scene login: owed gifts are granted after the login replies
    });
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Scheduler tick; overlapping ticks are skipped. */
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.step(this.state.now());
    } catch (e) {
      this.logger.error(`world boss tick failed: ${(e as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  private async step(now: number): Promise<void> {
    const ev = this.state.event;
    const phase = wbPhaseAt(now);
    const day = dayKey(now);
    if (ev.phase === 'running' && now >= ev.endsAt) await this.finisher.finish('timeout');
    else if (ev.phase === 'idle' && phase === 'fight' && this.state.windowDay !== day) {
      this.state.windowDay = day;
      this.start(now, wbWindowOn(now)!.end);
    } else if (ev.phase === 'idle' && phase === 'lobby' && this.state.windowDay !== day) {
      this.openLobby(wbWindowOn(now)!.start, false);
    } else if (ev.phase === 'lobby') {
      if (ev.manualLobby && now >= ev.fightAt) this.start(now, now + WB.MANUAL_MS);
      else if (!ev.manualLobby && phase === 'fight') {
        this.state.windowDay = day;
        this.start(now, wbWindowOn(now)!.end);
      } else if (!ev.manualLobby && phase === 'idle') await this.closeLobby();
    }
    await this.exit.sweepStrays();
  }

  /** Fresh event keeping the players already on the map; the previous run's unclaimed bags of everyone else become owed. */
  private carry(prev: WbEvent): WbEvent {
    const next = newEvent(prev.runSeq + 1);
    for (const p of prev.participants.values()) {
      if (p.pending.length > 0 && !p.inMap) {
        void this.payout.owe(p.cid, p.pending, { classRank: p.classRank, worldRank: p.worldRank }, prev.runSeq)
          .catch((e: Error) => this.logger.error(`world boss: mailing the gifts of ${p.cid} failed: ${e.message}`));
      }
      if (!p.inMap) continue;
      const q = newParticipant(p.cid, p.name, p.classId, p.level);
      Object.assign(q, { auto: p.auto, ret: p.ret, inMap: true, inBattle: p.inBattle, battleId: p.battleId, pending: p.pending, cheer: 0 });
      next.participants.set(p.cid, q);
    }
    return next;
  }

  openLobby(fightAt: number, manual: boolean): boolean {
    if (this.state.event.phase !== 'idle') return false;
    const ev = this.carry(this.state.event);
    ev.phase = 'lobby';
    ev.fightAt = fightAt;
    ev.manualLobby = manual;
    this.state.event = ev;
    this.logger.log(`world boss lobby opened, fights at ${wbClockLabel(fightAt)}`);
    this.push.sayAll(T.LOBBY(wbClockLabel(fightAt)));
    this.push.broadcastState();
    return true;
  }

  async closeLobby(): Promise<void> {
    const ev = this.state.event;
    if (ev.phase !== 'lobby') return;
    ev.phase = 'idle';
    this.logger.log('world boss lobby closed without a run');
    this.push.broadcastState();
    for (const cid of this.push.inMapIds()) await this.exit.leave(cid, true);
  }

  /** Opens the run until `endsAt`; players waiting on the map (lobby) get a fresh HUD and fight after 2 s. */
  start(now: number, endsAt: number): boolean {
    if (this.state.event.phase === 'running') return false;
    const ev = this.carry(this.state.event);
    ev.phase = 'running';
    ev.startedAt = now;
    ev.endsAt = endsAt;
    this.state.event = ev;
    this.logger.log(`world boss started, ends ${wbClockLabel(endsAt)}, ${ev.participants.size} waiting`);
    this.push.sayAll(T.START);
    this.push.broadcastState();
    for (const p of ev.participants.values()) {
      void this.push.initView(p.cid);
      if (!p.inBattle) this.battles.scheduleStart(p.cid, WB.FIRST_BATTLE_MS);
    }
    return true;
  }

  // ---- GM (gmWorldBoss, chat /wb) ----------------------------------------------------------------------------------------

  gmStart(minutes: number): boolean {
    const now = this.state.now();
    if (this.state.running) return false;
    return this.start(now, now + minutes * 60_000);
  }

  /** Ends the run now; during today's window it also marks the day as used so the scheduler does not reopen it. */
  async gmStop(): Promise<boolean> {
    const now = this.state.now();
    if (!this.state.running) return false;
    if (wbPhaseAt(now) !== 'idle') this.state.windowDay = dayKey(now);
    await this.finisher.finish('manual');
    return true;
  }

  gmLobby(minutes: number): boolean {
    return this.openLobby(this.state.now() + minutes * 60_000, true);
  }

  status(): string {
    const e = this.state.event;
    return `Boss Thế Giới: ${e.phase}, HP ${e.hp}/${e.maxHp}, ${e.participants.size} người chơi (${this.state.inMapCount()} trên bản đồ), còn ${this.state.secondsLeft()} giây.`;
  }
}
