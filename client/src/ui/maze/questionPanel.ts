// Mê Trận quiz (Flash MazeQuestionPanel, MAZE_QUESTION_PANEL_U): shows the current question with options A-D and the counters. The H5
// server grades by the picked letter (answerMazeQuestion({answerNum, rightNum, choice}) -> accepted / right / letter); the panel marks
// the right option, then moves on. The fifth answer closes it.

import type { MazeAnswerReply, MazeQuestionPanel } from '@mc/shared';
import type { GameClient } from '../../net/client';
import { button, el, openActWindow, type ActWindow } from '../actWindow';
import { toast } from '../screens';
import { parseQuiz, type QuizView } from './mazeLogic';
import './maze.css';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

export class MazeQuestionWindow {
  private win: ActWindow | null = null;
  private quiz: QuizView | null = null;
  private busy = false;

  constructor(private readonly client: GameClient) {}

  show(raw: MazeQuestionPanel): void {
    this.close();
    const quiz = parseQuiz(raw);
    if (!quiz) return;
    this.quiz = quiz;
    this.win = openActWindow('Đố Vui', 'mz-question', () => this.close());
    this.render(null);
  }

  private render(mark: { picked: string; right: string } | null): void {
    const q = this.quiz;
    if (!this.win || !q) return;
    const text = q.texts[q.ids[Math.min(q.answerNum, q.ids.length - 1)]];
    const body = this.win.body;
    body.replaceChildren(
      el('mz-line', `Số lượng: ${Math.min(q.answerNum + 1, q.total)}/${q.total}      Đáp đúng: ${q.rightNum}`),
      el('mz-reward', text?.t ?? '(không có dữ liệu câu hỏi)'),
    );
    const opts = el('mz-options');
    for (const L of LETTERS) {
      const label = text?.[L.toLowerCase() as 'a' | 'b' | 'c' | 'd'] ?? '';
      if (!label.trim()) continue;
      const b = button(`${L}: ${label}`, () => this.pick(L), `act-btn mz-opt${mark?.right === L ? ' right' : mark?.picked === L ? ' wrong' : ''}`, this.busy || mark !== null);
      opts.appendChild(b);
    }
    body.appendChild(opts);
  }

  private pick(letter: string): void {
    const q = this.quiz;
    if (!q || this.busy) return;
    this.busy = true;
    this.client.call<MazeAnswerReply>('answerMazeQuestion', { answerNum: q.answerNum + 1, rightNum: q.rightNum, choice: letter }).then((r) => {
      if (!r.accepted) {
        this.busy = false;
        return;
      }
      q.answerNum = r.answerNum;
      q.rightNum = r.rightNum;
      this.render({ picked: letter, right: r.letter });
      setTimeout(() => {
        this.busy = false;
        if (q.answerNum >= q.total) this.close();
        else this.render(null);
      }, 900);
    }).catch((e) => {
      toast((e as Error).message, true);
      this.busy = false;
    });
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
    this.busy = false;
  }
}
