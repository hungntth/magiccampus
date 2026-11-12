// Small popup of the 3v3 event: the settlement alert ("Hạng X, nhận N Huy Chương Dũng Sĩ") with one OK button.

import { stageEl } from '../stage';
import { button, el } from './threepvpView';
import './threepvp.css';

/** Result box; `title` gets the css class `tone` (win / lose / none), `lines` are plain rows. Returns a function that closes it. */
export function showPvpResult(title: string, tone: 'win' | 'lose' | '', lines: string[], onOk: () => void): () => void {
  const root = el('div', 'pvp3-result');
  root.appendChild(el('div', `big ${tone}`.trim(), title));
  for (const l of lines) root.appendChild(el('div', '', l));
  const close = (): void => root.remove();
  root.appendChild(button('Đồng ý', () => {
    close();
    onOk();
  }));
  stageEl().appendChild(root);
  return close;
}
