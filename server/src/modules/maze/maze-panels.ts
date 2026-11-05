// Mê Trận sub-panel payload builders: the showMazeLotteryPanel / showMazeQuestionPanel objects (shared types, H5 extras = card and
// question texts because the client has no item / TBL_ANSWER tables).

import { MAZE_MAX_DROPS, MAZE_QUIZ_SIZE, type MazeLotteryPanel, type MazeQuestionPanel } from '@mc/shared';
import type { MazeLottery, MazeQuiz } from './maze-board';
import { LOTTERY_DROP_COST } from './maze-config';
import type { MazeDataService } from './maze-data.service';

export async function lotteryPanel(data: MazeDataService, lot: MazeLottery): Promise<MazeLotteryPanel> {
  const planId: Record<string, number> = {};
  lot.planIds.forEach((id, i) => (planId[String(i + 1)] = id));
  const drop: Record<string, true> = {};
  for (const i of lot.dropped) drop[String(i)] = true;
  const cost: Record<string, number> = {};
  for (let i = 1; i <= MAZE_MAX_DROPS; i++) cost[String(i)] = LOTTERY_DROP_COST[i];
  return { planId, drop, cost, finished: lot.finished, cards: await data.lotteryCardsOf(lot.planIds) };
}

export function questionPanel(data: MazeDataService, q: MazeQuiz): MazeQuestionPanel {
  const question: Record<string, number> = {};
  q.ids.forEach((id, i) => (question[String(i)] = id));
  return { question, answerNum: q.answerNum, rightNum: q.rightNum, totalNum: MAZE_QUIZ_SIZE, texts: data.quizTexts(q.ids) };
}
