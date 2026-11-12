// Tiểu Tinh Linh "Thiết lập" page (legacy FairySkillConfigCanvas): three rotation lists of five slots filled with the learned active
// skills (one family per list, U[103]), the list in use (Dùng) or Không dùng tất cả, and Lưu = fairySkillConfigChange. Slot N casts on
// rounds N, N + 5, ... before the owner acts (server FairySkillService.battleSkills).

import { FAIRY, FAIRY_TEXT, type FairyInfo, type FairySkillRow } from '@mc/shared';
import { button, el } from '../feature/dom';
import { toast } from '../screens';
import { hasDuplicateFamily, learnedSkills, skillOf } from './fairyConfig';
import { FAIRY_UI, type FairyUiHost } from './fairyTypes';

function radio(label: string, checked: boolean, onPick: () => void): HTMLElement {
  const wrap = el('label', 'fy-radio');
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'fy-cfg-select';
  input.checked = checked;
  input.onchange = onPick;
  wrap.append(input, el('span', '', label));
  return wrap;
}

export function renderConfigTab(host: FairyUiHost, f: FairyInfo, body: HTMLElement): void {
  const d = host.draft();
  const actives = learnedSkills(f).map(([, id]) => skillOf(id)).filter((r): r is FairySkillRow => r !== undefined && r.type === FAIRY.SKILL_ACTIVE);
  const family = (id: number): string | undefined => skillOf(id)?.codeName;
  if (actives.length === 0) body.appendChild(el('div', 'fy-warn', FAIRY_UI.NO_ACTIVE));
  for (let l = 0; l < FAIRY.CONFIG_LISTS; l++) {
    const box = el('div', `fy-box fy-cfg${d.select === l ? ' on' : ''}`);
    const head = el('div', 'fy-row');
    head.append(el('span', 'fy-title', FAIRY_UI.LIST(l)), radio(FAIRY_UI.USE_LIST, d.select === l, () => host.editDraft((x) => (x.select = l))));
    const slots = el('div', 'fy-cfg-slots');
    d.lists[l].forEach((cur, c) => {
      const cell = el('div', 'fy-cfg-slot');
      const sel = document.createElement('select');
      sel.title = `${FAIRY_UI.ORDER} ${c + 1}`;
      const none = document.createElement('option');
      none.value = '-1';
      none.textContent = '-';
      sel.appendChild(none);
      for (const r of actives) {
        const o = document.createElement('option');
        o.value = String(r.id);
        o.textContent = `${r.name} ${r.level}`;
        sel.appendChild(o);
      }
      // A stored id no longer learned (upgraded family) still shows.
      if (cur > 0 && !actives.some((r) => r.id === cur)) {
        const o = document.createElement('option');
        o.value = String(cur);
        o.textContent = skillOf(cur)?.name ?? `#${cur}`;
        sel.appendChild(o);
      }
      sel.value = String(cur > 0 ? cur : -1);
      sel.disabled = host.busy();
      sel.onchange = () => {
        const v = Number(sel.value);
        const next = d.lists[l].map((x, i) => (i === c ? v : x));
        if (hasDuplicateFamily(next, family)) {
          toast(FAIRY_TEXT.SAME_FAMILY, true);
          sel.value = String(cur > 0 ? cur : -1);
          return;
        }
        host.editDraft((x) => (x.lists[l][c] = v > 0 ? v : -1));
      };
      cell.append(el('span', 'fy-k', `${c + 1}`), sel);
      slots.appendChild(cell);
    });
    box.append(head, slots);
    body.appendChild(box);
  }
  const foot = el('div', 'fy-row');
  foot.append(
    radio(FAIRY_UI.NONE_ALL, d.select === -1, () => host.editDraft((x) => (x.select = -1))),
    button(FAIRY_UI.SAVE, () => host.saveDraft(), host.busy() || !host.draftDirty()),
  );
  if (host.draftDirty()) foot.appendChild(el('span', 'fy-warn', '*'));
  body.append(foot, el('div', 'fy-help pre', FAIRY_UI.CONFIG_HELP));
}
