// Mê Trận sub-panels (Go subpanels.go): the discount shop (two single-use offers), the 5-card chest lottery (up to 4 paid drops, then one
// random remaining card is granted) and the 5-question quiz (grading by the picked letter when the client sends it, else Go's
// cumulative-count validation). Each action runs on the open run through MazeService.act.

import { Injectable } from '@nestjs/common';
import { MAZE_QUIZ_SIZE, type MazeAnswerArgs, type MazeAnswerReply, type MazeDropReply, type MazeLotteryReply, type MazeShopItems } from '@mc/shared';
import type { Session } from '../../gateway/session';
import type { MazeQuiz } from './maze-board';
import { TEXT } from './maze-config';
import { MazeDataService } from './maze-data.service';
import { dropCost, remainingCards, shouldFail, validQuizStep } from './maze-events';
import { failRun } from './maze-outcome';
import { MazeRewards } from './maze-rewards.service';
import { MazeStateService } from './maze-state.service';
import { MazeService } from './maze.service';

const LETTERS = ['A', 'B', 'C', 'D'];

@Injectable()
export class MazeSubpanels {
  constructor(
    private readonly maze: MazeService,
    private readonly state: MazeStateService,
    private readonly data: MazeDataService,
    private readonly rewards: MazeRewards,
  ) {}

  /** getMazeShopItem: the pair of offers of the last shop event (same pair on every call); null when there is none. */
  async shopItems(cid: number): Promise<MazeShopItems | null> {
    const shop = (await this.state.read(cid)).run?.shop;
    if (!shop || shop.length < 2) return null;
    const [a, b] = await Promise.all(shop.slice(0, 2).map(async (s) => ({
      itemId: s.itemId, sid: s.sid, goldBefore: s.before, goldAfter: s.after, ...(await this.data.itemInfo(s.itemId)),
    })));
    return { item1: a, item2: b };
  }

  /** buyMazeShopItem({sid, index}): the bought slot index, 0 when refused. Pays the sale price before the item is granted. */
  async buyShop(session: Session, sid: number, index: number): Promise<number> {
    let bought = 0;
    const out = await this.maze.act(session, async (run, o) => {
      const slot = run.shop?.[index - 1];
      if (!slot || slot.bought || slot.sid !== sid || slot.itemId <= 0) return;
      if (!(await this.rewards.spendGold(session, slot.after))) return void (o.toast = TEXT.NO_GOLD);
      slot.bought = true;
      await this.rewards.item(session, slot.itemId, 1, true);
      bought = index;
    });
    if (out) await this.maze.dispatch(session, { toast: out.toast }, false);
    return bought;
  }

  /** mazeDrop({index}): drops one card for 5 / 10 / 15 / 20 Vàng (never a repeat, at most 4). */
  async drop(session: Session, index: number): Promise<MazeDropReply | null> {
    let reply: MazeDropReply | null = null;
    const out = await this.maze.act(session, async (run, o) => {
      const cost = dropCost(run.lottery, index);
      if (cost === null || !run.lottery) return;
      if (!(await this.rewards.spendGold(session, cost))) return void (o.toast = TEXT.NO_GOLD);
      run.lottery.dropped.push(index);
      reply = { index, dropNum: run.lottery.dropped.length };
    });
    if (out) await this.maze.dispatch(session, { toast: out.toast }, false);
    return reply;
  }

  /** getMazeLottery: one random card of those still in the draw is granted; the lottery is finished. */
  async takeLottery(session: Session): Promise<MazeLotteryReply> {
    let reply: MazeLotteryReply = {};
    await this.maze.act(session, async (run) => {
      const lot = run.lottery;
      if (!lot || lot.finished) return;
      const left = remainingCards(lot);
      if (left.length === 0) return;
      const index = left[Math.min(left.length - 1, Math.floor(this.maze.rng() * left.length))];
      lot.finished = true;
      const row = this.data.planRow(lot.planIds[index - 1]);
      if (row) await this.rewards.item(session, row.ii, row.n, row.b);
      reply = { index };
    });
    return reply;
  }

  /** The step the answer leads to: by letter (server graded) or by the client's counts. */
  private step(q: MazeQuiz, a: MazeAnswerArgs): { answerNum: number; rightNum: number } | null {
    const choice = typeof a.choice === 'string' ? a.choice.trim().toUpperCase() : '';
    if (LETTERS.includes(choice)) {
      if (a.answerNum !== q.answerNum + 1 || q.done || a.answerNum > MAZE_QUIZ_SIZE) return null;
      const right = this.data.rightLetter(q.ids[q.answerNum]) === choice;
      return { answerNum: a.answerNum, rightNum: q.rightNum + (right ? 1 : 0) };
    }
    return validQuizStep(q, a.answerNum, a.rightNum) ? { answerNum: a.answerNum, rightNum: a.rightNum } : null;
  }

  /** answerMazeQuestion: records the step; the fifth answer pays exp x right answers (+ package 3-1265 when all are right). */
  async answer(session: Session, a: MazeAnswerArgs): Promise<MazeAnswerReply> {
    const reply: MazeAnswerReply = { accepted: false, right: false, letter: '', answerNum: a.answerNum, rightNum: a.rightNum };
    const out = await this.maze.act(session, async (run, o) => {
      const q = run.quiz;
      const next = q && this.step(q, a);
      if (!q || !next) return;
      reply.letter = this.data.rightLetter(q.ids[next.answerNum - 1] ?? 0);
      reply.right = next.rightNum > q.rightNum;
      q.answerNum = next.answerNum;
      q.rightNum = next.rightNum;
      Object.assign(reply, { accepted: true, answerNum: q.answerNum, rightNum: q.rightNum });
      if (q.answerNum < MAZE_QUIZ_SIZE) return;
      q.done = true;
      await this.rewards.quiz(session, q.rightNum, MAZE_QUIZ_SIZE);
      if (shouldFail(run)) failRun(run, o);
    });
    if (out) await this.maze.dispatch(session, out, false);
    return reply;
  }
}

