# Map portals / transport gates - server research (legacy Go, E:\mcgame)

## 1. Summary
Portals are NOT in `data_tbl_map_cell` (that table is 1787 decoration cells keyed by `mid`, only mids 300/437/439/1401109; columns id, mid, pos_x, pos_y, res_code; unrelated to map ids 1/3). They are **scene-item instances** whose template has `type = 3`:
`data_tbl_sceneitem_instance` (1094 rows) joined to `data_tbl_sceneitem_template` (`id = tid`, `type = 3`). Templates of type 3: 38 "传送点" (main gate, 147 instances), 98 "棺材传送点", 99 "入", 100 "出", 101 "树洞传送". 154 instances total use these templates (`gamedata/sceneitem_gates.go:8-21`, `const sceneItemTypeTransport = 3`).
The client sends `sceneChange(gateInstanceId)` after its avatar stops walking while its shadow hit-tests the gate's display object (`docs/client/view/view/compGameStage/PlayerView.as:198-203`). The server does NO distance check; it resolves destination from the gate id alone.

## 2. Entry points
- RPC `sceneChange` (arg0 = gate instance id): registered `presentation/rtmp/handlers/scene/handler.go:153` -> `scene/login.go:169 SceneChange` -> `application/scene/teleport.go:35 GetTeleportDestination`.
- RPC `createSceneItems` (no args, uses char map): `handler.go:160` -> `scene/world.go:147 CreateSceneItems` -> `Service.GetMapItems` (`application/scene/service.go:96`, repo `FindByMapID`). Returns array of `SceneitemInstanceTemplate.ToDTO()` (`gamedata/models/sceneitem_instance.go:49-66`): `id, bright_code, color_code, dead_line, layer, maker, name, owner_id, owner_type, pos_dir, pos_map_id, from, pos_x, pos_y, tid`. Empty array on instance-copy maps (`world.go:157-159`).
  So the client gets portal data from this RPC reply (ALL scene items of the map incl. non-gate; filter via template type 3 / tid), not from sceneLogin. `RPC_DELAY["sceneChange"]=1100` ms client throttle (`docs/client/config/RPCConfig.as:34`).

## 3. Rules (sceneChange, login.go:169-264)
1. `args` len < 1 or arg0 not number -> `ErrInvalidArgs` (login.go:170-182). Not logged in -> `ErrUnauthorized` (:184-187).
2. oldRoom = connection scene id; if 0, load char.MapID (:189-196).
3. `GetTeleportDestination(gateID)`; gate id not in `sceneItemInstance` or no resolvable destination -> `ErrInvalidArgs` (:198-202). NOTE: it does not even check the gate template is type 3 - any scene-item id with `from != 0` or a name matching a map would work (unverified beyond reading teleport.go).
4. Destination resolution (teleport.go:35-73, teleport_alias.go):
   a. if `gate.from != 0` and instance `from` exists with `pos_map_id > 0`: dest map = that paired gate's `pos_map_id`; arrival = `landBesideGate(pairedGate)`.
   b. else (`from = 0`, 74 gates incl. 35 tid-38): `gateTargetMap`: `gateIDTargets[id]` (event maps 600-604, ids 3536,3558,3559,3566,3567,3568,3585,3586,3587,3594) -> `gateNameTargets[name]` (Cảnh Kỹ Trường->2000, Mê Huyễn Động(Tầng 1)->2001, Tầng 2->2002, Lối Thoát Thần Bí(1/2)->503) -> exact `data_tbl_map.name == gate.name` on a different map, lowest id wins (teleport_alias.go:39-68). Then `reverseGate(destMap, srcMap)`: lowest-id transport gate on dest map whose name == source map name or whose target map == source (:70-88) -> `landBesideGate`; if none, dest map safe point (`GetSafePoint`, teleport.go:75-92). If no target map: twin gate (same map, same name, lowest id) -> `landBesideGate(twin)`.
