// Phụ bản run strip (H5 view of onDungeonRun): a top-right card with the dungeon name and difficulty, the floor, a countdown to
// the run deadline and the floor's pending parts. Hidden off the floors (null push). Pure DOM; DungeonController feeds it.

import type { DungeonRunView } from '@mc/shared';
import { stageEl } from '../stage';
import './dungeon.css';

const el = (cls: string, text = ''): HTMLDivElement => {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  return d;
};

export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export class RunStrip {
  private root: HTMLDivElement | null = null;
  private timer = 0;
  private view: DungeonRunView | null = null;

  set(view: DungeonRunView | null): void {
    this.view = view;
    if (!view) return this.hide();
    if (!this.root) {
      this.root = el('dg-strip');
      stageEl().appendChild(this.root);
      this.timer = window.setInterval(() => this.tick(), 1000);
    }
    this.root.replaceChildren(
      el('dg-name', `${view.name} (${view.difficulty})`),
      el('dg-floor', `Tầng ${view.floor + 1}/${view.floors}`),
      el('dg-time'),
      el('dg-pending', view.pending ? `Cần: ${view.pending}` : 'Tầng này đã hoàn thành'),
    );
    this.tick();
  }

  private tick(): void {
    const t = this.root?.querySelector('.dg-time');
    if (t && this.view) t.textContent = `Còn lại: ${countdown(this.view.deadline - Date.now())}`;
  }

  hide(): void {
    window.clearInterval(this.timer);
    this.root?.remove();
    this.root = null;
  }
}
