// Năng Lượng Tự Nhiên window: main tab (formulas, collected stars, candidates, pick / refresh, record feed) and the help tab.

import { ASTRO, ASTRO_TEXT, type AstrologicData } from '@mc/shared';
import { FeatureWindow } from '../feature/featureWindow';
import { button, el, fmt } from '../feature/dom';
import { elementName, formulaRows, pickLabel, recordLines, refreshLabel } from './astrologyRules';
import './astrology.css';

export interface AstrologyUiHost {
  data(): AstrologicData | null;
  selected(): number;
  result(): string;
  npPnt(): number;
  gold(): number;
  busy(): boolean;
  select(sid: number): void;
  pick(): void;
  refresh(): void;
  look(fid: number): void;
}

function formulaSection(d: AstrologicData, host: AstrologyUiHost): HTMLElement {
  const box = el('div', 'as-box');
  box.appendChild(el('div', 'as-title', ASTRO_TEXT.TODAY));
  for (const r of formulaRows(d)) {
    const row = el('div', 'as-formula');
    row.appendChild(el('span', 'as-no', r.label));
    row.appendChild(el('span', `as-tokens${r.hidden ? ' hidden' : ''}`, `${r.tokens.join(' + ')} =`));
    row.appendChild(el('span', 'as-award', r.award));
    if (r.hidden) row.appendChild(button(ASTRO_TEXT.LOOK, () => host.look(r.fid), host.busy()));
    box.appendChild(row);
  }
  box.appendChild(el('div', 'ft-muted', ASTRO_TEXT.FIRST_BONUS));
  return box;
}

function starsSection(d: AstrologicData, host: AstrologyUiHost): HTMLElement {
  const box = el('div', 'as-box');
  const now = el('div', 'as-stars');
  for (let i = 0; i < ASTRO.COLLECT_KEEP; i++) {
    const sid = d.starsNow[i];
    now.appendChild(el('span', `as-star${sid ? ' lit' : ''}`, sid ? elementName(sid) : ''));
  }
  box.append(now, el('div', 'ft-muted', ASTRO_TEXT.KEEP_NOTE));
  const cands = el('div', 'as-stars');
  d.starsToPick.forEach((sid) => {
    const b = el('button', `as-star cand${host.selected() === sid ? ' sel' : ''}`, elementName(sid));
    b.onclick = () => host.select(sid);
    cands.appendChild(b);
  });
  box.append(cands, el('div', 'ft-muted', host.selected() > 0 ? elementName(host.selected()) : ASTRO_TEXT.CHOOSE));
  return box;
}

function actionsSection(d: AstrologicData, host: AstrologyUiHost): HTMLElement {
  const box = el('div', 'as-box');
  const pick = el('div', 'as-action');
  pick.append(button(ASTRO_TEXT.PICK, () => host.pick(), host.busy() || host.selected() <= 0), el('span', '', pickLabel(d)));
  const refresh = el('div', 'as-action');
  refresh.append(button(ASTRO_TEXT.REFRESH, () => host.refresh(), host.busy()), el('span', '', refreshLabel(d)));
  box.append(pick, refresh);
  const res = host.result();
  if (res) box.appendChild(el('div', 'as-result', res));
  box.appendChild(el('div', 'ft-muted', `${ASTRO_TEXT.TITLE}: ${fmt(host.npPnt())}   Vàng: ${fmt(host.gold())}`));
  return box;
}

function recordSection(d: AstrologicData): HTMLElement {
  const box = el('div', 'as-box as-records');
  box.appendChild(el('div', 'as-title', ASTRO_TEXT.RECORD));
  const lines = recordLines(d.award_record);
  if (lines.length === 0) box.appendChild(el('div', 'ft-muted', '-'));
  for (const line of lines) box.appendChild(el('div', 'as-record', line));
  return box;
}

export function createAstrologyWindow(host: () => AstrologyUiHost, onClose: () => void): FeatureWindow {
  return new FeatureWindow(
    {
      renderTab: (tab, body) => {
        if (tab === 1) {
          body.appendChild(el('div', 'as-help', ASTRO_TEXT.HELP_BODY));
          return;
        }
        const h = host();
        const d = h.data();
        if (!d) return;
        const left = el('div', 'as-col');
        left.append(formulaSection(d, h), recordSection(d));
        const right = el('div', 'as-col');
        right.append(starsSection(d, h), actionsSection(d, h));
        const cols = el('div', 'as-cols');
        cols.append(left, right);
        body.appendChild(cols);
      },
      onTab: () => undefined,
      onClose,
    },
    { title: ASTRO_TEXT.TITLE, tabs: ['Năng Lượng', ASTRO_TEXT.HELP], cls: 'astro-window' },
  );
}
