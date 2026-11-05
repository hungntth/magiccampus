// Chat emotions over a speaker's head (legacy CreatureView.emotion, M9 phase G): a chat text that is exactly one code
// (/laugh, ...) plays sheets/emotion/EM_NORMAL_0000NN at (-20, -120) for 3 s. Three SWFs do not convert (05, 22, 23):
// those codes show nothing.

import { Ticker, type Container } from 'pixi.js';
import { EMOTION_RES } from '@mc/shared';
import { sheetNameFromResCode } from './Entity';
import { loadSheet, SheetAnim } from './SheetAnim';

const SHOW_MS = 3000;
const OFFSET_X = -20;
const OFFSET_Y = -120;

interface Shown {
  anim: SheetAnim;
  until: number;
}

const active = new Map<Container, Shown>();
let ticking = false;

function tick(t: Ticker): void {
  const now = performance.now();
  for (const [host, s] of active) {
    if (now >= s.until || host.destroyed) {
      s.anim.destroy({ children: true });
      active.delete(host);
    } else {
      s.anim.tick(t.deltaMS / 1000);
    }
  }
  if (active.size === 0 && ticking) {
    Ticker.shared.remove(tick);
    ticking = false;
  }
}

/** Plays emotion `code` over `host` (an Entity); a new one replaces the previous. */
export async function showEmotion(host: Container, code: string): Promise<void> {
  const res = EMOTION_RES[code];
  const name = res ? sheetNameFromResCode(res) : null;
  const sheet = name ? await loadSheet(name) : null;
  if (!sheet || host.destroyed) return;
  active.get(host)?.anim.destroy({ children: true });
  const anim = new SheetAnim(sheet);
  anim.play('default');
  anim.position.set(OFFSET_X, OFFSET_Y);
  host.addChild(anim);
  active.set(host, { anim, until: performance.now() + SHOW_MS });
  if (!ticking) {
    Ticker.shared.add(tick);
    ticking = true;
  }
}
