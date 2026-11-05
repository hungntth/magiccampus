// Skill target resolution (M10 E2.0), port of Go domain/combat target_resolver.go ResolveTargets / area patterns over the
// BattleGridCoords table (position.go) and SelectFrontlineTarget (damage.go). Slots are Go positions (enemies 0-9,
// player side 10-19). Pure; draws go through the injected RNG.

import type { Fighter, Rng } from '../battle.types';
import { rowOf } from '../damage';
import type { AreaKind, TargetKind } from './npc-skills';

const GRID: Readonly<Record<number, [number, number]>> = {
  0: [2, 0], 1: [3, 0], 2: [1, 0], 3: [4, 0], 4: [0, 0], 5: [2, 1], 6: [3, 1], 7: [1, 1], 8: [4, 1], 9: [0, 1],
  10: [2, 3], 11: [1, 3], 12: [3, 3], 13: [0, 3], 14: [4, 3], 15: [2, 2], 16: [1, 2], 17: [3, 2], 18: [0, 2], 19: [4, 2],
};
const GRID_W = 5;

export const gridOf = (slot: number): [number, number] => GRID[slot] ?? [slot % GRID_W, Math.floor(slot / GRID_W)];
const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

export function shuffle<T>(list: T[], rng: Rng): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

type Pred = (f: Fighter) => boolean;

const opposite = (a: Fighter): Pred => (f) => f.side !== a.side;
const same = (a: Fighter): Pred => (f) => f.side === a.side;

function predicateOf(a: Fighter, t: TargetKind): Pred {
  switch (t) {
    case 'enemyPlayer': return (f) => f.side !== a.side && f.kind === 'character';
    case 'enemyCreature': return (f) => f.side !== a.side && f.kind === 'creature';
    case 'enemyNoBoss': return (f) => f.side !== a.side && f.bossFlag === 0;
    case 'team': return same(a);
    case 'teamPlayer': return (f) => f.side === a.side && f.kind === 'character';
    case 'teamPet': return (f) => f.side === a.side && f.kind === 'pet';
    case 'player': return (f) => f.kind === 'character';
    default: return opposite(a);
  }
}

/** Go SelectFrontlineTarget: a random living front-row fighter of `side`, else any living one. */
export function frontlineTarget(fighters: Iterable<Fighter>, side: Fighter['side'], rng: Rng): Fighter | undefined {
  const living = [...fighters].filter((f) => f.alive && f.side === side);
  if (living.length === 0) return undefined;
  const front = living.filter((f) => rowOf(f.slot, side) === 0);
  return pick(front.length > 0 ? front : living, rng);
}

function atCoord(list: readonly Fighter[], x: number, y: number, ok: Pred, exclude: number): Fighter | undefined {
  return list.find((f) => f.slot !== exclude && ok(f) && gridOf(f.slot)[0] === x && gridOf(f.slot)[1] === y);
}

const verticalNeighbourY = (y: number): number => (y === 0 || y === 2 ? y + 1 : y - 1);

/** Go areaPatternTargets + capAndFilterAreaTargets (living members only fill the count). */
function areaTargets(list: readonly Fighter[], center: Fighter, ok: Pred, area: AreaKind, size: number, rng: Rng): Fighter[] {
  const live: Pred = (f) => f.alive && ok(f);
  const [x, y] = gridOf(center.slot);
  const out: (Fighter | undefined)[] = [];
  switch (area) {
    case 'V':
      out.push(atCoord(list, x, verticalNeighbourY(y), live, center.slot), center);
      break;
    case 'H':
      out.push(center);
      for (let d = 1; d < GRID_W; d++) out.push(atCoord(list, x - d, y, live, center.slot), atCoord(list, x + d, y, live, center.slot));
      break;
    case 'C':
      out.push(atCoord(list, x, verticalNeighbourY(y), live, center.slot), atCoord(list, x - 1, y, live, center.slot),
        atCoord(list, x + 1, y, live, center.slot), center);
      break;
    case 'R':
      out.push(center, ...shuffle(list.filter((f) => f.slot !== center.slot && live(f)), rng));
      break;
    case 'M':
      out.push(center, ...list.filter((f) => f.slot !== center.slot && live(f))
        .sort((a, b) => Math.abs(a.slot - center.slot) - Math.abs(b.slot - center.slot) || a.slot - b.slot));
      break;
    default:
      out.push(center);
  }
  const present = out.filter((f): f is Fighter => f !== undefined);
  return present.slice(0, Math.max(1, Math.min(size, present.length))).filter((f) => f.alive);
}

/**
 * Go ResolveTargets for the kinds data can produce: self kinds return the caster (or its owner / pet), single kinds take
 * the selected slot when it matches, else a random matching one, then spread over the area pattern.
 */
export function resolveTargets(
  fighters: ReadonlyMap<number, Fighter>, a: Fighter, selected: number, t: TargetKind, area: AreaKind, size: number, rng: Rng,
): Fighter[] {
  const list = [...fighters.values()];
  if (t === 'self') return [a];
  if (t === 'selfPlayer') {
    if (a.kind !== 'pet') return [a];
    const owner = list.find((f) => f.kind === 'character' && f.side === a.side && f.refId === a.ownerCid && f.alive);
    return owner ? [owner] : [];
  }
  if (t === 'selfPet') {
    const pet = a.kind === 'pet' ? a : list.find((f) => f.kind === 'pet' && f.side === a.side && f.ownerCid === a.refId && f.alive);
    return pet ? [pet] : [];
  }
  let ok = predicateOf(a, t);
  let center = fighters.get(selected);
  if (t === 'any' && center?.alive) {
    const side = center.side;
    ok = (f) => f.side === side;
  } else if (!center || !center.alive || !ok(center)) {
    const candidates = list.filter((f) => f.alive && ok(f));
    if (candidates.length === 0) return [];
    // Go nearestMatchingTargetByPosition: a dead pick moves to the lowest matching position, else a random match.
    center = center && !center.alive ? [...candidates].sort((x, y) => x.slot - y.slot)[0] : pick(candidates, rng);
  }
  if (area === '') return [center];
  return areaTargets(list, center, ok, area, size, rng);
}
