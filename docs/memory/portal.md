# Map portals (transport gates)

Plan: `docs/plans/2026-11-03_03_MAP_PORTALS.md`. Implemented 2026-11-03. Research: `docs/research/2026-11-03_06_*`, `_07_*`.

## Contract (`packages/shared/src/protocol.ts`)
- `createSceneItems()` (`requireCharacter`, **not quiet**) -> `SceneItem[]` for the caller's map (all items, template joined:
  `id, tid, type, name, posX, posY, posDir, layer, resCode`); the client draws `type === SceneItemType.TRANSPORT` (3).
- `sceneChange(gateInstanceId)` (**not quiet**) -> `null`; push `onSceneEnter(SceneEnterPush = SceneLoginResponse)` to self.
  Unknown gate / no destination / destination map missing -> `invalidArgs('gateId')`. No distance, level or state check (legacy).
- `gmGoMap(mapId[, x, y])` (**not quiet**) -> `SceneLoginResponse`: the old map-id behaviour (safe point), used by `/go`.
- H5 deviation kept: room broadcasts stay `onScenePlayerLeft` / `onScenePlayerEntered`; the client pulls
  `createChars` / `createNpcs` / `createSceneItems` after every scene load instead of `onCreateChars/Npcs` pushes.

## Server
- `gamedata/sceneitem-data.ts`: `SceneItemRow` (instance joined with template, `from` = paired gate), indexes by id / map /
  gates; `GameDataService.sceneItemsOnMap`, `sceneItem`, `transportGates`, `mapByName` (lowest id). Cached at startup.
- `scene/portal.rules.ts` (+ test, pure): `resolveGate`, `landBesideGate`, `gateTargetMap` ported from Go
  `teleport.go` / `teleport_alias.go` / `teleport_landing.go`, incl. `GATE_NAME_TARGETS`, `GATE_ID_TARGETS`, the 62-row
  `GATE_LANDING_POINTS` override table, twin gates, reverse gate, safe-point fallback (100,100). `scene/portal-data.ts`
  adapts `GameDataService` to the narrow `PortalData` interface.
- Resolve order: paired gate (`from` != 0 and exists on a map) -> land beside it; else target map (id alias -> name alias ->
  lowest-id map with the same name, own map excluded) -> land beside the reverse gate, else the map safe point; else twin gate.
  Landing: fixed override point, else 180 px from the gate toward the map safe point (+100/+100 when d < 1). Dir 0.
- Real data (154 gates): all resolve except 811 (name "Tên"), same as legacy. 732 -> map 2 (284,136); 733 -> map 1 (1486,1229);
  758 -> map 4 (272,1860, override); 757 -> map 1 (1000,1000, beside reverse gate 740 area).
- Not ported: dungeon gate guard, instance-copy map template resolve, group followers.

## Client
- `game/PortalLayer.ts`: type-3 items with their `swfanim` sheet (`SheetAnim` loops `default`), alpha 1 if layer 0 else 0.6,
  mirrored when posDir 1 (scaleX -1 anchored at the stage width), zIndex = posY + `meta.localizerY`, hover tooltip
  "Chuyển đến: <name>", bounds = SWF stage size at (posX, posY); `contains()` = legacy shadow hit test (feet +- 18x8).
- `GameScene`: gate tap walks to the clicked point (`pendingGate`); on arrival, if the feet are inside the gate bounds ->
  `sceneChange(id)` (1100 ms throttle). Ground/NPC taps cancel it; walking across a gate without clicking does nothing.
  `onSceneEnter` -> `applyScene`. `/go <mapId>` -> `gmGoMap`.

## Transport NPC 1287 "Vân Đài" (2026-11-03)
- Xuất Vân Thôn (map 1) has **no** gate scene item to Vân Đài: the "gate" at (1723, 604) is NPC 1287 (type 9 TRANSPORT,
  resCode 2060090000094 = `creature/NPC_FUNC_000094`, a vector SWF of the red hexagram). Legacy `npc_click.go:199-237`
  hard-codes `clickNpc(1287)` -> map 3 safe point (1000, 1000), no dialog. H5: `CLICK_TELEPORT_NPCS` in `npc/npc.rpc.ts`
  -> `SceneTransportService.moveToMap` (extracted from `SceneRpc`, shared with sceneChange / gmGoMap) + `onSceneEnter` push.
- Its sheet was missing (swfbatch is bitmap-only), so the NPC drew the placeholder marker. Generated with `swfanim`
  (now also writes GameResInst `midX/footY/headY` = 98/151/70) into `client/public/sheets/creature/` + manifest.
  2 morph shapes of the SWF are not rendered.

## Assets
- `SITEM_SPAWN_000001..5` (resCodes 2020040000001..5) generated with `swfanim` into `client/public/sheets/item/` and
  `manifest.json` (000002 replaces an older 1-image `mixed` stub). 000001 red hexagram 24 frames, 000002 coffin static,
  000003 15, 000004 10, 000005 tree hollow glow 22 frames. See `docs/assets-pipeline.md` § Vector animations.

## Deferred
Minimap gate icons, loading modal/fade on map change, dungeon gate guard, followers, non-gate scene items (decor/houses),
`onCreateNpcs`-style push names. Quiet `sceneChange` / `createSceneItems` / `gmGoMap` only after the user confirms the feature works.
Known pre-existing issue seen while testing: after a socket drop the old `GameScene` ticker listener keeps ticking destroyed entities
(console TypeError in `Entity.tick`).
- Seed fix (2026-11-04): gate 731 "Vân Đài" has `pos_map_id` 200 (no such map). `GATE_MAP_FIXES` in
  `gamedata/sceneitem-data.ts` moves it onto Xuất Vân Thôn (map 1, 1723,604 walkable), so Vân Đài gate 757 lands beside
  it instead of at the map 1 safe point, and map 1 gets its gate back to Vân Đài. Its formula landing (1565,690) is a
  wall, so `GATE_LANDING_POINTS` has an H5 entry 731 -> (1700, 660) (63 entries: 62 from Go + this one).
