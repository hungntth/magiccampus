// Character select / create screen (legacy compFore/CharSelectCanvas, 900x570 scaled to fit): town background, class
// preview (ClassInfo.largeImg*), teal "Chọn nhân vật" panel with 3 slot cards, button strip Vào game / Xóa nhân vật /
// Tạo nhân vật / Quay lại and "Tạo lại pass". Calls chooseCharactor, newChar, logout. Resolves the chosen PlayerData,
// or null for "Quay lại" (back to login).

import type { CharListEntry, CharListResponse, ClassInfo, PlayerData } from '@mc/shared';
import { iconUrl } from '../assets';
import type { GameClient } from '../net/client';
import { clearUi, toast } from './screens';
import './charSelect.css';

const W = 900; // CharSelectCanvas size
const H = 570;
const PAGE = 3; // CharSelectCanvas page size (a literal 3 in Flash; maxCharSlots is not read)

type Choice = PlayerData | 'back' | 'reload';

const ui = (): HTMLElement => document.getElementById('ui')!;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** Absolute box in the 900x570 frame. */
export function at<T extends HTMLElement>(e: T, x: number, y: number, w?: number, h?: number): T {
  e.style.left = `${x}px`;
  e.style.top = `${y}px`;
  if (w !== undefined) e.style.width = `${w}px`;
  if (h !== undefined) e.style.height = `${h}px`;
  return e;
}

export function loginButton(parent: HTMLElement, label: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = el('button', 'cs-btn', parent, label);
  b.disabled = disabled;
  b.onclick = onClick;
  return b;
}

