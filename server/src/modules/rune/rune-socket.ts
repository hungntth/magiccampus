// Pure socketing / up-level plans (Go application/rune/rune_actions.go, rune_upgrade.go). Everything is validated before any write: parity of the
// hole and the bag, rune kind, slot opened by the Hồn Khí level, empty hole, one rune per prop type per Hồn Khí and page, bag room on removal.

import { DECO_RUNE_SLOTS, DECO_SERVER_TEXT as T, RUNE_HOLE_MAX, RUNE_HOLE_MIN, decoRuneSlotOpen, runeBagOfKind, runeHoleBag, type RuneBag, type RuneBagType } from '@mc/shared';
import { refuse, validPosition, type HoleOf, type Refusal } from '../deco/deco-rules';
import { holeLevel, type DecoState } from '../deco/deco-state';
import type { DecoRuneDef } from '../gamedata/deco-data';
import { addRune, bagKey, takeOne, validBagType } from './rune-bag';

type RuneOf = (id: number) => DecoRuneDef | undefined;
export type Plan<T extends object> = ({ ok: true } & T) | Refusal;

const validHole = (h: number): boolean => Number.isInteger(h) && h >= RUNE_HOLE_MIN && h <= RUNE_HOLE_MAX;

function setSlot(deco: DecoState, position: number, slot: number, runeId: number): DecoState {
  const cur = deco.pos[String(position)];
  const r = [...cur.r];
  r[slot] = runeId;
  return { pos: { ...deco.pos, [String(position)]: { ...cur, r } } };
}

/** runeSet(bagPos, holePos, bagType, decoPosition): one rune from the bag into the hole. */
export function planSocket(
  bag: RuneBag, deco: DecoState, bagType: number, bagPos: number, holePos: number, decoPosition: number, runeOf: RuneOf, holeOf: HoleOf,
): Plan<{ bag: RuneBag; deco: DecoState }> {
  if (!validBagType(bagType) || !validHole(holePos) || !validPosition(decoPosition) || !Number.isInteger(bagPos)) return refuse(T.RUNE_BAD_ARGS);
  if (runeHoleBag(holePos) !== bagType) return refuse(T.RUNE_PARITY);
  const held = bag[bagKey(bagType)][String(bagPos)];
  if (!held) return refuse(T.RUNE_NOT_IN_BAG);
  const def = runeOf(held.r);
  if (!def) return refuse(T.RUNE_NO_DATA);
  if (runeBagOfKind(def.kind) !== bagType) return refuse(T.RUNE_KIND);
  const pos = deco.pos[String(decoPosition)];
  const slot = holePos - 1;
  if (!decoRuneSlotOpen(holeLevel(pos, holeOf), slot)) return refuse(T.RUNE_SLOT_LOCKED);
  if (pos.r[slot] > 0) return refuse(T.RUNE_HOLE_FILLED);
  for (let i = 0; i < DECO_RUNE_SLOTS; i++) {
    if (i !== slot && i % 2 === slot % 2 && pos.r[i] > 0 && runeOf(pos.r[i])?.propType === def.propType) return refuse(T.RUNE_SAME_TYPE);
  }
  const taken = takeOne(bag, bagType, bagPos);
  return taken ? { ok: true, bag: taken.bag, deco: setSlot(deco, decoPosition, slot, held.r) } : refuse(T.RUNE_NOT_IN_BAG);
}

/** runeRemove(holePos, bagPos, bagType, decoPosition): the rune goes back to the bag of its kind (at `bagPos` when possible); refused on a full bag. */
export function planUnsocket(
  bag: RuneBag, deco: DecoState, bagType: number, bagPos: number, holePos: number, decoPosition: number, runeOf: RuneOf,
): Plan<{ bag: RuneBag; deco: DecoState; runeId: number }> {
  if (!validBagType(bagType) || !validHole(holePos) || !validPosition(decoPosition) || !Number.isInteger(bagPos)) return refuse(T.RUNE_BAD_ARGS);
  const slot = holePos - 1;
  const runeId = deco.pos[String(decoPosition)].r[slot];
  if (runeId <= 0) return refuse(T.RUNE_HOLE_EMPTY);
  const target: RuneBagType = runeBagOfKind(runeOf(runeId)?.kind ?? 1);
  const next = addRune(bag, target, runeId, 1, target === bagType ? bagPos : -1);
  return next ? { ok: true, bag: next, deco: setSlot(deco, decoPosition, slot, 0), runeId } : refuse(T.RUNE_BAG_FULL);
}

/** runeUpLvl: the staged rune advances to `next_id` for `up_exp` rune exp. */
export function planUpLevel(bag: RuneBag, runeExp: number, runeOf: RuneOf): Plan<{ bag: RuneBag; cost: number }> {
  if (bag.upLvlHole <= 0) return refuse(T.RUNE_UP_EMPTY);
  const def = runeOf(bag.upLvlHole);
  if (!def) return refuse(T.RUNE_NO_DATA);
  if (def.nextId <= 0 || !runeOf(def.nextId)) return refuse(T.RUNE_UP_MAX);
  const cost = Math.max(0, def.upExp);
  if (runeExp < cost) return refuse(T.RUNE_UP_EXP);
  return { ok: true, bag: { ...bag, upLvlHole: def.nextId }, cost };
}
