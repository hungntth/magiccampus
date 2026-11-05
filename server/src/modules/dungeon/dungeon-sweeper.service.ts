// Phụ bản run sweeper (Go handlers/npc dungeon_mehuyen_sweep.go), every 15 s: characters on a ruled floor map plus online
// characters whose today's run was entered and is still open (read from Mongo each tick, so a restart loses nothing; M10
// decision 3). Characters in battle are skipped. Verdicts: first sighting ("còn N phút"), 30 / 10 / 5 / 1 minute warnings once
// each (onMidNote + onSystemSay), deadline / closed run / no run on a floor -> run closed and moved to the eject map, an entered
// run seen off the floors -> closed `left`. Closing lifts the Mê Huyễn curse (DungeonEvents.onClosed).

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { DungeonDef } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { notice, systemSay } from '../npcscript/menu';
import { DungeonEvents } from './dungeon-events';
import { dungeonByMap, enabledDungeons, judgeOnFloor, runDeadline, runOf } from './dungeon-rules';
import { DungeonStateService } from './dungeon-state.service';
import { DungeonSupport } from './dungeon-support.service';
import { DungeonViewService } from './dungeon-view.service';
import { CharacterDungeon } from './dungeon.schema';

export const SWEEP_EVERY_MS = 15_000;
const TEXT = {
  ENTERED: (d: DungeonDef, m: number) => `Thời gian thám hiểm ${d.name} còn ${m} phút.`,
  WARN: (d: DungeonDef, m: number) => `Thời gian thám hiểm ${d.name} chỉ còn ${m} phút!`,
  EXPIRED: (d: DungeonDef) => `Đã hết thời gian thám hiểm ${d.name}, ngươi được đưa về ${d.rules.ejectName}.`,
  NO_RUN: (d: DungeonDef) => `Ngươi không có lượt thám hiểm ${d.name} hợp lệ, được đưa về ${d.rules.ejectName}.`,
  CLOSED: (d: DungeonDef) => `Lượt thám hiểm ${d.name} hôm nay của ngươi đã kết thúc, được đưa về ${d.rules.ejectName}.`,
  LEFT: (d: DungeonDef) => `Ngươi đã rời ${d.name}, lượt thám hiểm hôm nay kết thúc.`,
} as const;

@Injectable()
export class DungeonSweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DungeonSweeperService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectModel(CharacterDungeon.name) private readonly docs: Model<CharacterDungeon>,
    private readonly scenes: SceneManager,
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly views: DungeonViewService,
    private readonly events: DungeonEvents,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), SWEEP_EVERY_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const ids = new Set<number>(await this.enteredOpen());
      for (const s of this.scenes.onlineSessions()) if (s.characterId && dungeonByMap(s.mapId)) ids.add(s.characterId);
      for (const cid of ids) {
        const s = this.support.session(cid);
        if (s && s.battleId === null && s.mapId) await this.sweep(s).catch((e: Error) => this.logger.warn(`sweep ${cid}: ${e.message}`));
      }
    } finally {
      this.running = false;
    }
  }

  /** Characters with an entered, open run of today (any enabled single-entry dungeon). */
  private async enteredOpen(): Promise<number[]> {
    const day = this.state.today();
    const or = enabledDungeons().filter((d) => d.rules.singleEntry).map((d) => ({
      [`runs.${d.key}.day`]: day, [`runs.${d.key}.entered`]: true, [`runs.${d.key}.closed`]: '',
    }));
    if (or.length === 0) return [];
    const rows = await this.docs.find({ $or: or }, { characterId: 1 }).lean();
    return rows.map((r) => r.characterId);
  }

  async sweep(session: Session): Promise<void> {
    const cid = session.characterId!;
    const at = dungeonByMap(session.mapId);
    if (at) return this.onFloor(session, at.d);
    const doc = await this.state.load(cid);
    for (const d of enabledDungeons()) {
      const r = runOf(doc.runs, d.key, this.state.today());
      if (!d.rules.singleEntry || !r || !r.entered || r.closed) continue;
      const closed = await this.state.closeRun(cid, d, 'left');
      await this.events.emitClosed({ d, characterId: cid, morph: closed?.morph ?? null });
      systemSay(session, TEXT.LEFT(d));
    }
  }

  private async onFloor(session: Session, d: DungeonDef): Promise<void> {
    const cid = session.characterId!;
    const now = this.state.now();
    const run = await this.state.run(cid, d);
    const v = judgeOnFloor(d.rules, run, now);
    if (v.action === 'enter' || v.action === 'warn') {
      await this.state.mutate(cid, (st) => {
        const r = runOf(st.runs, d.key, this.state.today());
        if (!r) return false;
        if (v.action === 'enter') r.entered = true;
        else r.warned = v.threshold;
        return true;
      });
      if (v.action === 'enter') systemSay(session, TEXT.ENTERED(d, Math.max(0, Math.floor((runDeadline(run!, d.rules) - now) / 60_000))));
      else notice(session, TEXT.WARN(d, v.minutesLeft));
      return;
    }
    if (v.action !== 'eject') return;
    const closed = run ? await this.state.closeRun(cid, d, v.reason === 'norun' ? 'expired' : v.reason) : undefined;
    await this.events.emitClosed({ d, characterId: cid, morph: closed?.morph ?? null });
    const text = v.reason === 'expired' ? TEXT.EXPIRED(d) : v.reason === 'norun' ? TEXT.NO_RUN(d) : TEXT.CLOSED(d);
    await this.support.teleport(session, d.rules.ejectMap, undefined, undefined, false);
    notice(session, text);
    await this.views.push(session);
  }
}
