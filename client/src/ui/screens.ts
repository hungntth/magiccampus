// DOM screens: login/register, toasts and the #ui reset. Character select/create lives in charSelect.ts.

import { md5 } from '@mc/shared';
import type { GameClient } from '../net/client';

const ui = (): HTMLElement => document.getElementById('ui')!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function clearUi(): void {
  ui().replaceChildren();
}

export function toast(text: string, danger = false, ms = 3500): void {
  const t = el('div', `toast${danger ? ' danger' : ''}`, text);
  ui().appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function showLogin(client: GameClient): Promise<void> {
  return new Promise((resolve) => {
    clearUi();
    const screen = el('div', 'screen');
    const panel = el('div', 'panel');
    panel.appendChild(el('h1', undefined, 'MC Game H5'));
    panel.appendChild(el('label', undefined, 'Tài khoản'));
    const user = el('input');
    user.autocomplete = 'username';
    panel.appendChild(user);
    panel.appendChild(el('label', undefined, 'Mật khẩu'));
    const pass = el('input');
    pass.type = 'password';
    pass.autocomplete = 'current-password';
    panel.appendChild(pass);
    const err = el('div', 'error');
    const row = el('div', 'row');
    const loginBtn = el('button', undefined, 'Đăng nhập');
    const regBtn = el('button', 'secondary', 'Đăng ký');
    row.append(loginBtn, regBtn);
    panel.append(row, err);
    screen.appendChild(panel);
    ui().appendChild(screen);
    user.focus();

    const busy = (b: boolean) => {
      loginBtn.disabled = b;
      regBtn.disabled = b;
    };
    const submit = async (register: boolean) => {
      err.textContent = '';
      const u = user.value.trim();
      const p = pass.value;
      if (!u || !p) {
        err.textContent = 'Nhập tài khoản và mật khẩu';
        return;
      }
      busy(true);
      try {
        const hashed = md5(p);
        if (register) await client.call('register', u, hashed);
        await client.call('login', u, hashed);
        resolve();
      } catch (e) {
        err.textContent = (e as Error).message;
      } finally {
        busy(false);
      }
    };
    loginBtn.onclick = () => void submit(false);
    regBtn.onclick = () => void submit(true);
    pass.onkeydown = (e) => {
      if (e.key === 'Enter') void submit(false);
    };
  });
}
