// Stone seal display + stats (Go statfeature/stoneseal_stats.go, client StoneSealPanel.refreshAddPropTxt). Per hole of each WORN equipment slot (sid
// = position 1..12): the stone gives its own jewel line (EQUIP_PROP flat), weakened to 0 when the equipment gem of the same hole has the same prop;
// a gem + stone pair of different props adds the "add" line (raw n, shown n / 10000), summed per prop and rounded after summing like the other features.
// The hidden Hoàn Mỹ gem +1 % HP of Go is not ported (H5 gear gems do not have it either).

import { STONE_SEAL, stoneSealAddLine, type StoneSealAdd, type StoneSealEquipView, type StoneSealItemInfo } from '@mc/shared';
import { addProp, BUFF_PROP, emptyBonuses, EQUIP_PROP, mergeBonuses, type Bonuses } from '../character/character-stats';
import { runeBonuses } from '../rune/rune-stats';
import { boredCount, slotOf, type StoneSealState } from './stoneseal-state';

/** A worn equipment piece of position 1..12 and the gem template of each hole (index 0 = hole 1, 0 = none). */
export interface WornPiece {
  sid: number;
  tid: number;
  name: string;
  icon: string;
  gems: readonly number[];
}

export type ItemInfoOf = (tid: number) => StoneSealItemInfo | undefined;

export interface HoleFacts {
  idx: number;
  stone?: StoneSealItemInfo;
  gem?: StoneSealItemInfo;
  weakened: boolean;
  add?: StoneSealAdd;
}

/** Facts of every stone-filled hole of one slot (shared by the view and the stat totals). */
export function holeFacts(state: StoneSealState, piece: WornPiece | undefined, itemOf: ItemInfoOf, sid: number): HoleFacts[] {
  const slot = slotOf(state, sid);
  const out: HoleFacts[] = [];
  for (let idx = 1; idx <= STONE_SEAL.HOLES; idx++) {
    const v = slot.holes[idx] ?? 0;
    const stone = v > 0 ? itemOf(v) : undefined;
    const gemTid = piece?.gems[idx - 1] ?? 0;
    const gem = gemTid > 0 ? itemOf(gemTid) : undefined;
    const weakened = !!stone && !!gem && stone.prop > 0 && stone.prop === gem.prop;
    const add = stone && gem ? stoneSealAddLine(gem.prop, stone.prop, gem.color, stone.color, slot.lvl) ?? undefined : undefined;
    out.push({ idx, ...(stone ? { stone } : {}), ...(gem ? { gem } : {}), weakened, ...(add ? { add } : {}) });
  }
  return out;
}

/** The 12 slot views of the panel. */
export function sealViews(state: StoneSealState, worn: ReadonlyMap<number, WornPiece>, itemOf: ItemInfoOf): StoneSealEquipView[] {
  const out: StoneSealEquipView[] = [];
  for (let sid = STONE_SEAL.MIN_EQUIP; sid <= STONE_SEAL.MAX_EQUIP; sid++) {
    const slot = slotOf(state, sid);
    const piece = worn.get(sid);
    const facts = holeFacts(state, piece, itemOf, sid);
    out.push({
      sid, equipTid: piece?.tid ?? 0, equipName: piece?.name ?? '', equipIcon: piece?.icon ?? '0', lvl: slot.lvl, bored: boredCount(slot),
      holes: facts.map((f) => ({
        idx: f.idx, open: slot.holes[f.idx] !== undefined,
        ...(f.stone ? { stone: f.stone } : {}), ...(f.gem ? { gem: f.gem } : {}), ...(f.weakened ? { weakened: true } : {}), ...(f.add ? { add: f.add } : {}),
      })),
    });
  }
  return out;
}

/** Stat bonuses of every worn slot's seal. */
export function sealBonuses(state: StoneSealState, worn: ReadonlyMap<number, WornPiece>, itemOf: ItemInfoOf): Bonuses {
  const b = emptyBonuses();
  const adds = new Map<number, number>();
  for (const [sid, piece] of worn) {
    for (const f of holeFacts(state, piece, itemOf, sid)) {
      if (f.stone && !f.weakened && f.stone.prop > 0) addProp(b, EQUIP_PROP, f.stone.prop, f.stone.num, false);
      if (f.add) adds.set(f.add.t, (adds.get(f.add.t) ?? 0) + f.add.n / 10000);
    }
  }
  return mergeBonuses(b, runeBonuses(adds, BUFF_PROP));
}
