// Click-to-move routing over the map hit mask, ported from the Flash client: ObjectMove.getRoute,
// SingleAstarRoute (A* on a 20 px lattice, 8 directions, no corner cutting, 8000-node cap) and
// RouteKeyPointGenerator (recursive split at the farthest node until each leg has line of sight).

export interface WalkGrid {
  isWalkable(x: number, y: number): boolean;
}

export type RoutePoint = [number, number];

const STEP = 20;
const COST_STRAIGHT = 10;
const COST_DIAGONAL = 14;
const MAX_TRY = 8000;
// Legacy sampled every 10 px; a finer step keeps legs from slipping through thin walls.
const SIGHT_STEP = 4;
const DIRECT_STEP = 10;

/**
 * Waypoints from (fx, fy) to (tx, ty), start excluded. A clear straight line gives [[tx, ty]]; otherwise the
 * A* path reduced to key points. When no path is found within the node cap, walks straight until blocked.
 */
export function findRoute(
  grid: WalkGrid,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  maxTry = MAX_TRY,
): RoutePoint[] {
  const from: RoutePoint = [Math.round(fx), Math.round(fy)];
  const to: RoutePoint = [Math.round(tx), Math.round(ty)];
  if (from[0] === to[0] && from[1] === to[1]) return [];
  if (!grid.isWalkable(from[0], from[1])) {
    // Standing off the mask (spawn/teleport edge): legacy nudged up to 20 px toward the target; we let the
    // player walk straight out instead of locking them in place.
    return [to];
  }
  if (!grid.isWalkable(to[0], to[1])) return directRoute(grid, from, to);
  if (lineClear(grid, from, to)) return [to];
  const path = astar(grid, from, to, maxTry);
  if (!path) return directRoute(grid, from, to);
  path.push(to);
  const keys = keyPoints(grid, from, to, path.slice(1));
  return dedupe(keys).slice(1);
}

/** True when every sample along a→b is walkable. */
export function lineClear(grid: WalkGrid, a: RoutePoint, b: RoutePoint): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  for (let i = SIGHT_STEP; i < len; i += SIGHT_STEP) {
    if (!grid.isWalkable(Math.round(a[0] + (i * dx) / len), Math.round(a[1] + (i * dy) / len))) return false;
  }
  return true;
}

/** ObjectMove.getDirectRoute: straight toward the target, stopping at the last walkable sample. */
function directRoute(grid: WalkGrid, from: RoutePoint, to: RoutePoint): RoutePoint[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  let last: RoutePoint = from;
  for (let i = DIRECT_STEP; i <= len; i += DIRECT_STEP) {
    const p: RoutePoint = [Math.round(from[0] + (i * dx) / len), Math.round(from[1] + (i * dy) / len)];
    if (!grid.isWalkable(p[0], p[1])) break;
    last = p;
  }
  return last === from ? [] : [last];
}

