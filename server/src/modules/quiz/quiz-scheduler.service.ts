// Quiz scheduler: the 500 ms tick (Nest OnModuleInit + setInterval, cleared on destroy) that starts the scheduled contest and drives
// the question cycles, plus the login hook that pays the settlement rewards that were owed (offline exp, legacy bag rows turned into mail).

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SceneHooks } from '../scene/scene-hooks.service';
import { QuizService } from './quiz.service';
import { QuizSettleService } from './quiz-settle.service';

export const QUIZ_TICK_MS = 500;

@Injectable()
export class QuizScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly quiz: QuizService,
    private readonly settle: QuizSettleService,
    private readonly sceneHooks: SceneHooks,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.settle.loadOwed();
    this.timer = setInterval(() => void this.quiz.tick(), QUIZ_TICK_MS);
    // fromMap 0 = scene login: owed rewards are granted after the login replies
    this.sceneHooks.onMapChanged('quiz-owed', (session, fromMap) => (fromMap === 0 ? this.settle.claimOwed(session) : undefined));
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
