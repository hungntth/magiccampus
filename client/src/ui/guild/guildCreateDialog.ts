// "Lập bang" dialog (legacy AddGuildPanel): name field with the client rules (2..10 chars, no special characters), the
// requirement text and a confirm alert before addGuild is sent. Level / silver are re-checked here for a friendlier message;
// the server is the authority.

import { GuildLimits, guildNameError } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { makeDraggable } from '../panelBehavior';
import { toast } from '../screens';
import { stageEl } from '../stage';
import { button, el, field } from './guildState';

export interface CreateEnv {
  level: number;
  money: number;
  moneyBind: number;
  submit(name: string): void;
  onClose(): void;
}

export function openCreateDialog(env: CreateEnv): () => void {
  const root = el('div', 'guild-panel guild-create');
  const header = el('div', 'guild-header');
  header.appendChild(el('div', 'guild-title', 'Lập bang hội'));
  const close = (): void => {
    off();
    root.remove();
    env.onClose();
  };
  const x = el('button', 'guild-close', '×');
  x.onclick = close;
  header.appendChild(x);
  const body = el('div', 'guild-body');
  body.appendChild(el('div', 'guild-sub', 'Tên bang:'));
  const name = field('2-10 ký tự', GuildLimits.NAME_MAX + 4);
  name.className += ' create-name';
  body.appendChild(name);
  body.appendChild(el('div', 'guild-note dim', 'Điều kiện lập: Nhân vật cấp độ 50 trở lên và tốn 1000000 bạc.'));
  const go = (): void => {
    const text = name.value.trim();
    const bad = guildNameError(text);
    if (bad) return toast(bad, true);
    if (env.level < GuildLimits.CREATE_LEVEL) return toast('Cần đạt cấp 50 để lập bang hội', true);
    if (env.money < GuildLimits.CREATE_COST && env.moneyBind < GuildLimits.CREATE_COST) return toast('Bạc không đủ, không thể tạo!', true);
    askConfirm(`Xác nhận tạo Bang Hội: ${text}? Bạn sẽ phải tốn 1000000 bạc!`, () => {
      env.submit(text);
      close();
    });
  };
  const bar = el('div', 'guild-bar');
  bar.append(button('Tạo', go), button('Hủy', close));
  body.appendChild(bar);
  root.append(header, body);
  stageEl().appendChild(root);
  const off = makeDraggable(root, header, 'guildCreateDialog');
  name.focus();
  return close;
}
