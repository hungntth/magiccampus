// Sư đồ request prompts (legacy WarnCanvas icons for onFindTeacher / onFindStudent): a small stacked box with Đồng ý / Từ chối that
// expires with the server request (5 min). Pure view; MentorController wires the accept RPC.

import { MENTOR_REQUEST_MS } from '@mc/shared';
import { stageEl } from '../stage';
import { el } from './imList';
import './mentor.css';

function stack(): HTMLElement {
  let s = stageEl().querySelector<HTMLElement>('.mentor-warn-stack');
  if (!s) {
    s = el('div', 'mentor-warn-stack');
    stageEl().appendChild(s);
  }
  return s;
}

/** Shows a prompt; returns a function that removes it. `onAccept` runs on Đồng ý. */
export function showMentorWarn(text: string, onAccept: () => void): () => void {
  const box = el('div', 'mentor-warn');
  const msg = el('div', 'mentor-warn-text', text);
  const ok = el('button', 'friend-btn', 'Đồng ý');
  const no = el('button', 'friend-btn', 'Từ chối');
  const row = el('div', 'mentor-warn-row');
  row.append(ok, no);
  box.append(msg, row);
  stack().appendChild(box);
  const timer = setTimeout(() => box.remove(), MENTOR_REQUEST_MS);
  const close = (): void => {
    clearTimeout(timer);
    box.remove();
  };
  ok.onclick = () => {
    close();
    onAccept();
  };
  no.onclick = close;
  return close;
}
