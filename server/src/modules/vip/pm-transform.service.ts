// Right-13 transform cancel / expiry (Go handlers/buff/transform.go revertPMTransform): registered as a BuffService.onRemoved hook,
// so clicking buff 2730 off or the buff bar's expiry delBuffClient clears the transform slot and restores the look (the resolved body: the
// class body or the worn costume). Pushes: onSetRes {id, res, body} (map, self included).

import { Injectable, Logger } from '@nestjs/common';
import type { Session } from '../../gateway/session';
import { AppearanceService } from '../appearance/appearance.service';
import { revertsTransform } from './pm-rules';
import { PmStateService } from './pm-state.service';

const RETRIES = 5;

@Injectable()
export class PmTransformService {
  private readonly logger = new Logger(PmTransformService.name);

  constructor(
    private readonly state: PmStateService,
    private readonly appearance: AppearanceService,
  ) {}

  async onBuffRemoved(session: Session, buffId: number | null): Promise<void> {
    const cid = session.characterId;
    if (!cid) return;
    for (let i = 0; ; i++) {
      const doc = await this.state.load(cid);
      if (!revertsTransform(doc.transform, buffId, Date.now())) return;
      if (await this.state.update(cid, doc.rev, { transform: null })) break;
      if (i === RETRIES - 1) return void this.logger.warn(`transform revert for ${cid} lost its races`);
    }
    await this.appearance.pushRes(cid);
  }
}
