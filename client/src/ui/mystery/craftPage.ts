// Mật Bảo "Chế Tạo" page (legacy DecoratePanel makeLabel1..6 / recipe list / material slots): level tabs (red above the skill level), the skill points, the recipe list
// (optionally only learned ones), the six material slots with "Tự động đặt nguyên liệu", the craft button and the daily allowance with the gold purchase.

import { MYS_TEXT, mysRecipeLabel, type MysRecipeRow } from '@mc/shared';
import { button, el } from '../feature/dom';
import { iconCell } from '../deco/decoCells';
import { autoPlace, haveOf, isRecipeLearned, recipesOfLevel, skillText, type MatStack } from './mysteryRules';
import type { MysteryUiHost } from './mysteryTypes';

function matStacks(host: MysteryUiHost): MatStack[] {
  return host.items().map((i) => ({ id: i.id, tid: i.tid, color: i.color, stackNum: i.stackNum }));
}

function levelTabs(host: MysteryUiHost): HTMLElement {
  const { skiLvl, skiPt } = host.makeData();
  const bar = el('div', 'my-levels');
  MYS_TEXT.LEVELS.forEach((label, i) => {
    const level = i + 1;
    const b = button(label, () => {
      host.view.level = level;
      host.view.recipe = 0;
      host.view.placed = null;
      host.actions.render();
    });
    if (host.view.level === level) b.classList.add('on');
    if (level > skiLvl) b.classList.add('my-red');
    bar.appendChild(b);
  });
  const skill = el('div', 'my-skill', `${MYS_TEXT.SKILL} Cấp ${skiLvl} · ${MYS_TEXT.SKILL_PT}${skillText(skiLvl, skiPt)}`);
  const wrap = el('div', 'my-levels-wrap');
  wrap.append(bar, skill);
  return wrap;
}

function recipeList(host: MysteryUiHost): HTMLElement {
  const learned = host.makeData().learnedRec;
  const box = el('div', 'my-recipes');
  const filter = el('label', 'my-filter');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = host.view.learnedOnly;
  cb.onchange = () => {
    host.view.learnedOnly = cb.checked;
    host.actions.render();
  };
  filter.append(cb, document.createTextNode(` ${MYS_TEXT.ONLY_LEARNED}`));
  box.append(el('div', 'ft-h', MYS_TEXT.LIST), filter);
  for (const r of recipesOfLevel(host.catalog()!, host.view.level, host.view.learnedOnly, learned)) {
    const row = el('div', `dc-row${host.view.recipe === r.id ? ' sel' : ''}`);
    const ok = isRecipeLearned(r, learned);
    row.append(iconCell(r.iconCode), el('div', 'dc-row-text', mysRecipeLabel(r.id, r.level)), el('div', `dc-state${ok ? ' on' : ''}`, ok ? 'Đã học' : MYS_TEXT.UNLEARNED));
    row.onclick = () => {
      host.view.recipe = r.id;
      host.view.placed = null;
      host.actions.render();
    };
    box.appendChild(row);
  }
  return box;
}

function materials(host: MysteryUiHost, recipe: MysRecipeRow): HTMLElement {
  const box = el('div', 'ft-box my-mats');
  box.append(el('div', 'ft-h', `${mysRecipeLabel(recipe.id, recipe.level)} ${MYS_TEXT.RANDOM_STAR}`), el('div', 'dc-label', MYS_TEXT.PUT_MATS));
  const items = matStacks(host);
  const grid = el('div', 'my-mat-grid');
  recipe.mats.forEach((m, i) => {
    const have = haveOf(m, items);
    const slot = el('div', `my-mat${have < m.n ? ' short' : ''}`);
    const placed = host.view.placed?.slots[String(i + 1)] !== undefined;
    slot.append(iconCell(m.ic ?? '', m.name), el('div', 'my-mat-name', m.name ?? `#${m.t}`), el('div', `my-mat-n${have < m.n ? ' dc-bad' : ' dc-ok'}`, `${have}/${m.n}${placed ? ' ✓' : ''}`));
    grid.appendChild(slot);
  });
  box.appendChild(grid);
  return box;
}

function controls(host: MysteryUiHost, recipe: MysRecipeRow | undefined): HTMLElement {
  const row = el('div', 'dc-controls');
  const { skiLvl } = host.makeData();
  const learned = recipe ? isRecipeLearned(recipe, host.makeData().learnedRec) : false;
  const auto = button(MYS_TEXT.AUTO_MATS, () => {
    if (!recipe) return;
    host.view.placed = autoPlace(recipe, matStacks(host));
    host.actions.render();
  }, !recipe);
  const make = button(MYS_TEXT.MAKE, () => recipe && host.actions.make(recipe, host.view.placed), !recipe || !learned || recipe.level > skiLvl || host.limit() <= 0);
  const buy = button(MYS_TEXT.BUY, () => host.actions.buy());
  row.append(auto, make, el('span', 'dc-label', `${MYS_TEXT.LEFT}${host.limit()}`), buy);
  return row;
}

export function renderCraft(body: HTMLElement, host: MysteryUiHost): void {
  const recipe = host.catalog()!.recipes.find((r) => r.id === host.view.recipe);
  const right = el('div', 'my-craft-right');
  right.append(recipe ? materials(host, recipe) : el('div', 'ft-muted', MYS_TEXT.PICK_RECIPE), controls(host, recipe));
  const split = el('div', 'dc-split');
  split.append(recipeList(host), right);
  body.append(levelTabs(host), split);
}
