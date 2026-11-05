// Vùng Đất Rèn Luyện RPCs (Flash TrialsPassMainPanel / MiniMapCanvas): trialsPanelInit -> panel, trialsStart(floor), trialsOut,
// trialsTimerAward -> {num, life}, trialsFirstKillAwardTake(floor), trialsAwardTake, trialsAwardTakeByGold. Refusals and results are
// onSystemSay pushes; pushes onUpdateTrialsCharData (incremental) / onUpdateTrialsLifeAndTime {num, life}.

import { Injectable } from '@nestjs/common';
import { TRIALS, TRIALS_TEXT, type TrialsLifeTime, type TrialsPanel } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { systemSay } from '../npcscript/menu';
import { TrialsEntryService } from './trials-entry.service';
import { TrialsService } from './trials.service';

const int = (v: unknown): number => (Number.isInteger(Number(v)) ? Number(v) : 0);

@Injectable()
export class TrialsRpc {
  constructor(
    private readonly trials: TrialsService,
    private readonly entry: TrialsEntryService,
  ) {}

  @Rpc('trialsPanelInit', { requireCharacter: true })
  panel(session: Session): Promise<TrialsPanel> {
    return this.trials.panel(session.characterId!);
  }

  @Rpc('trialsStart', { requireCharacter: true })
  async start(session: Session, args: unknown[]): Promise<null> {
    await this.entry.enter(session, int(args[0]));
    return null;
  }

  @Rpc('trialsOut', { requireCharacter: true })
  async out(session: Session): Promise<null> {
    await this.entry.leave(session);
    return null;
  }

  @Rpc('trialsTimerAward', { requireCharacter: true })
  timer(session: Session): Promise<TrialsLifeTime> {
    return this.entry.timer(session.characterId!);
  }

  @Rpc('trialsFirstKillAwardTake', { requireCharacter: true })
  async firstKill(session: Session, args: unknown[]): Promise<null> {
    const floor = int(args[0]);
    const r = floor >= 1 && floor <= TRIALS.FLOORS ? await this.trials.claimFirstKill(session, floor) : { text: TRIALS_TEXT.LOCKED };
    if ('text' in r) systemSay(session, r.text);
    else session.callback('onUpdateTrialsCharData', r.patch);
    return null;
  }

  @Rpc('trialsAwardTake', { requireCharacter: true })
  async weekly(session: Session): Promise<null> {
    const r = await this.trials.claimWeekly(session);
    if ('text' in r) systemSay(session, r.text);
    else session.callback('onUpdateTrialsCharData', r.patch);
    return null;
  }

  /** The client enables it only after the weekly claim; answered with TRIALS_AWARD_PANEL[5]. */
  @Rpc('trialsAwardTakeByGold', { requireCharacter: true })
  byGold(session: Session): null {
    systemSay(session, TRIALS_TEXT.WEEKLY_ONCE);
    return null;
  }
}