5. `landBesideGate(g)` (teleport.go:94-111): constants `gateLandingOffset = 100`, `gateLandingDistance = 180.0` (:24-27). If `gateLandingOverride(g.ID)` exists (teleport_landing.go table, ~62 walkable fixes e.g. 743:{1598,1392}) use it. Else (gx,gy)=gate pos, (sx,sy)=`GetSafePoint(g.map)`; d=hypot(sx-gx,sy-gy); if d<1 -> (gx+100, gy+100); else step=min(180,d); `x=round(gx+dx/d*step)`, `y=round(gy+dy/d*step)`. Arrival dir = 0 (login.go:224).
6. `GetSafePoint(map)` (service.go:119-141): `data_tbl_map.safe_x/safe_y` if either > 0; else fallback map1 (100,100); else (100,100). Instance maps resolved via `resolveInstanceTemplate`.
7. Gate guard (gate_guard.go:20-32; wired cmd/gameserver/dungeon_wiring.go:83-95): only dungeons (`dungeon.ByMap(toMap)`). Same dungeon moving to same/lower floor always allowed (service.go:278). Else need an open run and floor reachable. Refusal: push `onMidNote(msg)` and return `nil,nil` (no error reply, player stays):
   - ErrNoRun: `Hôm nay ngươi chưa mở %s, hãy vào từ lối vào của phụ bản.`
   - ErrFloorLocked: `Hãy hoàn thành tầng hiện tại của %s trước khi sang tầng tiếp theo.`
   - other error: allowed.
8. NOT present in sceneChange: level requirement, distance/radius, battle/state check, map-type restriction, cooldown, fly check. (`data_tbl_map.level` is not enforced here; verified by reading login.go:169-264 fully.) Group: leader's followers are moved to the same dest via `FollowLeaderToMap(...)` (login.go:255, utils/group_transport_samemap.go).
9. Persistence: `charService.UpdatePosition(MapID,X,Y,Dir 0)` immediately (:224-227) plus social presence upsert.

## 4. Push sequence (sceneChange success)
1. (old room, excluding self) `onCharLeaveScene(characterId)` - login.go:220 (NOT `onScenePlayerLeft`).
2. self `onCreateNpcs({})` then `onCreateBoss({})` - scene reset (handler.go:137-142).
3. self `onSceneEnter(newMapId, x, y, -1)` - :236.
4. self `onCreateChars` of the new room (`PushOnCreateChars`, :240).
5. (new room, excluding self) `onScenePlayerEntered(playerData)` - :252.
6. group followers moved (:255).
RPC reply = `nil` (null). Error: ErrInvalidArgs (bad id / unknown destination), guard refusal = `onMidNote` + null reply, no other pushes. The client afterwards re-calls createNpcs/createBoss/createSceneItems (unverified, inferred from the empty resets).
Contrast `sceneLogin` (login.go:24-85): `onSceneLogin(mapIdStr, mapIdStr)`, mount cb, `onClearWbView`, `onCreateCharactor`, `onScenePlayerEntered` broadcast - no portal data.

