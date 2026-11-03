# Map portals (cổng dịch chuyển) - Flash client research

Paths relative to `E:\mcgame\docs\client`. Prior Go-side notes cross-checked: `E:\mcgame\docs\research\2026-10-12_01_H5_PORTAL_SETUP_RESEARCH.md` (sprite sizes and landing numbers there came from SWF/seed probes, not re-verified here).

## 1. Summary
Portals are "scene items" (`SceneItem`) of template `type == 3` (`SceneItemView.TYPE_TRANSPORT`). They come from static gameData, not from a server push: `TBL_SCENEITEM_INSTANCE` (49) indexed by `posMapId`, joined to `TBL_SCENEITEM_TEMPLATE` (50) by `tid`. The player clicks the sprite (or its minimap icon), walks there, and when the walk ends with the shadow overlapping the sprite the client calls `sceneChange(instanceId)`. The server answers by pushing `onSceneEnter(mapId, x, y, copyId)` (name from Go notes; see section 7).
There is no client level check, no target-map coordinate on the client, no safe-point logic and no portal-radius check: the target and landing point are decided entirely by the server.

## 2. Key files
- `object/SceneItem.as` - data wrapper (fields below).
- `view/view/compGameStage/SceneItemView.as` - draws a scene item; owns portal click / tooltip.
- `view/view/compGameStage/DynamicItemLayer.as:54` (`addS`) - creates a `SceneItemView` per item.
- `logic/GameScene.as:198-296` - `sceneCreateItems`, `sceneEnter`, `sceneLogin` (builds items from local gameData, then fires the create* RPCs).
- `view/view/compGameStage/PlayerView.as:192-220` - `stopWalk` triggers `sceneChange`.
- `view/view/comp/MapCanvas.as:224-234, 377-391, 177-217` - minimap portal icons and click-to-walk.
- `system/Core.as:370-384` (`createSceneItem`), `:74` (`targetIP`), `:2298-2304` (`clearTargets`).
- `config/RPCConfig.as:33-35` - client-side throttle 1100 ms for `createSceneItems`, `sceneChange`, `sceneLogin`.
- `rpc/RemoteObj.as:89-137` - RPC proxy; drops calls inside the delay window silently.
- `system/CallBack.as` is a stub (decompile aborted, "trait count exceeds set limit"), so push bodies (`onSceneEnter` etc.) cannot be read from the client sources.

## 3. Data (field layout)
`Core.createSceneItem(o)` (`Core.as:370`): `SceneItem.data = o.iData`, `templateData = o.tData`; if `tData` is null the item is skipped (trace only).

`SceneItem` getters (`object/SceneItem.as`):
| Getter | Source | Line |
|---|---|---|
| `id` | `data.id` (instance id; this is what `sceneChange` sends) | 84 |
| `tid` | `data.tid` | 49 |
| `posX`, `posY` | `data.posX/posY` (sprite TOP-LEFT, see 4) | 59, 24 |
| `posDir` | `data.posDir` (1 = mirrored) | 74 |
| `name` | `data.name` (target-map name, used in tooltips) | 39 |
| `mapId` | `data.posMapId` | 69 |
| `colorCode`, `brightCode` | `data.colorCode/brightCode` | 54, 29 |
| `usedFlag` | `Boolean(data.ownerId)` | 34 |
| `resCode` | `templateData.resCode` (SWF code) | 44 |
| `type` | `templateData.type` (3 = transport) | 79 |
| `kind` | `templateData.kind` | 64 |
Also read: `data.layer` (`SceneItemView.as:64`, layer == 0 gives alpha 1).
Index keys: `TBL_INDEX_ARRAY[TBL_SCENEITEM_INSTANCE] = "posMapId"`, `TBL_INDEX_ARRAY2 = "ownerId"` (`predef/GamePredef.as:8365, 8453`); `TBL_SCENEITEM_INSTANCE = 49`, `TEMPLATE = 50` (`GamePredef.as:542-543`). There is NO "x,y,targetMap,tx,ty" string: the client never sees the destination. `TBL_MAP_CELL` (60) is only tile-map hit-test cells (`StageMain.as:545-562`, `posX/posY/resCode`), not portals.
Server-side destination table is not visible here (see Go docs `docs/database/details/TBL_SCENEITEM_*.md`).

