// "Cường Hóa" tab of the Luyện pet window: petStar(pet, nội đơn, safe Chúc Phúc | null) and petStarClear(pet, Phụng Hoàng).
// Rate line = petStarRate(starNum) from @mc/shared; at 8+ stars without a Chúc Phúc the Flash confirm text is shown first.

import { PET_STAR_MAX, petStarRate, type PetGrowthReply } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { el } from '../petPanelTabs';
import { toast } from '../screens';
import { TRAIN_PROP, itemsByProp } from './petFuncRules';
import { FUNC_TEXT, GUIDE } from './petFuncText';
import type { PetFuncTab } from './petFuncTypes';
import { itemSeatEl, petSeatEl } from './seats';
import { Runner, button, buildFrame, lines, showResult } from './tabKit';

const SAFE_FROM_STAR = 8;

export const starTab: PetFuncTab = {
  id: 'star',
  label: 'Cường Hóa',
  build(host, body) {
    const f = buildFrame(body, GUIDE.star);
    const run = new Runner();
    let petId: number | null = host.initialPet()?.id ?? null;
    let starId: number | null = null;
    let safeId: number | null = null;
    let clearId: number | null = null;

    const draw = (): void => {
      if (!host.pets().some((p) => p.id === petId)) petId = null;
      const pet = host.pets().find((p) => p.id === petId);
      const stars = pet?.starNum ?? 0;
      const star = itemsByProp(host.items(), TRAIN_PROP.star);
      f.seats.replaceChildren(
        petSeatEl({ body, label: 'Đặt pet vào', pets: host.pets(), get: () => petId, set: (id) => { petId = id; f.result.replaceChildren(); }, candidates: () => host.pets(), changed: draw }),
        itemSeatEl({ body, label: 'Nội Đơn', stacks: star, get: () => starId, set: (id) => { starId = id; }, auto: true, changed: draw }),
        itemSeatEl({ body, label: 'Chúc Phúc', stacks: itemsByProp(host.items(), TRAIN_PROP.safe), get: () => safeId, set: (id) => { safeId = id; }, changed: draw }),
        itemSeatEl({ body, label: 'Phụng Hoàng', stacks: itemsByProp(host.items(), TRAIN_PROP.clear), get: () => clearId, set: (id) => { clearId = id; }, auto: true, changed: draw }),
      );
      const item = star.find((i) => i.id === starId);
      const add = item?.tplPropNum ? ` Hệ số phẩm chất +${item.tplPropNum / 100} mỗi sao.` : '';
      lines(f.info, pet
        ? [stars >= PET_STAR_MAX ? FUNC_TEXT.starMax(stars) : `${FUNC_TEXT.starRate(stars, petStarRate(stars))}${add}`,
          ...(stars >= SAFE_FROM_STAR && safeId === null ? [['Từ 8 sao: thất bại sẽ về 0 sao nếu không đặt Chúc Phúc.', 'warn'] as [string, 'warn']] : [])]
        : [FUNC_TEXT.needPetItem]);
      const busy = run.pending;
      f.buttons.replaceChildren(
        button('Cường hóa', () => star_(), !!pet && !!item && stars < PET_STAR_MAX && !busy),
        button('Tẩy sao', () => clear_(), !!pet && stars > 0 && clearId !== null && !busy, false),
      );
    };

    const show = (r: PetGrowthReply, ok: string, fail: string): void => {
      const rows = [el('div', `pf-line ${r.flag ? 'ok' : 'bad'}`, r.flag ? ok : fail),
        el('div', 'pf-line', `Số sao: ${r.starNum ?? 0}   Hệ số cường hóa: +${r.growRateAdd ?? 0}`)];
      showResult(f, 'Kết quả cường hóa:', rows);
    };

    function star_(): void {
      const pet = host.pets().find((p) => p.id === petId);
      if (!pet || starId === null) return void toast(FUNC_TEXT.needPetItem);
      const go = (): void => void run.run(async () => {
        const r = await host.actions.star(pet.id, starId!, safeId);
        if (r) show(r, FUNC_TEXT.starOk(r.starNum ?? 0), FUNC_TEXT.starFail);
      }, draw);
      if ((pet.starNum ?? 0) >= SAFE_FROM_STAR && safeId === null) askConfirm(FUNC_TEXT.starConfirm, go);
      else go();
    }

    function clear_(): void {
      const pet = host.pets().find((p) => p.id === petId);
      if (!pet || clearId === null) return void toast(FUNC_TEXT.needPetItem);
      void run.run(async () => {
        const r = await host.actions.starClear(pet.id, clearId!);
        if (r) show({ ...r, flag: true }, 'Đã xóa toàn bộ sao, pet về 0 sao.', '');
      }, draw);
    }

    draw();
    return { refresh: draw, dispose: () => f.root.remove() };
  },
};
