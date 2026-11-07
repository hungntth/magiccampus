# Dress (Thời trang) and Flying (Phi hành) — legacy server research

Date: 2026-11-07. Source: legacy Go server `E:\mcgame\internal\` (paths below are relative to it) + Mongo `data_tbl_*` counts.
Scope: M13 plan (`docs/plans/2026-11-04_16_APPEARANCE_GEAR.md`) phase A (flying/appearance) and phase B dress part (no Hồn Khí/deco).

## 1. Summary

- Dress panel (Tủ Đồ): per-character blob: dress book, recipe counts, crystal/jewel counters, daily free-draw counter, score, two fake-dress ids.
  Draw chips/sets (free, 30 / 288 vàng, 300 / 2880 Điểm Thời Thượng), transform 3 sets → 1 random set, activate (1 set recipe + crystal/jewel)
  → `book`. Activated dresses give permanent stats. Fashion item via `recieveGoods`, worn in slot 21. Fake dress overrides the look only.
- Flying: in-memory flag + persisted "landed" flag. Gates level 50, flyer in position 14, flyable map, 5 s cooldown, group rules. Flying
  changes encounter pools and blocks ground fights. No speed change server-side.

## 2. RPCs

Dress RPCs registered `presentation/rtmp/handlers/dress/handler.go:70-86`; `setDressHide` in `handlers/item/handler.go:223`;
`beginFlying`/`stopFlying`/`fixFlyState` in `handlers/scene/handler.go:166-168`. Go swallows every dress service error into a `nil` reply
(`handler.go:200-229`) — H5 answers with a toast instead (plan §2.2). No level/map gates on dress RPCs.

| RPC (args) | Go | Behaviour / pushes |
|---|---|---|
| `checkSameDay()` | `activate.go:23`, `service.go:195` | daily reset + stale-recipe normalize, save if changed, returns dressInfo |
| `activeDress(dressId, autoBuy)` | `activate.go:35`, `service.go:207` | R6. Spend notices (`activate.go:168`) then `onUPP` stat refresh (`activate.go:143`). Returns dressInfo |
| `ensureBuyActive(dressId)` | `activate.go:60` | = activeDress autoBuy=true |
| `recieveGoods(dressId)` | `activate.go:81`, `service.go:262` | R7; client sends with null responder |
| `exchangeRecipe(recipeId)` | `activate.go:123`, `service.go:292` | R8 |
| `freeExtractRecipe()` | `extract.go:49/11` | returns `{dressInfo, recipeId, recipeNum}` |
| `goldExtractRecipe()` | `extract.go:65/35` | 30 vàng, `onUPP {gold}` only; `{dressInfo, recipeId, recipeNum}` |
| `tenExtractRecipe()` | `extract.go:82/62` | 288 vàng, `onUPP {gold}` only; `{dressInfo, planArr:[{recipeId,num}]}` |
| `ssdExtractRecipe()` | `extract.go:98`, `extract_ssd.go:17` | 300 Điểm Thời Thượng; `onUPP {shishangdian}` + "Tiêu hao N điểm thời thượng."; short → `onRedMsg` "Không đủ điểm thời thượng để rút." |
| `largessdExtractRecipe()` | `extract.go:116`, `extract_ssd.go:41` | 2880 points, 10 chips + 1 set; same pushes |
| `makeAllChips()` | `extract.go:133/95` | R10; `onMidNote` "Ghép thành công" when ≥ 1 conversion; returns dressInfo |
| `transformRecipe([3 ids])` | `extract.go:151/150` | R11; `{dressInfo, recipeId, recipeNum}` |
| `transformAllRecipe([3 ids], [picked]?)` | `extract.go:172/176`, `transform_picked.go` | R11; `{dressInfo, produceArr:[{recipeId, recipeNum}]}` |
| `setFakeDress(dressId, resCode)` | `fake.go:16`, `service.go:316` | writes `fakeDressId`, returns dressInfo, then dress look sync (§6) |
| `unsetFakeDress(dressId, resCode)` | `fake.go:37` | `fakeDressId = 0`, same sync |
| `setFakeFlyerDress(dressId, resCode, wavCode)` | `fake.go:51` | writes `fakeFlyDressId`, then `onFlyerOn` |
| `unsetFakeFlyerDress(dressId, resCode, wavCode)` | `fake.go:72` | `fakeFlyDressId = 0`, `onFlyerOn` with `wavCode: 0` |
| `setDressHide(bool)` | `item/misc.go:130`, `wing_hide.go:54` | persists (R22), dress look sync, returns the bool |
| `beginFlying()` / `stopFlying()` / `fixFlyState()` | `scene/movement.go:309/374`, `flight_group.go:20` | §6 / §8 |

Client args/responders: `docs/client/view/view/compDragable/DressDisplay.as:577-624`, `DressPanel.as:1453,1578,1979,2046,2191`.

## 3. Rules

- **R1 state** (`domain/dress/info.go:14-29`): `book {dressId: 0|1|2}` (1 activated; 2 "claimed" never set live), `recipe {recipeId: count}`
  (≤ 0 deleted, `info.go:141-150`), server-only `recipeBurns {dressId: bool}`, `bag {crystal, jewel}`, `extract` (free draws today), `score`
  (Điểm thưởng), `fakeDressId`, `fakeFlyDressId` (0 default), server-only `day` (`YYYY-MM-DD`).
- **R2 client copy** (`info.go:76-105`) drops `day` and `recipeBurns` (the Flash JSON decode corrupted hyphenated dates). Login seeds the same
  shape (`handlers/auth/login_helpers.go:26-36`, cData `dressInfo` at `login_payload.go:300`). Empty/corrupt → `NewInfo()`.
- **R4 daily reset** (`info.go:107-114`): on a new day `extract = 0` (Go UTC date — H5 uses the UTC+7 day key per plan §2.2). Runs in
  `checkSameDay`, `activeDress`, all draws (not transform/makeAllChips/exchange).
- **R5 stale-recipe normalize** (`service.go:165-193`, every load): for each activated dress not in `recipeBurns`, remove one copy of its set
  recipe if owned, mark burned.
- **R6 activate** (`service.go:207-256`): unknown dress → invalid; already `book ≥ 1` → already; `recipe[recipe_id] < 1` → no recipe; need
  `num1` crystal (75) + `num2` jewel (15) (all 94 rows); short and !autoBuy → no material; autoBuy buys the shortfall at **1 vàng / crystal,
  5 vàng / jewel** (`service.go:37-38`), unbound gold (`SpendGold`, VIP exp accrues); then subtract, `recipe -1`, `book[id] = 1`. Pushes spend
  notice "Tiêu hao N vàng." then `onUPP` stat refresh (no `expSkill`/`cl`). Crystal/jewel income: TBL_ITEM_AWARD type 37, `award_id` 1 =
  crystal, 2 = jewel (`application/item/effect_award_dress.go:18-50`).
- **R7 recieveGoods** (`service.go:262-290`): activated only; mints bound equipment `dress.equipt_id` with colour from `dress.color`
  (display -1 → 0 else min(color,4)+1, `domain/item/display.go:133`); repeatable. Full bag → `onSystemSay` "Không đủ ô trống."; other failure
  "Không thể nhận vật phẩm thời trang."; success `onAddCharactorSlot` + `onSystemSay` "Nhận được <name> x1", returns dressInfo.
- **R8 exchangeRecipe**: cost `data_tbl_recipe.money` from `score`; +1 recipe; notice "Tiêu hao N điểm thời trang.". Go has no type/is_open/
  money>0 check (H5 adds it).
- **R9 draws**: free (limit 1/day, chip pool, `extract++`, no score); gold 30 → 1 chip, `score += 30`; ten 288 → 10 chips + 1 set,
  `score += 288`; points 300 / 2880 of currency `shishangdian` (id 61), no score. Rút Bộ gold extracts send no "Tiêu hao" notice, only `onUPP`.
  Order: validate pool → funds → spend → roll → save → announce.
- **R9b pools** (`draw_rules.go:142-184`): chips = `recipe.type == 2` (93), sets = `type == 1 && is_open > 0` (94); excluded dress 1072
  Yasuo (custom legacy row, not in H5 data unless overlaid). Weighted pick `rand(total)` over cumulative weights; weights in
  `E:\mcgame\docs\memory\dress-draw.md` (owner-confidential, never shown to players). `data_tbl_recipe_plan` is NOT used by dress.
- **R9c announce**: a rare set (fashion with position ≥ position of dress 1044, or flyer 2017-2022) from any draw/transform → global
  `onSystemSay` "Chúc mừng [@PID|id|name|8|0|0] đã rút được <font color='#FA5B05'>[Bộ …]</font>" (`draw_rules.go:186-216`). Chips never.
- **R10 makeAllChips** (`extract.go:95-148`): each chip (type 2) with count ≥ `num` (10) → `floor(count/10)` × `product` set.
- **R11 transform**: `transformRecipe` uses the first 3 ids, duplicates allowed (counts summed), short → `onRedMsg` "Không đủ công thức để
  chuyển bộ."; consumes, rolls ONE set. `transformAllRecipe([a,b,c])`: `rounds = min(have/needPerRound)`, rolls `rounds` sets. With a non-empty
  second arg: pool all owned copies of the picked type-1 ids, `rounds = floor(total/3)`. Go does not validate type 1 on the 3-id path (H5 does).
- **R12 dress-book stats** (`application/dress/bonuses.go:17-69`): every `book ≥ 1` dress (fashion and flyer) adds `prop1..4/prop_num1..4`
  through the common prop scale: 1 = maxHP, 4 = attack, 5 = magic attack, 11 = speed; flat, before percents. E.g. 1001: HP +100, ATK +25,
  MATK +25, speed +10 (orange rows 200/50/50/20).
- **R13 worn fashion/flyer** use normal equipment aggregation: fashion `main_prop1/2` 24/25 = maxHP%/maxMP% 20/20; flyer 24/11 40/50
  (sample 2376). Fashion never "powerless" at durability 0; flyer at 0 durability gives no stats.
- **R14 slots**: position = sid; fashion 21, flyer 14, wing 22, weapon 3 (`application/item/appearance.go:16-25`).
- **R15** stacks up to 9999; equipping takes one unit.
- **R16** flyer `req_level` 50 (88 rows), 30 / 10 (1 each).
- **R17 not workshop equipment**: kind 10/11 or position 14/21 refuse star/hole/socket/upgrade/prefix/element/bind/soul/rename/resolve with
  `onSystemMidMsgOrNote` "Thời trang và vật phẩm bay không thể thăng cấp / thăng tinh / đục lỗ / khảm nạm." Fashion has no durability loss
  (`endure_max 1`); flyers keep durability (3000).
- **R22 dressHide**: `interfaceData.dressHide` 0/1, not rate limited, idempotent; arg bool/number.

## 4. State (H5 mapping)

| State | Go | H5 |
|---|---|---|
| dressInfo | `characters.dress_info` JSON | feature store key `dress` (plan decision 5) |
| `shishangdian` | currency 61 | `CURRENCY_IDS` key if missing |
| `dressHide` | interfaceData | settings module (`settings.ts` already has the key) / `Character.appearance` |
| flight landed | feature `flight {landed}` | `Character.appearance.flying` (plan §5) |

In memory only: flying set, last-toggle times, group flight.
Login flight (`InitFlightOnLogin`, `flight.go:101-121`): flyer worn + level < 50 → grounded (persisted); `landed` → grounded; else flying,
then landed on a no-fly map.

## 5. Data

- `data_tbl_dress` 94: ids 1001-1072 fashion (type 1), 2001-2022 flyer (type 2); `equipt_id` (kind 11 / 10 template), `recipe_id` (type-1
  recipe), `position` (panel order), `color` 3/4, `num1` 75, `num2` 15, `prop1..4`, `prop_num1..4`, `name`, `is_open`.
- `data_tbl_recipe` 187: sets type 1 (ids 1001-1094, `kind` 1 fashion / 2 flyer, `money` exchange price, 999999999 = not buyable on 35 rows,
  else 200-700); chips type 2 (2xxx, `num` 10, `product` = set id, `money` -1).
- `data_tbl_equipt_template` kind 11 / position 21: 239 rows, `res_code_male/female` > 0 (`res_code` 0), `stack_max` 9999, `endure_max` 1.
  Kind 10 / position 14: 90 rows, `res_code` > 0 (male/female 0), `wav_code` > 0 on 8 rows (front layer), `endure_max` 3000.
- Res picker (`appearance.go:341-368`): gender 1 → `res_code_female` else `res_code_male`, then `res_code`, then `*2` columns.
- `data_tbl_map.flyable`: 1 on 100 maps, -1 on 109 (dungeons/arenas). Go reads `flyable == 1`.
- Note: H5 forge reads `data_tbl_recipe_plan` as keyed by equipment template id (`server/src/modules/gamedata/forge-data.ts:1`) but all 365
  rows join to dress recipes — check for collisions (open).

## 6. Push sequences

**Equip/unequip fashion (21)** after the normal equip pushes (move, bind, onUPP, onInitViewProp…), the dress look sync
(`application/item/appearance_dress_sync.go:37-89`), self + scene:
- costume visible (worn, not hidden; fake overrides): `onEquipOn {cid, resCode, ee, ef, star, dressFlag:true}`;
- else `onEquipOff {cid, resCode: body or -1, colorCode: class color_code_*1, dressFlag:true}` + `onEquipOn {…, weapon res, dressFlag:false}`
  if a weapon is worn;
- then always `onSetRes {id, res: resolved body}`.
Same sync for `setDressHide`, `setFakeDress`, `unsetFakeDress`.

**Flyer equip**: `onFlyerOn {cid, resCode, wavCode?}` (fake flyer wins; `wavCode` only if > 0; nothing if res ≤ 0). **Unequip**: `onFlyerOn`
with the resolved look, or `{cid, resCode:-1, wavCode:-1}` (no `onFlyerOff`); does not land the character.

**beginFlying** (`movement.go:309-372`): level ≥ 50 + flyer in 14 else `onMidNote` "Cần trang bị phi hành và đạt cấp 50 mới có thể bay"; leader
with a non-AFK member on the map lacking a flyer → `onMidNote` "Thành viên <name> chưa trang bị phi hành, cả nhóm không thể bay"; no-fly map →
`onMidNote` "Bản đồ này cấm bay."; cooldown → `onRedMsg` "Vui lòng đợi 5 giây sau khi cất cánh / hạ cánh rồi thử lại." (refusal does not
restart it). Success persists `landed:false`, pushes `onBeginFlying {id}` to scene then self, then group sync.
**stopFlying**: cooldown only; `onStopFlying {id}` scene then self, group sync. **Group sync** (`flight_group.go:40-71`): leader toggles set
every non-AFK member on the map (no gates/cooldown). `fixFlyState()` aligns a follower with the leader; reply null.
Scene entry on a no-fly map lands and persists (no push).

## 7. Appearance resolver

Body `resCode` (`appearance.go:174-200`), first match: active transform → (dressHide or no fashion) class body → fake dress (resolves via
`dress.equipt_id`, gender res) → equipped fashion res → class body. Class body = `data_tbl_class.res_code_female/male` by gender.
Payload: `wp` weapon res or "0"; `dressResCode` (scene: -2 when hidden/none/transformed); `flyerResCode` + `flyerFrontResCode` strings "0"
when none; `wingResCode`, `mountResCode` ints. Flyer look (`appearance.go:202-223`): none worn → none; fake flyer (res via dress template,
`wav_code`) wins; else worn flyer `res_code`/`wav_code`.
Client facts: a costume hides weapon and mount; flying hides the mount.

## 8. Flying cross-cutting

- Scene `isFlying = flying && mapFlyable`; `doubleFly` always false.
- Flying blocks ground fights unless NPC `layer == 3` → `onRedMsg` "Đang bay không thể chiến đấu với mục tiêu dưới mặt đất, hãy hạ cánh trước."
  (`flight_fight.go:56-75`). Encounters: in the air only creatures with `with_cloud = 1` roll; on the ground the others
  (`encounter_flight.go:14-41`).
- No server speed change. Flyer unequip does not land.
- Wedding fly (`onBeginWeddingFly`) out of scope.

## 9. Open / unverified

1. `exchangeRecipe`, `transformRecipe` and fake dress are unvalidated in Go (H5 validates).
2. Normalize (R5) loses a spare recipe copy drawn after activation — kept as Go behaviour or dropped (H5 decision).
3. Fashion/flyer workshop gate file `handlers/item/fashion_gear_gate.go` read only via memory.
4. `bindMainPropNum` source for the bound bonus not traced.
5. `fixFlyState` 30 s client limit and take-off timings from comments, not AS.
6. `data_tbl_recipe_plan` id collision with H5 forge craft (see §5).
