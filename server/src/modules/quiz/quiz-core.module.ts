// QuizCoreModule (M10 phase G): only the QuizState holder, so ActivityModule can show the icon 16 state in the login strip without
// importing the whole quiz module (scene, rewards, buffs).

import { Module } from '@nestjs/common';
import { QuizState } from './quiz-state.service';

@Module({
  providers: [QuizState],
  exports: [QuizState],
})
export class QuizCoreModule {}
