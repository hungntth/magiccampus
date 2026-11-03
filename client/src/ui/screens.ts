// DOM screens: login/register and character select/create. Returns the chosen character's PlayerData.

import { md5, type CharListResponse, type ClassInfo, type PlayerData } from '@mc/shared';
import type { GameClient } from '../net/client';
import { iconUrl } from '../assets';

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

export async function showCharSelect(client: GameClient): Promise<PlayerData> {
  const classes = await client.call<ClassInfo[]>('getClassList');
  for (;;) {
    const list = await client.call<CharListResponse>('sendCharList');
    const choice = await renderCharSelect(client, list, classes);
    if (choice) return choice;
  }
}

function renderCharSelect(client: GameClient, list: CharListResponse, classes: ClassInfo[]): Promise<PlayerData | null> {
  return new Promise((resolve) => {
    clearUi();
    const screen = el('div', 'screen');
    const panel = el('div', 'panel');
    panel.style.minWidth = '520px';
    panel.appendChild(el('h1', undefined, 'Chọn nhân vật'));
    const err = el('div', 'error');

    const grid = el('div', 'char-list');
    let selected: number | null = null;
    const cards: HTMLElement[] = [];
    for (const c of list.charList) {
      const card = el('div', 'char-card');
      const img = el('img');
      img.src = iconUrl(c.iconCode);
      img.onerror = () => (img.style.visibility = 'hidden');
      card.appendChild(img);
      card.appendChild(el('div', 'name', c.name));
      const cls = classes.find((k) => k.id === c.classId);
      card.appendChild(el('div', 'sub', `Lv ${c.level} · ${cls?.name ?? `class ${c.classId}`}`));
      card.onclick = () => {
        selected = c.id;
        cards.forEach((x) => x.classList.remove('selected'));
        card.classList.add('selected');
      };
      card.ondblclick = () => void enter();
      cards.push(card);
      grid.appendChild(card);
    }
    if (list.charList.length === 0) grid.appendChild(el('div', 'sub', 'Chưa có nhân vật. Tạo mới bên dưới.'));
    panel.appendChild(grid);

    const enterBtn = el('button', undefined, 'Vào game');
    const enter = async () => {
      if (selected === null) {
        err.textContent = 'Chọn một nhân vật';
        return;
      }
      enterBtn.disabled = true;
      try {
        resolve(await client.call<PlayerData>('chooseCharactor', selected));
      } catch (e) {
        err.textContent = (e as Error).message;
        enterBtn.disabled = false;
      }
    };
    enterBtn.onclick = () => void enter();
    panel.appendChild(enterBtn);

    panel.appendChild(el('label', undefined, 'Tạo nhân vật mới'));
    const name = el('input');
    name.placeholder = 'Tên nhân vật';
    name.maxLength = 16;
    panel.appendChild(name);
    const genderRow = el('div', 'row');
    const gender = el('select');
    gender.append(new Option('Nam', '0'), new Option('Nữ', '1'));
    genderRow.appendChild(gender);
    panel.appendChild(genderRow);
    const classGrid = el('div', 'class-grid');
    let classId = classes[0]?.id ?? 1;
    const classCards: HTMLElement[] = [];
    const renderClassIcons = () => {
      for (const [i, k] of classes.entries()) {
        const img = classCards[i].querySelector('img')!;
        img.src = iconUrl(gender.value === '1' ? k.iconCodeFemale : k.iconCodeMale);
      }
    };
    for (const k of classes) {
      const card = el('div', `char-card${k.id === classId ? ' selected' : ''}`);
      const img = el('img');
      img.onerror = () => (img.style.visibility = 'hidden');
      card.appendChild(img);
      card.appendChild(el('div', 'name', k.name));
      card.title = k.description;
      card.onclick = () => {
        classId = k.id;
        classCards.forEach((x) => x.classList.remove('selected'));
        card.classList.add('selected');
      };
      classCards.push(card);
      classGrid.appendChild(card);
    }
    gender.onchange = renderClassIcons;
    renderClassIcons();
    panel.appendChild(classGrid);
    const createBtn = el('button', 'secondary', 'Tạo nhân vật');
    createBtn.onclick = async () => {
      err.textContent = '';
      createBtn.disabled = true;
      try {
        await client.call('newChar', name.value, classId, Number(gender.value));
        resolve(null);
      } catch (e) {
        err.textContent = (e as Error).message;
        createBtn.disabled = false;
      }
    };
    panel.append(createBtn, err);
    screen.appendChild(panel);
    ui().appendChild(screen);
  });
}
