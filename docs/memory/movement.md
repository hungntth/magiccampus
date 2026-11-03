# Movement (click-to-move routing)

Client-side walking over the map hit mask. Port of the Flash `logic/ObjectMove.as` getRoute,
`utils/SingleAstarRoute.as` and `utils/RouteKeyPointGenerator.as`.

## Files
- `client/src/game/route.ts` (+ `route.test.ts`): `findRoute(grid, fx, fy, tx, ty)` → waypoints, start excluded.
- `client/src/game/GameScene.ts`: `walkTo(self, x, y, onArrive?)` used by ground tap, gate tap and NPC walk-to;
  sends `udcr` with the full route, then the end point on arrival.
- `client/src/game/HitMask.ts`: `isWalkable`, `nearestWalkable` (target snapping before routing).

## Rules
- Clear straight line → `[[tx, ty]]`. Otherwise A* on a 20 px lattice from the start point, 8 directions,
  costs 10/14, Manhattan×10 heuristic, diagonals only when both straights are open, cap 8000 expansions
  (legacy values). Goal = first node within 20 px of the target with line of sight to it.
- Path reduced to key points: split at the node farthest from the a→b line until every leg is clear.
- No path (cap or disconnected island) / unwalkable target → walk straight, stop at the last walkable 10 px sample.
- Start off the mask → straight to the target (legacy nudged ≤ 20 px, else refused; we avoid locking the player).

## Differences from legacy (deliberate)
- Edges between lattice nodes and key-point legs are sampled every 4 px (legacy: nodes only / 10 px), so routes
  cannot hop over thin walls. Map 9 bench (100 random pairs): 85 straight lines blocked, 0 legs through walls,
  ~6 ms avg, ~40 ms worst; 26 targets unreachable at any cap (isolated walkable islands in MAP_HIT_NEW).

## Notes
- Client has no `test` script (no `tsx` dev dependency); run the test from `server/`:
  `node --test --import tsx ../client/src/game/route.test.ts`.
- Remote players follow the `route` they broadcast; the server does not validate routes.