/** Lattice nodes from `from` to the first node within STEP of `to`, or null past MAX_TRY expansions. */
function astar(grid: WalkGrid, from: RoutePoint, to: RoutePoint, maxTry: number): RoutePoint[] | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const g: number[] = [];
  const f: number[] = [];
  const parent: number[] = [];
  const closed: boolean[] = [];
  const index = new Map<string, number>();
  const heap: number[] = [];

  const push = (id: number): void => {
    heap.push(id);
    siftUp(heap, f, heap.length - 1);
  };
  const open = (x: number, y: number, cost: number, par: number): void => {
    const id = xs.length;
    xs.push(x);
    ys.push(y);
    g.push(cost);
    f.push(cost + (Math.abs(to[0] - x) + Math.abs(to[1] - y)) * COST_STRAIGHT);
    parent.push(par);
    closed.push(false);
    index.set(`${x},${y}`, id);
    push(id);
  };

  open(from[0], from[1], 0, -1);
  let tries = 0;
  while (heap.length > 0) {
    if (++tries > maxTry) return null;
    const cur = popMin(heap, f);
    if (closed[cur]) continue;
    closed[cur] = true;
    const cx = xs[cur];
    const cy = ys[cur];
    if (Math.abs(cx - to[0]) < STEP && Math.abs(cy - to[1]) < STEP && lineClear(grid, [cx, cy], to)) {
      const out: RoutePoint[] = [];
      for (let id = cur; id >= 0; id = parent[id]) out.unshift([xs[id], ys[id]]);
      return out;
    }
    for (const [nx, ny, diagonal] of neighbours(grid, cx, cy)) {
      const cost = g[cur] + (diagonal ? COST_DIAGONAL : COST_STRAIGHT);
      const id = index.get(`${nx},${ny}`);
      if (id === undefined) {
        open(nx, ny, cost, cur);
      } else if (!closed[id] && cost < g[id]) {
        // Lazy decrease-key: push a fresh heap entry; the stale one is skipped once closed.
        f[id] += cost - g[id];
        g[id] = cost;
        parent[id] = cur;
        push(id);
      }
    }
  }
  return null;
}

/**
 * SingleAstarRoute.getArounds: 4 straight moves, diagonals only when both adjacent straights are open. Unlike the
 * legacy point test, the edge itself must be clear too, so a 20 px hop cannot skip over a thin wall.
 */
function neighbours(grid: WalkGrid, x: number, y: number): [number, number, boolean][] {
  const ok = (nx: number, ny: number): boolean => grid.isWalkable(nx, ny) && lineClear(grid, [x, y], [nx, ny]);
  const e = ok(x + STEP, y);
  const s = ok(x, y + STEP);
  const w = ok(x - STEP, y);
  const n = ok(x, y - STEP);
  const out: [number, number, boolean][] = [];
  if (e) out.push([x + STEP, y, false]);
  if (s) out.push([x, y + STEP, false]);
  if (w) out.push([x - STEP, y, false]);
  if (n) out.push([x, y - STEP, false]);
  if (e && s && ok(x + STEP, y + STEP)) out.push([x + STEP, y + STEP, true]);
  if (w && s && ok(x - STEP, y + STEP)) out.push([x - STEP, y + STEP, true]);
  if (w && n && ok(x - STEP, y - STEP)) out.push([x - STEP, y - STEP, true]);
  if (e && n && ok(x + STEP, y - STEP)) out.push([x + STEP, y - STEP, true]);
  return out;
}

/** RouteKeyPointGenerator.generateKeyPoints: a..b when clear, else split at the path node farthest from a-b. */
function keyPoints(grid: WalkGrid, a: RoutePoint, b: RoutePoint, path: RoutePoint[]): RoutePoint[] {
  if (path.length === 0 || lineClear(grid, a, b)) return [a, b];
  const ldx = b[1] - a[1];
  const ldy = a[0] - b[0];
  const c = b[0] * a[1] - a[0] * b[1];
  const norm = Math.hypot(ldx, ldy) || 1;
  let best = 0;
  let split = -1;
  for (let i = 0; i < path.length; i++) {
    const d = Math.abs(ldx * path[i][0] + ldy * path[i][1] + c) / norm;
    if (d > best) {
      best = d;
      split = i;
    }
  }
  if (split < 0) return [a, b];
  const p = path[split];
  return [...keyPoints(grid, a, p, path.slice(0, split)), ...keyPoints(grid, p, b, path.slice(split + 1))];
}

function dedupe(points: RoutePoint[]): RoutePoint[] {
  return points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
}

function siftUp(heap: number[], f: number[], i: number): void {
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (f[heap[p]] <= f[heap[i]]) return;
    [heap[p], heap[i]] = [heap[i], heap[p]];
    i = p;
  }
}

function popMin(heap: number[], f: number[]): number {
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
      if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]];
      i = m;
    }
  }
  return top;
}
