// Trials run card (Flash MiniMapCanvas timeTrials / liveTrials / quitTrialsBtn): "Thời gian đếm ngược mm:ss", "HP X{n}" and "Thoát"
// (confirm TRIALS_MAIN_PANEL[8] -> trialsOut). Driven by onUpdateTrialsLifeAndTime {num ms left, life}; num <= 1000 hides it.

import { TRIALS_TEXT, type TrialsLifeTime } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { stageEl } from '../stage';
import './trialsPanel.css';

const div = (cls: string, text = ''): HTMLDivElement => {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  return d;
};

/** mm:ss of a countdown. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export class TrialsTimer {
  private root: HTMLDivElement | null = null;
  private time: HTMLDivElement | null = null;
  private life: HTMLDivElement | null = null;
  private deadline = 0;
  private timer = 0;

  constructor(private readonly onQuit: () => void) {}

  /** onUpdateTrialsLifeAndTime / trialsTimerAward. */
  set(p: TrialsLifeTime | null): void {
    if (!p || p.num <= 1000) return this.hide();
    this.deadline = Date.now() + p.num;
    if (!this.root) this.build();
    if (p.life >= 0 && this.life) this.life.textContent = TRIALS_TEXT.LIVES(p.life);
    this.tick();
  }

  private build(): void {
    const quit = document.createElement('button');
    quit.className = 'tr-quit';
    quit.textContent = 'Thoát';
    quit.onclick = () => askConfirm(TRIALS_TEXT.CONFIRM_QUIT, this.onQuit);
    this.time = div('tr-time');
    this.life = div('tr-life');
    this.root = div('tr-strip');
    this.root.append(div('tr-sname', TRIALS_TEXT.TITLE), this.time, this.life, quit);
    stageEl().appendChild(this.root);
    this.timer = window.setInterval(() => this.tick(), 1000);
  }

  private tick(): void {
    const left = this.deadline - Date.now();
    if (left <= 0) return this.hide();
    if (this.time) this.time.textContent = TRIALS_TEXT.TIMER(clock(left));
  }

  hide(): void {
    window.clearInterval(this.timer);
    this.root?.remove();
    this.root = this.time = this.life = null;
    this.deadline = 0;
  }
}
