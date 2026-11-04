---
name: reference-go-economy-navigation
description: Where Go economy code lives (shop/bank/craft/upgrade/rune), which RPCs are mocks or unregistered, registration collisions, data column semantics
metadata:
  type: reference
---

Handlers: `handlers/item/*` holds bag, repair, craft (`craft.go`, `mix.go`, `jewel.go`, `gem.go`, `hole.go`, `star.go`, `change_*.go`, `resolve.go`, `maker.go`, `tempbag.go`, `life_skill.go`), `handlers/shop/*` (shop/mall/VIP), `handlers/npc/npc_click.go` (bank open), `handlers/rune`, `handlers/mysteryexchange`. Logic: `application/item/{service,hole,maker,equip_stats}.go`, `application/shop/*`, `application/rune/*`.

- Registration order in `cmd/gameserver/main.go` (item 462 < shop 594 < stub 807): `repairAll` live = shop version (item's is dead). `handlers/craft` is never registered (`onGetMakeLimitTimes` is Mystery Treasure, not equipment craft).
- Mocks: `sellItem`, `exchangeItem`, `updateLimit`, `getShopAwardStr`, `getShopConfig` family (`application/shop/service.go:436-501`). Unregistered: `bankSort`, `repairPetEqu*`, `petEqu*`. Page books 324/325 (type 500) are message-only no-ops; only admin HTTP changes `bagSlotNum`.
- Durability never decreases (`ReduceDurability` has no callers).
- Client decompile lacks the main equipment function panel: `EquiptFuncPanel.as` is the pet-equip variant, so changeLevel/holeDig/jewelSet/equResolve request shapes come only from Go parsing.
- Star rate: Go `rate[star]`, client display `rate[star+1]` (off by one). Crafting rates by material level are Go; recipe_plan `recipe_id` = equipment template id (not `data_tbl_recipe`, which is fashion formulas with colliding ids 1001+).
- Enum scales: material colour (instance ColorCode 0-5, level = c+1), equipment ColorCode = (q+4)/5, display colour = ColorCode-1.
- Stale legacy memory: transport gold cost (code 3/5 gold, doc says 1000/5000); holeDig cost 2000 silver (doc says gold); star table.
- Sid map: equip 1-22, bank 301-450, temp 80-99/100+, pet equip 1001-1200, bag 2101-2310, quest 2311-2340, pet bag 2341-2370.
