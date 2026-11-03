// Unit tests for hit-mask click-to-move routing (route.ts) on small synthetic grids.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRoute, lineClear, type RoutePoint, type WalkGrid } from './route';

/** 400x400 open field; `blocked` rectangles [x0, y0, x1, y1] (inclusive) are walls. */
function grid(...blocked: [number, number, number, number][]): WalkGrid {
  return {
    isWalkable(x, y) {
      if (x < 0 || y < 0 || x >= 400 || y >= 400) return false;
      return !blocked.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
    },
  };
}

function assertRouteWalkable(g: WalkGrid, from: RoutePoint, route: RoutePoint[]): void {
  let prev = from;
  for (const p of route) {
    assert.ok(lineClear(g, prev, p), `leg ${prev} -> ${p} crosses a wall`);
    prev = p;
  }
}

test('clear line goes straight to the target', () => {
  assert.deepEqual(findRoute(grid(), 10, 10, 300, 200), [[300, 200]]);
});

test('wall between start and target is walked around', () => {
  // Vertical wall x 190..210, y 0..300: the only way is under it (y > 300).
  const g = grid([190, 0, 210, 300]);
  const route = findRoute(g, 100, 100, 300, 100);
  assert.ok(route.length > 1, 'expected waypoints around the wall');
  assert.deepEqual(route[route.length - 1], [300, 100]);
  assert.ok(route.some(([, y]) => y > 300), 'route should pass below the wall');
  assertRouteWalkable(g, [100, 100], route);
});

test('unreachable target falls back to walking straight until blocked', () => {
  // Target enclosed by a box: A* never reaches it.
  const g = grid([250, 50, 350, 60], [250, 140, 350, 150], [250, 50, 260, 150], [340, 50, 350, 150]);
  const route = findRoute(g, 50, 100, 300, 100);
  assert.equal(route.length, 1);
  assert.ok(route[0][0] < 250 && g.isWalkable(route[0][0], route[0][1]));
});

test('unwalkable target stops at the last walkable point on the line', () => {
  const g = grid([200, 0, 399, 399]);
  const route = findRoute(g, 50, 100, 300, 100);
  assert.equal(route.length, 1);
  assert.ok(route[0][0] < 200 && route[0][0] >= 180);
});

test('same point gives an empty route', () => {
  assert.deepEqual(findRoute(grid(), 10, 10, 10, 10), []);
});
