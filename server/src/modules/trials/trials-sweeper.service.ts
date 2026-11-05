// Vùng Đất Rèn Luyện run timer: every 5 s the online characters standing on a floor map (and not in battle) must hold a live run for
// that floor; an expired or missing run is closed and the character is moved to its return point with a notice (Go only dropped the
// run and left the player in the map; plan: the timer ejects at the limit). A battle in progress finishes first.

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TRIALS_MAPS } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import { TrialsEntryService } from './trials-entry.service';
import { TrialsService } from './trials.service';

export const TRIALS_SWEEP_MS = 5_000;

@Injectable()
export class TrialsSweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrialsSweeperService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly scenes: SceneManager,
    private readonly trials: TrialsService,
    private readonly entry: TrialsEntryService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TRIALS_SWEEP_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const s of this.scenes.onlineSessions()) {
        if (!s.characterId || s.battleId !== null || !TRIALS_MAPS.includes(s.mapId)) continue;
        try {
          const why = await this.trials.ejectReason(s.characterId, s.mapId);
          if (why) await this.entry.eject(s, why === 'expired');
        } catch (e) {
          this.logger.warn(`sweep ${s.characterId}: ${(e as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
