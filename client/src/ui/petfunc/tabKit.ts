// Shared scaffolding of the Luyện pet tabs: the frame (seats row, info lines, buttons, result box, collapsible guide), button
// and result-row builders, and the single-flight runner that disables the buttons while an RPC is pending.

import { el } from '../petPanelTabs';

export interface Frame {
  root: HTMLElement;
  seats: HTMLElement;
  info: HTMLElement;
  buttons: HTMLElement;
  result: HTMLElement;
}

export function buildFrame(body: HTMLElement, guide: string): Frame {
  const root = el('div', 'pf-tab');
  const seats = el('div', 'pf-seats');
  const info = el('div', 'pf-info');
  const buttons = el('div', 'pf-buttons');
  const result = el('div', 'pf-result');
  const g = el('details', 'pf-guide');
  g.append(el('summary', '', 'Hướng dẫn'), el('div', 'pf-guide-text', guide));
  root.append(seats, info, buttons, result, g);
  body.replaceChildren(root);
  return { root, seats, info, buttons, result };
}

export function button(label: string, onClick: () => void, enabled = true, primary = true): HTMLButtonElement {
  const b = el('button', `pet-btn${primary ? ' primary' : ''}`, label);
  b.disabled = !enabled;
  b.onclick = onClick;
  return b;
}

export type Tone = 'ok' | 'bad' | 'warn' | '';

export function lines(target: HTMLElement, rows: (string | [string, Tone])[]): void {
  target.replaceChildren(...rows.map((r) => (typeof r === 'string' ? el('div', 'pf-line', r) : el('div', `pf-line ${r[1]}`, r[0]))));
}

/** "<label>: old -> new" row, green when it improved, red otherwise. */
export function changeRow(label: string, before: string, after: string, improved: boolean): HTMLElement {
  const row = el('div', 'pf-change');
  row.append(el('span', '', `${label}: ${before} → `), el('span', improved ? 'ok' : 'bad', after));
  return row;
}

export function showResult(frame: Frame, title: string, rows: HTMLElement[]): void {
  frame.result.replaceChildren(el('div', 'pf-result-title', title), ...rows);
}

/** One RPC at a time per tab: `run` ignores a second click while the first is pending, then redraws. */
export class Runner {
  private busy = false;

  get pending(): boolean {
    return this.busy;
  }

  async run(job: () => Promise<void>, redraw: () => void): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    redraw();
    try {
      await job();
    } finally {
      this.busy = false;
      redraw();
    }
  }
}
