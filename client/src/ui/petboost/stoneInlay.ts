// Khảm tab: pick a pet gear item (kind 9) from the bag, the pet item page or a pet's worn slots, then fill its six holes. Hole 1 takes
// only a Tụ Linh Thạch, holes 2..6 only regular stones, one stone per property. getPetStoneByEid reads the holes; petStoneSet /
// removePetStone change them (inlaid stones give no stats in H5, so the window only stores and shows them).

import { PET_STONE_ENERGY_HOLE, PET_STONE_HOLES, petStoneDef, type PetStoneHoleWire } from '@mc/shared';
import { NAME_COLORS } from '../itemCell';
import { el } from '../petPanelTabs';
import { openPicker, type PickOption } from '../petfunc/seats';
import { Runner, buildFrame, lines } from '../petfunc/tabKit';
import { iconCell } from './boostFrame';
import { STONE_TEXT as T } from './boostText';
import { stonePickOption } from './stoneKit';
import { holeMap, inlayCandidates, skillName, stoneTitle } from './stoneRules';
import type { StoneTab } from './stoneTypes';

export const inlayTab: StoneTab = {
  id: 'inlay',
  label: T.tabs[2],
  build(host, body) {
    const f = buildFrame(body, T.guides[2]);
    const run = new Runner();
    let itemId: number | null = null;
    let wire: PetStoneHoleWire = {};

    const pull = async (): Promise<void> => {
      wire = itemId === null ? {} : (await host.actions.holes(itemId)) ?? {};
    };
    const select = (id: number): void => {
      itemId = id;
      void run.run(pull, draw);
    };

    const holeCell = (hole: number, itemRef: number): HTMLElement => {
      const cur = wire[String(hole)];
      const def = cur ? petStoneDef(cur[0]) : undefined;
      const box = el('div', `pb-hole${hole === PET_STONE_ENERGY_HOLE ? ' energy' : ''}`);
      const icon = iconCell('pf-seat', def ? def.icon : null);
      if (def) icon.style.borderColor = NAME_COLORS[def.level] ?? '';
      icon.title = cur ? stoneTitle({ sid: -1, tid: cur[0], num: 1, skillId: cur[2] }) : '';
      box.append(icon, el('div', 'pb-hole-name', def ? def.name : hole === PET_STONE_ENERGY_HOLE ? T.holeEnergy : `${T.hole} ${hole}`));
      if (cur && cur[2] > 0) box.appendChild(el('div', 'pb-hole-name', skillName(cur[2])));
      box.onclick = () => {
        if (run.pending) return;
        const options: PickOption[] = cur
          ? [{ label: `${T.inlayRemove} ${def?.name ?? ''}`.trim(), iconCode: def?.icon, onPick: () => void run.run(async () => { await host.actions.remove(itemRef, hole); await pull(); }, draw) }]
          : inlayCandidates(host.entries(), hole, holeMap(wire)).map((e) => stonePickOption(e, () => void run.run(async () => { await host.actions.set(itemRef, hole, e.sid); await pull(); }, draw)));
        openPicker(body, icon, options, hole === PET_STONE_ENERGY_HOLE ? T.inlayEnergyOnly : T.inlayNoStone);
      };
      return box;
    };

    const draw = (): void => {
      const gear = host.gear();
      if (itemId !== null && !gear.some((g) => g.item.id === itemId)) {
        itemId = null;
        wire = {};
      }
      const list = el('div', 'pb-list');
      for (const g of gear) {
        const row = el('div', `pf-skill${g.item.id === itemId ? ' sel' : ''}`);
        row.append(el('span', 'pf-skill-name', g.owner ? `${g.item.name} (${g.owner})` : g.item.name));
        if (g.item.color) row.style.color = NAME_COLORS[g.item.color] ?? '';
        row.onclick = () => select(g.item.id);
        list.appendChild(row);
      }
      if (gear.length === 0) list.appendChild(el('div', 'pf-picker-empty', T.noGear));
      const main = el('div', 'pb-inlay-main');
      const holes = el('div', 'pb-holes');
      if (itemId !== null) for (let h = 1; h <= PET_STONE_HOLES; h++) holes.appendChild(holeCell(h, itemId));
      const info = el('div', 'pf-info');
      lines(info, [itemId === null ? T.pickGear : `${gear.find((g) => g.item.id === itemId)?.item.name ?? ''}`]);
      main.append(info, holes);
      const wrap = el('div', 'pb-inlay');
      wrap.append(list, main);
      f.seats.replaceChildren(wrap);
      f.info.replaceChildren();
      f.buttons.replaceChildren();
    };

    draw();
    return { refresh: draw, dispose: () => f.root.remove() };
  },
};
