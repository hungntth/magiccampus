// Tiểu Tinh Linh "Kỹ Năng" page (legacy FairySkillCanvas + FairySkillListComp): the 20 skill slots s1..s20 (a click picks one: name, level,
// passive / active, description and buff effect, Thăng cấp = upFairySkill with Sách Huấn Luyện Truyền Nhân 3583: 1 for level 2, 3 for
// level 3) and the Học skill list of the Bí Kíp Tinh Linh books in the bag (onSkill; client gate: grow level >= book req level, 20 slots).

import { FAIRY, FAIRY_SKILL_BOOKS, FAIRY_TEXT, fairyGrowLevel, type BagItem, type FairyInfo } from '@mc/shared';
import { button, el } from '../feature/dom';
import { toast } from '../screens';
import { bookOf, familyMax, learnedSkills, skillOf, upgradeCost } from './fairyConfig';
import { FAIRY_UI, type FairyUiHost } from './fairyTypes';
import { itemIcon, itemList } from './feedTab';

function slotGrid(host: FairyUiHost, learned: Map<number, number>): HTMLElement {
  const grid = el('div', 'fy-slots');
  for (let i = 1; i <= FAIRY.SKILL_SLOTS; i++) {
    const id = learned.get(i);
    const row = id ? skillOf(id) : undefined;
    const cell = itemIcon(row?.iconCode ?? '');
    cell.classList.add('fy-slot');
    if (!id) cell.classList.add('empty');
    if (host.skillPick() === i) cell.classList.add('on');
    if (row) {
      cell.title = `${row.name} Lv ${row.level}`;
      cell.appendChild(el('span', 'fy-qty', String(row.level)));
      cell.onclick = () => host.pickSkill(i);
    }
    grid.appendChild(cell);
  }
  return grid;
}

function detail(host: FairyUiHost, index: number, id: number): HTMLElement {
  const box = el('div', 'fy-box');
  const r = skillOf(id);
  if (!r) {
    box.appendChild(el('div', 'ft-muted', `#${id}`));
    return box;
  }
  const max = familyMax(r.codeName);
  box.append(
    el('div', 'fy-title', `${r.name}  Lv ${r.level}/${max}  [${r.type === FAIRY.SKILL_ACTIVE ? FAIRY_UI.ACTIVE : FAIRY_UI.PASSIVE}]`),
    el('div', 'fy-help', r.desc),
  );
  if (r.buffDesc) box.appendChild(el('div', 'fy-up', r.buffDesc));
  const need = r.level < max ? upgradeCost(r.level) : 0;
  const row = el('div', 'fy-row');
  if (need > 0) {
    const have = host.count(FAIRY.SKILL_UP_ITEM);
    row.append(button(FAIRY_UI.UPGRADE, () => host.upgrade(index), host.busy()), el('span', have >= need ? 'fy-k' : 'fy-warn', FAIRY_UI.UP_NEED(have, need)));
  } else {
    row.appendChild(el('span', 'ft-muted', FAIRY_TEXT.SKILL_MAX));
  }
  box.appendChild(row);
  return box;
}

function learnBox(host: FairyUiHost, f: FairyInfo, count: number): HTMLElement {
  const box = el('div', 'fy-box');
  box.append(el('div', 'fy-title', FAIRY_UI.LEARN_TITLE), el('div', 'fy-help pre', FAIRY_UI.SKILL_HELP));
  const books = host.items().filter((i) => FAIRY_SKILL_BOOKS[i.tid] !== undefined).sort((a, b) => a.tid - b.tid || a.id - b.id);
  const g = fairyGrowLevel(f.gexp);
  const learn = (it: BagItem): void => {
    if (g < (bookOf(it.tid)?.reqLevel ?? 0)) return toast(FAIRY_TEXT.LOW_LEVEL, true);
    if (count >= FAIRY.SKILL_SLOTS) return toast(FAIRY_TEXT.SKILLS_FULL, true);
    host.learn(it);
  };
  if (books.length === 0) box.appendChild(el('div', 'ft-muted', FAIRY_UI.NO_BOOKS));
  else box.appendChild(itemList(host, books, (it) => `${FAIRY_UI.GROW_LV} ${bookOf(it.tid)?.reqLevel ?? '?'}`, FAIRY_UI.LEARN, learn));
  return box;
}

export function renderSkillTab(host: FairyUiHost, f: FairyInfo, body: HTMLElement): void {
  const learned = new Map(learnedSkills(f));
  body.append(el('div', 'fy-title', `${FAIRY_UI.SKILLS} (${learned.size}/${FAIRY.SKILL_SLOTS})`), slotGrid(host, learned));
  const pick = host.skillPick();
  const id = learned.get(pick);
  body.appendChild(id ? detail(host, pick, id) : el('div', 'ft-muted', FAIRY_UI.PICK_HINT));
  body.appendChild(learnBox(host, f, learned.size));
}