## 4. Drawing
- `GameScene.sceneLogin` (`GameScene.as:264-274`): for each instance in `gameDataIndex[49][mapId]`, `tData = getGameData(50, inst.tid)`; pushes `{iData, tData}`; `sceneCreateItems` -> `Core.createSceneItem` -> `view.addS` (`DynamicItemLayer.as:54`).
- Same list also feeds `PANEL_MAP.initView()` / `clearIp()` when empty (`GameScene.as:207-214`).
- `SceneItemView.gameObject` setter (`SceneItemView.as:49-70`): `x = posX; y = posY`; the loaded SWF is a child at (0,0), so posX/posY is the sprite's top-left. Loads `ResManager.getResUrl(resCode)`. Default `alpha = 0.6` (line 45), `1` if `data.layer == 0`. `cacheAsBitmap`, `mouseChildren = false`.
- On load (`:82-119`): `_sprite.stop()`; if `posDir == 1` then `scaleX = -1; x = width`; `width/height` = sprite size; applies `colorCode`/`brightCode`; child named `"localizer"` gives ground anchor (`_yBase = y + localizer.y`, depth sort).
- Visibility: 500 ms timer `checkVisible` (`VISIBLE_DELAY`, `:26, 126-136`): visible only if in screen and `core.state != ST_CORE_BATTLE`.
- No name text drawn on the sprite. Name appears only as tooltip on ROLL_OVER: `Language.SCENEITEMVIEW_S[0] + name` = "Chuyển đến: " + name, at (stageX, stageY-20) (`SceneItemView.as:150-154`; `config/Language.as:2048`).
- Template resCodes / sprite sizes (from prior research doc, not re-verified): `2020040000001` 182x136 localizer (91,86.5); `...02` coffin 349x172; `...05` tree hollow 245x206 (hit-area only).
- Minimap icon: `MapCanvas.addIp` (`MapCanvas.as:224-234`): `MapIcon` style `"CanvasMapSend"`, x = `(posX + 183/2) * scaleX - 10`, y = `(posY + 136/2) * scaleY - 5`; tooltip `MAPCANVAS_S[0]` "Chuyển đến： " + name + "\r" + `MAPCANVAS_S[1]` "Vị trí： " + `int(posX/10)` + "," + `int(posY/10`). Only items with `template.type == TYPE_TRANSPORT` get icons (`:377-391`).

