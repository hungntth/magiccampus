// Holder of the single in-memory contest (event state stays in memory like Go; M10 decision 3) and the activity strip entry of
// icon 16: type 3, state 1 while registering, 2 while running, hidden (no entry, the seed row is flag 0) when idle. Dependency-free so
// the activity login payload can read it without pulling the whole quiz module.

import { Injectable } from '@nestjs/common';
import { QUIZ, type ActivityStripEntry, type UpdateActivityStatePush } from '@mc/shared';
import { QuizContest } from './quiz-contest';

@Injectable()
export class QuizState {
  readonly contest = new QuizContest();

  /** Strip entry for the login payload while a contest is registering / running; null when idle. */
  stripEntry(sortType: number): ActivityStripEntry | null {
    const flag = this.stripFlag();
    return flag === 0 ? null : { id: QUIZ.ACTIVITY_ID, type: 3, flag, sortType };
  }

  stripFlag(): 0 | 1 | 2 {
    return this.contest.phase === 'registration' ? 1 : this.contest.phase === 'running' ? 2 : 0;
  }

  /** updateActivityState push for the current phase. */
  statePush(): UpdateActivityStatePush {
    return { id: QUIZ.ACTIVITY_ID, sortType: QUIZ.ACTIVITY_ID, flag: this.stripFlag() };
  }
}
