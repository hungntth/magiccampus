// Shared behaviour for in-game windows (legacy compDragable panels): drag by the frame/title, Esc closes.
// Panels live in the scaled #stage, so pointer deltas are divided by the stage scale.

import { stageEl, stageScale } from './stage';

const NO_DRAG = 'button, input, select, textarea, a, [data-no-drag]';

/** Drag `panel` by pressing anywhere on it except controls (or only on `handle` when given). Returns a disposer. */
export function makeDraggable(panel: HTMLElement, handle?: HTMLElement): () => void {
  const grip = handle ?? panel;
  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || (e.target instanceof Element && e.target.closest(NO_DRAG))) return;
    const stage = stageEl().getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const scale = stageScale();
    // Switch from centered CSS to explicit stage-pixel left/top once, so dragging keeps the panel under the pointer.
    const left = (box.left - stage.left) / scale;
    const top = (box.top - stage.top) / scale;
    panel.style.transform = 'none';
    panel.style.margin = '0';
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    const startX = e.clientX;
    const startY = e.clientY;
    const maxLeft = stage.width / scale - 40;
    const maxTop = stage.height / scale - 30;
    const onMove = (m: PointerEvent): void => {
      const x = Math.max(40 - box.width / scale, Math.min(maxLeft, left + (m.clientX - startX) / scale));
      const y = Math.max(0, Math.min(maxTop, top + (m.clientY - startY) / scale));
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    e.preventDefault();
  };
  grip.addEventListener('pointerdown', onDown);
  grip.style.cursor = 'move';
  return () => grip.removeEventListener('pointerdown', onDown);
}

/** Calls `close` on Escape, also while the chat input has focus (it is blurred). Returns a disposer. */
export function closeOnEscape(close: () => void): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    const a = document.activeElement;
    if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) a.blur();
    e.preventDefault();
    close();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
