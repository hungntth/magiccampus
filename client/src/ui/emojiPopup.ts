// Chat emotion popup (legacy EmotionCanvas, M9 phase G): 23 buttons of 30x30 over the MainStage_Emotions/CanvasEm_mc1 sheet,
// positioned as in Flash; a click sends the code plus a space as ordinary chat text (say). Outside click closes it.

import { EMOTION_CODES } from '@mc/shared';
import { div, place, skinImage } from './hud/skin';

// Button x/y of each code in EMOTION_CODES order (EmotionCanvas.as descriptors).
const POS: readonly (readonly [number, number])[] = [
  [0, 90], [30, 90], [150, 60], [60, 90], [90, 60], [120, 60], [30, 0], [0, 30], [150, 30], [0, 60], [90, 0], [90, 30],
  [120, 30], [150, 0], [60, 30], [30, 60], [60, 0], [0, 0], [60, 60], [30, 30], [120, 0], [90, 90], [120, 90],
];

let open: HTMLElement | null = null;

export function closeEmojiPopup(): void {
  open?.remove();
  open = null;
}

/** Toggles the popup above `anchor` (stage coordinates of its parent). */
export function toggleEmojiPopup(parent: HTMLElement, x: number, y: number, onPick: (code: string) => void): void {
  if (open) return closeEmojiPopup();
  const root = place(div('hud-emoji', parent), x, y, 190, 130);
  skinImage('MainStage_Emotions/CanvasEm_mc1', root, 0, 0);
  EMOTION_CODES.forEach((code, i) => {
    const [bx, by] = POS[i];
    const b = place(div('hud-emoji-btn', root), bx, by, 30, 30);
    b.title = `${code} `;
    b.onclick = (ev) => {
      ev.stopPropagation();
      closeEmojiPopup();
      onPick(`${code} `);
    };
  });
  root.onclick = (ev) => ev.stopPropagation();
  open = root;
  setTimeout(() => window.addEventListener('click', closeEmojiPopup, { once: true }), 0);
}
