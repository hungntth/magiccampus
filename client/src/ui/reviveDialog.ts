// Free revive dialog (legacy BattleStage.onReliveSwitch result 2): "Hồi sinh" (OK) revives in place, "Về" (cancel) goes to
// the safe point; a 20 s countdown fires the cancel path at 0. Strings are BATTLESTAGE_S[9..11] from Language.as.

import { stageEl } from './stage';
import './bag.css';
import './battle.css';

const REVIVE_SECONDS = 20;
const TEXT = "Bạn đã tử vong\n Nhấn 'OK' để hồi sinh tại chỗ.\n Nhấn 'Về' để được chuyển về vị trí an toàn, không mất độ bền trang bị.";

export interface ReviveHandlers {
  onHere(): void;
  onSafe(): void;
}

/** Opens the dialog; returns a function that closes it without choosing. */
export function showReviveDialog(h: ReviveHandlers): () => void {
  const root = document.createElement('div');
  root.className = 'amount-dialog confirm-dialog revive-dialog';
  const msg = document.createElement('div');
  msg.className = 'amount-total confirm-text';
  const body = document.createElement('span');
  body.textContent = TEXT;
  const count = document.createElement('span');
  count.className = 'revive-count';
  msg.append(body, document.createElement('br'), count);
  const mk = (label: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = 'amount-btn';
    b.textContent = label;
    return b;
  };
  const ok = mk('OK');
  const back = mk('Về');
  const row = document.createElement('div');
  row.className = 'amount-row';
  row.append(ok, back);
  root.append(msg, row);

  let left = REVIVE_SECONDS;
  const render = (): void => {
    count.textContent = `(${left} sau sẽ về thành)`; // the stray ")" is in the original string
  };
  const close = (): void => {
    clearInterval(timer);
    root.remove();
  };
  const choose = (fn: () => void): void => {
    close();
    fn();
  };
  const timer = setInterval(() => {
    left--;
    render();
    if (left <= 0) choose(h.onSafe);
  }, 1000);
  ok.onclick = () => choose(h.onHere);
  back.onclick = () => choose(h.onSafe);
  render();
  stageEl().appendChild(root);
  ok.focus();
  return close;
}
