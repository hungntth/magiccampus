// DOM screens: toasts and the #ui reset. Login lives in loginScreen.ts, character select/create in charSelect.ts.

const ui = (): HTMLElement => document.getElementById('ui')!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function clearUi(): void {
  ui().replaceChildren();
}

export function toast(text: string, danger = false, ms = 3500): void {
  const t = el('div', `toast${danger ? ' danger' : ''}`, text);
  ui().appendChild(t);
  setTimeout(() => t.remove(), ms);
}
