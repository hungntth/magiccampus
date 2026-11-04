// Tiny DOM helpers shared by the stat-feature tabs (train soul, awakening, war sprite, magic crystal).

import { propLineText, type PropLine } from '@mc/shared';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function button(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = el('button', 'ft-btn', label);
  b.disabled = disabled;
  b.onclick = onClick;
  return b;
}

/** Progress bar with a centred label. */
export function bar(value: number, max: number, label: string): HTMLElement {
  const wrap = el('div', 'ft-bar');
  const fill = el('div', 'ft-bar-fill');
  fill.style.width = `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`;
  wrap.append(fill, el('div', 'ft-bar-text', label));
  return wrap;
}

/** One line per prop ("HP+231"); `format` overrides the default text. */
export function propLines(lines: readonly PropLine[], format: (l: PropLine) => string = propLineText): HTMLElement {
  const box = el('div', 'ft-props');
  if (lines.length === 0) box.appendChild(el('div', 'ft-muted', '-'));
  for (const l of lines) box.appendChild(el('div', 'ft-prop', format(l)));
  return box;
}

export const fmt = (n: number): string => n.toLocaleString('en-US');
