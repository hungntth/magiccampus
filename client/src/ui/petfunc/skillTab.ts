// "Kỹ Năng" tab of the Luyện pet window: petUpSkill(pet, slot). Pick a learned skill row; the cost is the skill-up book of the
// pet's quality (1365 / 1366 / 1367): 1 for level 1 -> 2, 3 for level 2 -> 3 (max level 3).

import type { PetSkillKey, PetView } from '@mc/shared';
import { iconUrl } from '../../assets';
import { el } from '../petPanelTabs';
import { toast } from '../screens';
import { SKILL_MAX_LEVEL, itemsByTid, skillUpBook, skillUpNeed, stackTotal } from './petFuncRules';
import { FUNC_TEXT, GUIDE } from './petFuncText';
import type { PetFuncHost, PetFuncTab } from './petFuncTypes';
import { itemSeatEl, petSeatEl } from './seats';
import { Runner, button, buildFrame, lines, showResult } from './tabKit';

const SLOTS = Array.from({ length: 15 }, (_v, i) => i + 1);

export const skillTab: PetFuncTab = {
  id: 'skill',
  label: 'Kỹ Năng',
  build(host, body) {
    const f = buildFrame(body, GUIDE.skill);
    const run = new Runner();
    let petId: number | null = host.initialPet()?.id ?? null;
    let slot: number | null = null;
    let bookId: number | null = null;

    const learned = (pet: PetView): { slot: number; id: number }[] =>
      SLOTS.map((s) => ({ slot: s, id: pet[`skill${s}` as PetSkillKey] })).filter((s) => s.id > 0);

    const draw = (): void => {
      if (!host.pets().some((p) => p.id === petId)) petId = null;
      const pet = host.pets().find((p) => p.id === petId);
      const row = pet ? learned(pet).find((s) => s.slot === slot) : undefined;
      if (!row) slot = null;
      const info = row ? host.skillInfo(row.id) : undefined;
      const level = info?.level ?? 0;
      const book = pet ? skillUpBook(pet.qLevel) : 0;
      const need = skillUpNeed(level);
      const stacks = book ? itemsByTid(host.items(), book) : [];
      f.seats.replaceChildren(
        petSeatEl({ body, label: 'Đặt pet vào', pets: host.pets(), get: () => petId, set: (id) => { petId = id; slot = null; f.result.replaceChildren(); }, candidates: () => host.pets(), changed: draw }),
        itemSeatEl({ body, label: 'Sách Thăng Cấp', stacks, need, get: () => bookId, set: (id) => { bookId = id; }, auto: true, changed: draw }),
      );
      const maxed = level >= SKILL_MAX_LEVEL;
      lines(f.info, !pet ? [FUNC_TEXT.needPetItem]
        : !row ? ['Chọn một kỹ năng của pet để thăng cấp.']
          : maxed ? [['Kỹ năng này đã đạt cấp cao nhất!', 'warn']]
            : [`Thăng ${info?.name ?? 'kỹ năng'} lên cấp ${level + 1}: cần ${need} sách (có ${stackTotal(stacks)}).`]);
      if (pet) f.info.appendChild(skillList(host, pet, learned(pet), slot, (s) => { slot = s; draw(); }));
      const enough = stackTotal(stacks) >= need;
      f.buttons.replaceChildren(button('Thăng cấp', () => void upgrade(), !!pet && !!row && level > 0 && !maxed && enough && !run.pending));
    };

    async function upgrade(): Promise<void> {
      const pet = host.pets().find((p) => p.id === petId);
      if (!pet || slot === null) return void toast(FUNC_TEXT.needPetItem);
      const s = slot;
      await run.run(async () => {
        const ok = await host.actions.upSkill(pet.id, s);
        if (ok) showResult(f, 'Kết quả thăng cấp kỹ năng:', [el('div', 'pf-line ok', `Thăng cấp kỹ năng thành công (ô ${s}).`)]);
      }, draw);
    }

    draw();
    return { refresh: draw, dispose: () => f.root.remove() };
  },
};

function skillList(host: PetFuncHost, _pet: PetView, rows: { slot: number; id: number }[], selected: number | null, pick: (slot: number) => void): HTMLElement {
  const list = el('div', 'pf-skills');
  if (rows.length === 0) list.appendChild(el('div', 'pf-line', 'Pet chưa học kỹ năng nào.'));
  for (const r of rows) {
    const info = host.skillInfo(r.id);
    const item = el('div', `pf-skill${r.slot === selected ? ' sel' : ''}`);
    if (info?.iconCode) {
      const img = document.createElement('img');
      img.src = iconUrl(info.iconCode);
      img.alt = '';
      img.onerror = () => img.remove();
      item.appendChild(img);
    }
    item.append(el('span', 'pf-skill-name', info?.name ?? `#${r.id}`), el('span', 'pf-skill-lv', info?.level ? `Cấp ${info.level}` : ''));
    item.title = info?.info ?? '';
    item.onclick = () => pick(r.slot);
    list.appendChild(item);
  }
  return list;
}
