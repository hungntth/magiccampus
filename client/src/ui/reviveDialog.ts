// Relive dialogs (legacy BattleStage.onReliveSwitch, M9 phase D): a timed two-button dialog. Mode 1 (BATTLESTAGE_S[1], 20 s,
// OK = Hình Nhân / 18 gold, "Về" = toSafe), mode 2 (BATTLESTAGE_S[11], 20 s, free), mode 3 (BATTLESTAGE_S[23], 30 s, live gold
// price, OK = bbGoldRelive, Hủy / 0 = bbNormalRelive). The countdown fires the back path at 0.

import { stageEl } from './stage';
import './bag.css';
import './battle.css';

export const FREE_TEXT = "Bạn đã tử vong\n Nhấn 'OK' để hồi sinh tại chỗ.\n Nhấn 'Về' để được chuyển về vị trí an toàn, không mất độ bền trang bị.";

export interface TimedDialog {
  seconds: number;
  okLabel: string;
  backLabel: string;
  /** Body text and countdown line for `left` seconds remaining. */
  render(left: number): { text: string; count: string };
  onOk(left: number): void;
  onBack(): void;
}

/** Opens the dialog; returns a function that closes it without choosing. */
export function showTimedDialog(d: TimedDialog): () => void {
  const root = document.createElement('div');
  root.className = 'amount-dialog confirm-dialog revive-dialog';
  const msg = document.createElement('div');
  msg.className = 'amount-total confirm-text';
  const body = document.createElement('span');
  const count = document.createElement('span');
  count.className = 'revive-count';
  msg.append(body, document.createElement('br'), count);
  const mk = (label: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = 'amount-btn';
    b.textContent = label;
    return b;
  };
  const ok = mk(d.okLabel);
  const back = mk(d.backLabel);
  const row = document.createElement('div');
  row.className = 'amount-row';
  row.append(ok, back);
  root.append(msg, row);

  let left = d.seconds;
  const paint = (): void => {
    const r = d.render(left);
    body.textContent = r.text;
    count.textContent = r.count;
  };
  const close = (): void => {
    clearInterval(timer);
    root.remove();
  };
  const timer = setInterval(() => {
    left--;
    paint();
    if (left <= 0) {
      close();
      d.onBack();
    }
  }, 1000);
  ok.onclick = () => {
    close();
    d.onOk(left);
  };
  back.onclick = () => {
    close();
    d.onBack();
  };
  paint();
  stageEl().appendChild(root);
  ok.focus();
  return close;
}

/** Strips the Flash <font> markup of BATTLESTAGE_S[23]. */
export const plain = (html: string): string => html.replace(/<[^>]+>/g, '');
