// Login screen (legacy compFore/LoginCanvas, 900x570 scaled to fit): town background and the 287x130 CanvasLogined panel
// (x300, bottom 40) with the "Vào game" title, ID / Pass inputs, "Lưu" (remember the account name) and Đăng nhập /
// Đăng ký (widened and centred: the Flash "Bắt buộc" force-login button and proxy options are not ported). Calls register + login.

import { md5 } from '@mc/shared';
import type { GameClient } from '../net/client';
import { at, el, frame, loginButton } from './charSelect';
import './loginScreen.css';

const SAVED_NAME_KEY = 'mc.loginName';

function savedName(): string {
  try {
    return localStorage.getItem(SAVED_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberName(name: string | null): void {
  try {
    if (name) localStorage.setItem(SAVED_NAME_KEY, name);
    else localStorage.removeItem(SAVED_NAME_KEY);
  } catch {
    // storage blocked: nothing to remember
  }
}

function input(parent: HTMLElement, y: number, type: string, autocomplete: AutoFill): HTMLInputElement {
  const e = at(el('input', 'lg-input', parent), 65, y, 110, 22);
  e.type = type;
  e.autocomplete = autocomplete;
  e.spellcheck = false;
  return e;
}

export function showLogin(client: GameClient): Promise<void> {
  return new Promise((resolve) => {
    const { root, dispose } = frame();
    const warn = at(el('div', 'lg-warn', root), 0, 372, 900);
    const panel = at(el('div', 'cs-panel', root), 300, 400, 287, 130);
    at(el('div', 'cs-title', panel, 'Vào game'), 0, 3, 287, 21);
    at(el('div', 'lg-label', panel, 'ID'), 20, 40, 40, 18);
    at(el('div', 'lg-label', panel, 'Pass'), 20, 70, 40, 18);
    const user = input(panel, 37, 'text', 'username');
    const pass = input(panel, 67, 'password', 'current-password');

    const save = el('label', 'lg-save', panel);
    at(save, 185, 40, 80, 18);
    const saveBox = el('input', '', save);
    saveBox.type = 'checkbox';
    save.append('Lưu');
    save.title = 'Chọn mục này sẽ tự động lưu tên tài khoản của bạn vào máy, ở lần đăng nhập tiếp theo bạn sẽ không cần điền.';
    user.value = savedName();
    saveBox.checked = user.value !== '';

    const submit = async (register: boolean): Promise<void> => {
      warn.textContent = '';
      const u = user.value.trim();
      const p = pass.value;
      if (!u || !p) {
        warn.textContent = 'Nhập tài khoản và mật khẩu';
        return;
      }
      loginBtn.disabled = regBtn.disabled = true;
      try {
        const hashed = md5(p);
        if (register) await client.call('register', u, hashed);
        await client.call('login', u, hashed);
        rememberName(saveBox.checked ? u : null);
        dispose();
        resolve();
      } catch (e) {
        warn.textContent = (e as Error).message;
      } finally {
        loginBtn.disabled = regBtn.disabled = false;
      }
    };
    const loginBtn = at(loginButton(panel, 'Đăng nhập', () => void submit(false)), 44, 95, 90, 27);
    const regBtn = at(loginButton(panel, 'Đăng ký', () => void submit(true)), 154, 95, 90, 27);
    user.onkeydown = (e) => {
      if (e.key === 'Enter') pass.focus();
    };
    pass.onkeydown = (e) => {
      if (e.key === 'Enter') void submit(false);
    };
    (user.value ? pass : user).focus();
  });
}
