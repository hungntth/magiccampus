// "Dung Hợp" tab of the Luyện pet window: petJoin(main, 4 subs) and, in "Cao cấp" mode, seniorPetJoin([main, ...subs]) with
// 4..10 (blue) / 4..16 (purple) subs and Nội Đơn Tinh Linh 3014. Rates: PET_JOIN_SUCCESS / seniorJoinRate from @mc/shared.

import {
  PET_JOIN_MATERIALS, PET_JOIN_SUCCESS, SENIOR_JOIN_ITEM, SENIOR_JOIN_MAX_SUBS, SENIOR_JOIN_MIN_SUBS, seniorJoinItemCost, seniorJoinRate,
  type PetView,
} from '@mc/shared';
import { el } from '../petPanelTabs';
import { toast } from '../screens';
import { itemsByTid, joinCandidates, petColor, stackTotal } from './petFuncRules';
import { FUNC_TEXT, GUIDE } from './petFuncText';
import type { PetFuncTab } from './petFuncTypes';
import { itemSeatEl, petSeatEl } from './seats';
import { Runner, button, buildFrame, lines, showResult, type Tone } from './tabKit';

export const joinTab: PetFuncTab = {
  id: 'join',
  label: 'Dung Hợp',
  build(host, body) {
    const f = buildFrame(body, GUIDE.join);
    const run = new Runner();
    let mainId: number | null = host.initialPet()?.id ?? null;
    let subs: number[] = [];
    let senior = false;
    let tinhLinh: number | null = null;

    const follow = (): number => host.player().showPetId;
    const maxSubs = (main: PetView | undefined): number => (senior ? (main ? SENIOR_JOIN_MAX_SUBS[petColor(main)] ?? 0 : 0) : PET_JOIN_MATERIALS);
    const seatCount = (main: PetView | undefined): number => (senior ? Math.min(subs.length + 1, maxSubs(main) || 1) : PET_JOIN_MATERIALS);

    const draw = (): void => {
      const pets = host.pets();
      if (!pets.some((p) => p.id === mainId)) mainId = null;
      const main = pets.find((p) => p.id === mainId);
      // Drop subs that were consumed, or that no longer match the main pet.
      subs = subs.filter((id) => {
        const p = pets.find((x) => x.id === id);
        return !!main && !!p && p.id !== main.id && p.tid === main.tid && petColor(p) === petColor(main);
      });
      f.seats.replaceChildren(
        petSeatEl({
          body, label: 'Pet chính', pets, get: () => mainId, candidates: () => pets,
          set: (id) => { mainId = id; subs = []; f.result.replaceChildren(); }, changed: draw,
        }),
        ...Array.from({ length: seatCount(main) }, (_v, i) => petSeatEl({
          body, label: `Pet phụ ${i + 1}`, pets, get: () => subs[i] ?? null,
          candidates: () => (main ? joinCandidates(main, pets, subs.filter((_s, j) => j !== i), follow()) : []),
          set: (id) => {
            if (id === null) subs.splice(i, 1);
            else subs[Math.min(i, subs.length)] = id;
          },
          changed: draw,
        })),
      );
      if (senior) {
        const stacks = itemsByTid(host.items(), SENIOR_JOIN_ITEM);
        f.seats.appendChild(itemSeatEl({
          body, label: 'Nội Đơn Tinh Linh', stacks, need: main ? seniorJoinItemCost(petColor(main), subs.length) : 1,
          get: () => tinhLinh, set: (id) => { tinhLinh = id; }, auto: true, changed: draw,
        }));
      }
      lines(f.info, info(main));
      const color = main ? petColor(main) : -1;
      const colorOk = senior ? color === 2 || color === 3 : color >= 0 && color < PET_JOIN_SUCCESS.length;
      const enough = senior ? subs.length >= SENIOR_JOIN_MIN_SUBS && subs.length <= maxSubs(main) : subs.length === PET_JOIN_MATERIALS;
      const items = senior && main ? stackTotal(itemsByTid(host.items(), SENIOR_JOIN_ITEM)) >= seniorJoinItemCost(color, subs.length) : true;
      const mode = button(senior ? 'Dung hợp thường' : 'Cao cấp', () => {
        senior = !senior;
        subs = [];
        draw();
      }, !run.pending, false);
      const buttons = [button(senior ? 'Dung hợp cao cấp' : 'Dung hợp', () => void join(), !!main && colorOk && enough && items && !run.pending), mode];
      if (senior) {
        buttons.push(button('Tự chọn đủ', () => {
          if (!main) return;
          const pool = joinCandidates(main, pets, [], follow());
          subs = pool.slice(0, maxSubs(main)).map((p) => p.id);
          draw();
        }, !!main && !run.pending, false), button('Bỏ hết', () => { subs = []; draw(); }, subs.length > 0, false));
      }
      f.buttons.replaceChildren(...buttons);
    };

    function info(main: PetView | undefined): (string | [string, Tone])[] {
      if (!main) return [FUNC_TEXT.needMain];
      const color = petColor(main);
      const out: (string | [string, Tone])[] = [];
      if (senior) {
        const cap = SENIOR_JOIN_MAX_SUBS[color];
        if (!cap) return [['Dung hợp cao cấp chỉ dùng cho pet chính màu lam hoặc tím.', 'warn']];
        out.push(`${FUNC_TEXT.joinRate}${seniorJoinRate(color, subs.length)}% (${subs.length}/${cap} pet phụ, tối thiểu ${SENIOR_JOIN_MIN_SUBS}); cần ${seniorJoinItemCost(color, subs.length)} Nội Đơn Tinh Linh.`);
      } else if (color >= PET_JOIN_SUCCESS.length) return [[FUNC_TEXT.joinLimit, 'warn']];
      else out.push(`${FUNC_TEXT.joinRate}${PET_JOIN_SUCCESS[color]}%`);
      const pets = host.pets();
      if (main.binded || subs.some((id) => pets.find((p) => p.id === id)?.binded)) out.push([FUNC_TEXT.bound, 'warn']);
      return out;
    }

    async function join(): Promise<void> {
      const main = host.pets().find((p) => p.id === mainId);
      if (!main) return void toast(FUNC_TEXT.needMain);
      await run.run(async () => {
        const r = await host.actions.join(main.id, [...subs], senior);
        if (!r) return;
        subs = [];
        showResult(f, 'Kết quả dung hợp:', [el('div', `pf-line ${r.flag ? 'ok' : 'bad'}`, r.flag ? `${FUNC_TEXT.joinOk} Hệ số phẩm chất: ${r.grow ?? ''}` : FUNC_TEXT.joinFail)]);
      }, draw);
    }

    draw();
    return { refresh: draw, dispose: () => f.root.remove() };
  },
};
