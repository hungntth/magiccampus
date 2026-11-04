// Rename-card dialog (legacy CHARACTORPANEL_S[9] / [10]): text input with the 12 character limit, Đồng ý / Hủy.
// Validates with the shared name rules before calling back; Enter confirms, Esc cancels.

import { NAME_MAX, validateNewName } from '@mc/shared';
import { stageEl } from './stage';
import { toast } from './screens';
import './bag.css';
import './transport.css';

/** Opens the dialog; `onOk` receives the validated, trimmed name. Returns a function that closes it. */
export function askNewName(onOk: (name: string) => void): () => void {
  const root = document.createElement('div');
  root.className = 'amount-dialog rename-dialog';
  const title = document.createElement('div');
  title.className = 'amount-title';
  title.textContent = `Nhập tên mới (giới hạn ${NAME_MAX} ký tự)`;
  const input = document.createElement('input');
  input.className = 'amount-input';
  input.maxLength = NAME_MAX;
  const ok = document.createElement('button');
  ok.className = 'amount-btn';
  ok.textContent = 'Đổi tên';
  const cancel = document.createElement('button');
  cancel.className = 'amount-btn';
  cancel.textContent = 'Hủy';
  const row = document.createElement('div');
  row.className = 'amount-row';
  row.append(ok, cancel);
  root.append(title, input, row);

  const close = (): void => root.remove();
  const confirm = (): void => {
    const check = validateNewName(input.value);
    if (!check.ok) return void toast(check.msg, true);
    close();
    onOk(check.name);
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