/** Full-screen background plus the scaled 900x570 frame; returns the frame and a disposer for the resize listener. */
export function frame(): { root: HTMLElement; dispose: () => void } {
  clearUi();
  const screen = el('div', 'cs-screen', ui());
  const root = at(el('div', 'cs-frame', screen), 0, 0, W, H);
  const fit = (): void => {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    root.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  fit();
  window.addEventListener('resize', fit);
  return { root, dispose: () => window.removeEventListener('resize', fit) };
}

/** Loops select ↔ create until a character is chosen (PlayerData) or the player goes back to login (null). */
export async function showCharSelect(client: GameClient): Promise<PlayerData | null> {
  const classes = await client.call<ClassInfo[]>('getClassList');
  let create = false;
  for (;;) {
    const list = await client.call<CharListResponse>('sendCharList');
    const chars = list.charList;
    const choice: Choice | 'create' | 'select' = create || chars.length === 0
      ? await renderCreate(client, classes, chars.length > 0)
      : await renderSelect(client, chars, classes);
    if (choice === 'back') {
      await client.call('logout').catch(() => undefined);
      return null;
    }
    create = choice === 'create';
    if (choice !== 'reload' && choice !== 'create' && choice !== 'select') return choice;
  }
}

function classOf(classes: ClassInfo[], id: number): ClassInfo | undefined {
  return classes.find((k) => k.id === id);
}

function renderSelect(client: GameClient, chars: CharListEntry[], classes: ClassInfo[]): Promise<Choice | 'create'> {
  return new Promise((resolve) => {
    const { root, dispose } = frame();
    const done = (c: Choice | 'create'): void => {
      dispose();
      resolve(c);
    };
    let page = 0;
    let selected: CharListEntry | null = chars.find((c) => !c.deleted) ?? chars[0] ?? null;

    const preview = at(el('img', 'cs-preview', root), 300, 0, 320, 320);
    preview.alt = '';
    preview.onerror = () => (preview.style.visibility = 'hidden');

    loginButton(at(el('div', 'cs-pass', root), 560, 315, 107, 29), 'Tạo lại pass', () => toast('Chức năng mã bảo vệ chưa hỗ trợ'));

    const panel = at(el('div', 'cs-panel', root), 239, 345, 425, 105);
    el('div', 'cs-title', panel, 'Chọn nhân vật');
    const slots = at(el('div', 'cs-slots', panel), 0, 30, 425, 67);
    const left = el('button', 'cs-arrow cs-left', panel);
    const right = el('button', 'cs-arrow cs-right', panel);
    left.onclick = () => turn(-1);
    right.onclick = () => turn(1);

    const strip = at(el('div', 'cs-strip', root), 237, 467, 430, 50);
    const enterBtn = loginButton(strip, 'Vào game', () => void enter());
    // Flash ships "Xóa nhân vật" with enabled:false and never enables it (startDeleteChar is not ported either).
    loginButton(strip, 'Xóa nhân vật', () => undefined, true);
    loginButton(strip, 'Tạo nhân vật', () => done('create'), chars.length >= PAGE);
    loginButton(strip, 'Quay lại', () => done('back'));
    [...strip.children].forEach((b, i) => at(b as HTMLElement, 35 + i * 100, 11, 82, 29));

    const enter = async (): Promise<void> => {
      if (!selected || selected.deleted) return void toast('Chọn một nhân vật', true);
      enterBtn.disabled = true;
      try {
        done(await client.call<PlayerData>('chooseCharactor', selected.id));
      } catch (e) {
        toast((e as Error).message, true);
        enterBtn.disabled = false;
      }
    };

    const turn = (d: number): void => {
      page = Math.max(0, Math.min(Math.ceil(chars.length / PAGE) - 1, page + d));
      render();
    };

    const render = (): void => {
      const k = selected ? classOf(classes, selected.classId) : undefined;
      const img = k ? (selected!.gender === 1 ? k.largeImgFemale : k.largeImgMale) : '';
      preview.style.visibility = img ? 'visible' : 'hidden';
      if (img) preview.src = iconUrl(img);
      slots.replaceChildren();
      for (let i = 0; i < PAGE; i++) {
        const c = chars[page * PAGE + i];
        const x = 12 + i * (129 + 7.5);
        if (!c) {
          at(el('div', 'cs-empty', slots), x + 2, 1, 125, 65);
          continue;
        }
        const card = at(el('div', `cs-card${c === selected ? ' selected' : ''}${c.deleted ? ' deleted' : ''}`, slots), x, 0, 129, 67);
        const face = at(el('img', 'cs-face', card), 12, 10, 47, 47);
        face.alt = '';
        face.src = iconUrl(c.iconCode); // head avatar (same as the HUD portrait), not the full-body portraitCode
        face.onerror = () => (face.style.visibility = 'hidden');
        at(el('div', 'cs-label', card, c.name), 61, 5, 64).title = c.name;
        at(el('div', 'cs-label', card, `LV ${c.level}`), 61, 24, 64);
        at(el('div', 'cs-label', card, classOf(classes, c.classId)?.name ?? ''), 61, 41, 64);
        card.onclick = () => {
          selected = c;
          render();
        };
        card.ondblclick = () => void enter();
      }
      const paged = chars.length > PAGE;
      left.hidden = !paged || page === 0;
      right.hidden = !paged || (page + 1) * PAGE >= chars.length;
    };
    render();
  });
}

/** Create state: name, gender and class pick on the same background; "Quay lại" returns to the list (or login when empty). */
function renderCreate(client: GameClient, classes: ClassInfo[], hasChars: boolean): Promise<Choice | 'select'> {
  return new Promise((resolve) => {
    const { root, dispose } = frame();
    const done = (c: Choice | 'select'): void => {
      dispose();
      resolve(c);
    };
    const panel = at(el('div', 'cs-panel cs-create', root), 210, 70, 480, 400);
    el('div', 'cs-create-title', panel, 'Tạo nhân vật');
    const name = el('input', 'cs-input', panel);
    name.placeholder = 'Tên nhân vật';
    name.maxLength = 16;
    const gender = el('select', 'cs-input', panel);
    gender.append(new Option('Nam', '0'), new Option('Nữ', '1'));
    const grid = el('div', 'cs-classes', panel);
    let classId = classes[0]?.id ?? 1;
    const cards: { card: HTMLElement; img: HTMLImageElement; k: ClassInfo }[] = [];
    for (const k of classes) {
      const card = el('div', `cs-class${k.id === classId ? ' selected' : ''}`, grid);
      card.title = k.description;
      const img = el('img', '', card);
      img.alt = '';
      img.onerror = () => (img.style.visibility = 'hidden');
      el('div', 'cs-class-name', card, k.name);
      card.onclick = () => {
        classId = k.id;
        for (const c of cards) c.card.classList.toggle('selected', c.k.id === classId);
      };
      cards.push({ card, img, k });
    }
    const icons = (): void => {
      for (const c of cards) c.img.src = iconUrl(gender.value === '1' ? c.k.iconCodeFemale : c.k.iconCodeMale);
    };
    gender.onchange = icons;
    icons();

    const strip = at(el('div', 'cs-strip', root), 285, 480, 330, 50);
    const createBtn = loginButton(strip, 'Tạo nhân vật', () => void create());
    loginButton(strip, 'Quay lại', () => done(hasChars ? 'select' : 'back'));
    [...strip.children].forEach((b, i) => at(b as HTMLElement, 60 + i * 120, 11, 90, 29));
    name.focus();

    const create = async (): Promise<void> => {
      createBtn.disabled = true;
      try {
        await client.call('newChar', name.value, classId, Number(gender.value));
        done('reload');
      } catch (e) {
        toast((e as Error).message, true);
        createBtn.disabled = false;
      }
    };
    name.onkeydown = (e) => {
      if (e.key === 'Enter') void create();
    };
  });
}