## 5. Data
`data_tbl_sceneitem_instance` columns: id, tid (-> sceneitem_template.id), name (label = destination map name), pos_map_id (map the gate sits on), pos_x, pos_y, pos_dir, layer, from (paired gate instance id, 0 = unpaired), color_code, bright_code/dead_line/maker/owner_* (null).
Sample (ids from Mongo):
| id | map | name | from | x,y | tid |
|---|---|---|---|---|---|
| 732 | 1 Xuất Vân Thôn | Đông Xuất Vân | 733 | 1649,1306 | 38 |
| 733 | 2 Đông Xuất Vân | Xuất Vân Thôn | 732 | 120,63 | 38 |
| 734 | 2 | Đông Huyền Thành | 922 | 107,1368 | 38 |
| 757 | 3 Vân Đài | Xuất Vân Thôn | 0 | 53,1094 | 38 |
| 758 | 3 | Thiện Tĩnh Địa | 812 | 2042,95 | 38 |
| 812 | 4 Thiện Tĩnh Địa | Vân Đài | 758 | 176,1767 | 38 |
Map 1 has exactly one portal (732); map 3 has 757 (unpaired, resolves by name "Xuất Vân Thôn" -> map 1, reverseGate = gate on map 1 named "Vân Đài" if any else map-1 safe point (1000,1000); unverified which) and 758. Other scene items on maps 1/3 (tid 295-308, 398, 115, name "Tên") are not gates.
Map columns used: `safe_x, safe_y, width, height, name, level` (map1: safe 1000,1000, 2000x1500; map2: safe 2000,900, 2400x1600; map3 "Vân Đài" 2500x1800; map4: safe 1500,800, 3000x2000). `data_tbl_map.cl` is a `|`-separated NPC id list (e.g. map 3 `|14|4|56|2|181|...|`), not portals.
Worked arrivals: 732 -> lands beside 733: (120,63)+180*unit toward (2000,900) = **(284,136)** on map 2. 758 -> beside 812: **(321,1661)** on map 4 (computed by hand).
Id collisions: gate instance id vs map id vs NPC id are separate namespaces; `sceneChange` arg is a SCENE-ITEM INSTANCE id, not a map id.

## 6. Coordinates
All pixels in map space (1:1 with map width/height, e.g. 2000x1500), not tiles (teleport_landing.go header: "map pixels 1:1"; client movement steps of 20 px). Minimap posX/10 is a client display scale only.

## 7. Port notes (TS)
Existing `server/src/modules/scene/scene.rpc.ts:88-98` `sceneChange` is WRONG: treats arg0 as map id, optional x/y from client, emits `onScenePlayerLeft`, returns SceneLoginResponse. Legacy contract: arg0 = gate instance id; server computes dest; reply null; pushes onCharLeaveScene / onSceneEnter / onScenePlayerEntered. Add gamedata accessors: `getSceneItemInstance(id)`, `listSceneItemsByMap(mapId)`, `getTransportGates()` (instances whose template.type===3), `getMapByName`.
```ts
resolveGate(gateId): {mapId,x,y}|null {
  const g = gd.sceneItemInstance(gateId); if (!g) return null;
  if (g.from) { const p = gd.sceneItemInstance(g.from); if (p && p.pos_map_id > 0) return landBeside(p); }
  // unpaired: target map by name (map.name === g.name, map != g.pos_map_id, lowest id)
  const dest = targetMapByName(g); if (!dest) return null;
  const back = gates.filter(x => x.pos_map_id===dest && (x.name===srcMapName || targetMap(x)===g.pos_map_id)).minBy(id);
  return back ? landBeside(back) : { mapId: dest, ...safePoint(dest) };
}
landBeside(g){ const [sx,sy]=safePoint(g.pos_map_id); const dx=sx-g.pos_x, dy=sy-g.pos_y, d=Math.hypot(dx,dy);
  if (d<1) return {mapId:g.pos_map_id,x:g.pos_x+100,y:g.pos_y+100};
  const s=Math.min(180,d); return {mapId:g.pos_map_id,x:Math.round(g.pos_x+dx/d*s),y:Math.round(g.pos_y+dy/d*s)}; }
```
Skip gateIDTargets/gateNameTargets/landing overrides and dungeon guard for the first iteration (maps 1-4 only need the `from` pairing). Also add an `createSceneItems` RPC returning instances (filter tid with type 3 for the client to draw gates, template res_code 2020040000001 for tid 38).

## 8. Unverified
- Client's reaction to `onSceneEnter` args (grep of docs/client found no handler by that name; check client callback naming).
- Which map-1 gate `reverseGate` picks for gate 757.
- Whether the client re-requests createNpcs/createSceneItems after onSceneEnter.
- Mid-walk hit-test radius is purely client-side (`hitTestObject(shadow)`), no server number exists.
