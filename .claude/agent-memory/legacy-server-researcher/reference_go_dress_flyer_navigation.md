---
name: go-dress-flyer-navigation
description: Where the Go dress (Tủ Đồ / fashion / flyer cosmetics) and flying (Phi hành) code lives, live vs dead handlers, table semantics and id collisions
metadata:
  type: reference
---

Legacy repo is at E:\mcgame (not D:\mcgame). Paths below are under `internal/`.

- Dress panel RPCs (17 incl. free/ssd/large draws, exchangeRecipe, setFakeFlyerDress): `presentation/rtmp/handlers/dress/handler.go:70-86`; logic `application/dress/service.go` + `extract.go` + `draw_rules.go`; state `domain/dress/info.go` (JSON string in `characters.dress_info`, server-only keys `day`, `recipeBurns` stripped by `EncodeClient`).
- `setDressHide` is NOT in the dress package: `handlers/item/misc.go:130` (flag in `PMProcessData["interfaceData"].dressHide`, `wing_hide.go:54`). `setFakeDress`/`setFakeFlyerDress` never validate ownership/activation.
- Appearance resolver lives in `application/item/appearance.go` (+ `appearance_dress_sync.go`); equip slot index = template position - 1 (fashion pos 21 -> slot 20 / sid 21, flyer pos 14 -> slot 13 / sid 14, wing 22).
- Flying: `application/scene/flight*.go` (in-memory registry + persisted "flight" feature state {landed}), handlers `handlers/scene/movement.go` (beginFlying/stopFlying) and `flight_group.go` (fixFlyState, party sync). No flying speed change exists in Go.
- Dress-book stat bonus = `application/dress/bonuses.go`, registered `cmd/gameserver/main.go:668` via `itemService.AddCharacterBonusProvider`.
- Quirk: `handlers/item/handler.go:429 sendFlyerOnIfNeeded` is dead code (no caller).
- Quirk: `ExchangeRecipe` does not check recipe type/is_open (chip money -1 would add points).
- Collision: `data_tbl_recipe_plan.recipe_id` joins 100% to `data_tbl_recipe` (dress sets/chips, st 2 chip / 3,4 full); dress server code never reads it. Go forge (`handlers/item/craft.go:789`) and the TS forge `GameDataService.recipePlan(equipTid)` read the same table keyed by recipe id; TS treats it as equipment template id.
- Dress `type` 1 = fashion (equipt kind 11, pos 21), 2 = flyer (kind 10, pos 14); `data_tbl_recipe.type` 1 set / 2 chip(num 10, product = set id); `kind` 1 fashion set / 2 flyer set. `data_tbl_dress` prop ids 1/4/5/11 = maxHP/attack/magicAttack/speed (CommonFeaturePropToStat), not the equipment prop scale (24/25 = HP%/MP%).
- Daily dress reset uses UTC date (`application/dress/service.go:136`).
