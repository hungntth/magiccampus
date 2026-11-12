// Group title input of the Kết bái flow (CALLBACK_S[202] / [196] follow-up): a text box with the 8 character limit, validated with the
// shared title rule before calling back; Enter confirms, Esc cancels. Same look as the rename dialog.

import { BROTHER, BROTHER_TEXT, normalizeBrotherTitle } from '@mc/shared';
import { stageEl } from '../stage';
import { toast } from '../screens';
import '../bag.css';
import '../transport.css';

/** Opens the dialog; `onOk` receives the validated, trimmed title. Returns a function that closes it. */
export function askBrotherTitle(onOk: (title: string) => void): () => void {
  const root = document.createElement('div');
  root.className = 'amount-dialog rename-dialog brother-title-dialog';
  const label = document.createElement('div');
  label.className = 'amount-title';
  label.textContent = BROTHER_TEXT.inputTitle;
  const input = document.createElement('input');
  input.className = 'amount-input';
  input.maxLength = BROTHER.titleMax;
  const ok = document.createElement('button');
  ok.className = 'amount-btn';
  ok.textContent = 'Đồng ý';
  const cancel = document.createElement('button');
  cancel.className = 'amount-btn';
  cancel.textContent = 'Hủy';
  const row = document.createElement('div');
  row.className = 'amount-row';
  row.append(ok, cancel);
  root.append(label, input, row);

  const close = (): void => root.remove();
  const confirm = (): void => {
    const title = normalizeBrotherTitle(input.value);
    if (!title) return void toast(BROTHER_TEXT.badTitle, true);
    close();
    onOk(title);
  };
  input.onkeydown = (e) => {
    e.stopPropagation(); // typing must not reach the HUD hotkeys
    if (e.key === 'Enter') confirm();
    else if (e.key === 'Escape') close();
  };
  ok.onclick = confirm;
  cancel.onclick = close;
  stageEl().appendChild(root);
  input.focus();
  return close;
}