## 5. Trigger
1. Click on sprite (`SceneItemView.mouseDownHandler`, `:72-80`; listeners only when `type == 3`, `:55-63`, hand cursor): `stopImmediatePropagation(); core.targetIP = this; core.player.routeTo(x + localX, y + localY)` (walk to the exact clicked point inside the sprite).
2. Minimap icon click (`MapCanvas.clickHandler`, `:177-196`): `core.clearTargets(); player.closeTo(mouseX/scaleX, mouseY/scaleY); core.targetIP = core.view.getIP(itemId)`.
3. Walk end (`PlayerView.stopWalk`, `:192-204`): `if (core.targetIP && core.targetIP.hitTestObject(_shadow)) core.remote.sceneChange(core.targetIP.gameObject.id)`. Trigger area = whole sprite bounding box (hitTestObject with the player's shadow clip); no numeric radius. Walking across a portal without clicking it never triggers.
4. `targetIP` is cleared only by `Core.clearTargets()` (`Core.as:2298`); `walkable`/in-battle blocks walking (`Player.routeTo`/`closeTo` check `walkable && !_inBattle`, `Player.as:1773, 1976`).
5. Cooldown: `RPC_DELAY["sceneChange"] = 1100` ms (`RPCConfig.as:34`): a second call within 1.1 s is dropped client-side with no send and no feedback (`RemoteObj.as:89-104`).
6. Level gating: none in the client (no Language key, no check anywhere on the path). Any refusal is a server push (e.g. `onMidNote`; dungeon gate note in Go `memory/dungeon-phu-ban.md`).

## 6. RPC and push contract
| Name | Dir | Args / payload | Notes |
|---|---|---|---|
| `sceneChange` | C->S | `(itemInstanceId: int)` = `SceneItem.data.id` | `PlayerView.as:202`; fire-and-forget via `remote.<name>(...)` (`callProperty`, responder null), no result consumed |
| `sceneEnter` (pushed as `onSceneEnter`, name **inferred** from Go docs/H5 notes; CallBack.as unreadable) | S->C | `(mapId: int, x: int, y: int, copyId: int = -1)` | `GameScene.as:217`. Client dispatches to `GameScene.sceneEnter` (exact bridge in stubbed CallBack.as) |
| `sceneLeave` | S->C or internal | none | `GameScene.as:41-56`: `view.leaveScene()`, `hideAll(TYPE_PANEL)`, `world.setN(player.posMapId)`, ends battle if in one. Per Go notes `onSceneEnter` does leave + enter |
| `sceneLogin` | internal call | `(mapId, copyId=-1)` | `GameScene.as:242`; local method (RPC_DELAY entry exists too) |
| `createNpcs`, `createBoss`, `createChars`, `createGuildBuildings` | C->S | none | fired in that order at the end of `sceneLogin` (`GameScene.as:275-278`); replies via `onCreateNpcs`/`onCreateChars` pushes (names from Go notes) |

`sceneEnter(mapId, x, y, copyId)` (`GameScene.as:217-240`): `core.ready = false`; `player.posMapId = copyId != -1 ? copyId : mapId`; `player.posX/posY/posCenterX/posCenterY = x, y` verbatim; if `TBL_MAP[mapId].flyable != 1` then `flyingState = ON_GROUND`; `addCharactorView(player)`; `sceneLogin(mapId, copyId)`.
`sceneLogin` (`:242-296`): if `copyId != -1 && != mapId`, deep-copies the map row (`copyFlag = 1; id = copyId; templateId = mapId`) into `gameData[TBL_MAP][copyId]`; `player.mapData = row`; `view.enterScene(row)`; build scene items (portals); then `createNpcs`, `createBoss`, `createChars`, `createGuildBuildings`; `sysMidNote(map.name)` (map name banner); `playNormal()`; if `map.pk > 0` shows `GAMESCENE_S[0]` = "Đây là khu vực bắt buộc PVP, việc tắt mở PK không thể ngăn việc bị khiêu chiến." as midnote + sysMsg; hides trials info unless map in `TRIALS_PASS_MAP`; `MAIN_DOG_FIGHT.checkAndSetVisible()`.
Ordering that matters: portals/items are created synchronously inside `sceneLogin` before the create* RPCs are sent; NPC/char lists arrive later via pushes (order not provable statically). `sceneEnter` must precede any push that reads `player.posMapId` (e.g. `initWbView`, per world-boss research).

Loading screen: `StageMain.enterScene` (`StageMain.as:250-309`) sets `walkable = false`, map size, camera clamped to `posCenterX/Y`, loads map via `mapContainer.init` (types NORMAL/SINGLE/TILE; otherwise Alert " type error"). `MapContainer.loadSpecialMaps` shows loading modal `MAPCONTAINER_S[0]` = "Tải bản đồ " + random `SYSTEM_TIP[1]` (`MapContainer.as:~279-295`; `Language.as:2042`). `leaveScene` (`StageMain.as:311-328`): `itemContainer.removeAll()`, `hitTestContainer.removeAll()`, `mapContainer.clear()`, `view.clearStage()`, hide. Fade effects `fadeIn/fadeOut` 800 ms exist (`:573-586`); whether they play on portal use is not proven here.

## 7. Safe point / landing
- Client has no safe-point logic: arrival position is exactly `x, y` from `sceneEnter` (`GameScene.as:230-233`), no snapping to walkable cells.
- `TBL_MAP.safeFlag > 0` only marks a safe zone (`Player.mapData`, `Player.as:1665`; `TipMap.as:317`); `TBL_MAP.sArea` is a PK-forbidden rect (`CharactorView.as:193`). Neither is a landing point.
- Landing is therefore a server rule. Go notes (not client-verified): landing = destination portal `posX+100, posY+100` (approx. centre of the 182x136 sprite); portals without a paired gate land at the map safe point. Since the player lands inside the destination portal's sprite, a re-click on it goes back (original behaviour).

## 8. Proposed shared types (`packages/shared/src/protocol.ts`)
```ts
export interface SceneItemInstance { id: number; tid: number; posMapId: number; posX: number; posY: number;
  posDir?: number; name: string; colorCode?: number; brightCode?: number; layer?: number; ownerId?: number }
export interface SceneItemTemplate { id: number; type: number /* 3 = transport */; kind?: number; resCode: string }
export type SceneChangeArgs = [itemInstanceId: number];            // RPC sceneChange
export type OnSceneEnterArgs = [mapId: number, x: number, y: number, copyId?: number]; // push onSceneEnter
```
Owners: server `modules/scene` (rpc `sceneChange`, push `onSceneEnter`), client `client/src/game` (PortalView, click -> walk -> hit test -> `sceneChange`).

## 9. Open questions
- Exact push names (`onSceneEnter`, `onCreateNpcs`, ...) and bodies: `system/CallBack.as` is a decompile stub; names rely on Go notes (`docs/memory/h5-client.md:114`, `group-party.md:60`).
- Whether the loading modal / fade plays for portal travel (loading modal is tied to `loadSpecialMaps`; normal maps path not inspected).
- Server-side destination mapping and landing offset are not on the client; consult `E:\mcgame\internal\application\scene\teleport.go` via the Go researcher.
