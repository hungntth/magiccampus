# Thời trang + Phi hành (M13 phase A subset + phase B dress) — Scope addendum

**Date**: 2026-11-07 · **Status**: Approved (user request 2026-11-07 "Thêm feat thời trang và phi hành như bên bản gốc", narrowing the
approved M13 plan) · **Parent plan**: `docs/plans/2026-11-04_16_APPEARANCE_GEAR.md` (approved 2026-11-05) — its §2.1, §2.2, §3, §4, §5,
§6.1 and decisions apply unless this addendum says otherwise.

Research (read before coding, they supersede the parent plan where they are more precise):
- `docs/research/2026-11-07_04_DRESS_FLYER_CLIENT_RESEARCH.md` — Flash contract: RPC args/replies, `dressInfo`, panel tabs, all
  DRESS_PANEL strings, flying state machine, rendering (flyer under body, `wav` front only while airborne, costume replaces body).
- `docs/research/2026-11-07_05_DRESS_FLYER_SERVER_RESEARCH.md` — Go rules R1–R22, push sequences, resolver priority, flying gates.
- Legacy draw weights: `E:\mcgame\docs\memory\dress-draw.md` (owner-confidential: in code only, never in player-visible text).

## 1. Scope

In:
1. **Appearance (parent 13.1, subset)**: costume body (equipped fashion pos 21, fake dress, `dressHide`, transform wins), flyer layer
   (pos 14, fake flyer dress, `wav_code` front layer while airborne), flying (`beginFlying` / `stopFlying` / `fixFlyState`, `onBeginFlying` /
   `onStopFlying`, scene/login fields), mount rider in scene payloads + rendering (paged WebP atlases now load the tall mount sheets;
   remove the `MAX_SHEET_PX` fallback in `Entity.ts` if it only existed for that).
2. **Dress system (parent 13.2, dress part only — 17 RPCs)**: `checkSameDay` `activeDress` `ensureBuyActive` `recieveGoods` `exchangeRecipe`
   `freeExtractRecipe` `goldExtractRecipe` `tenExtractRecipe` `ssdExtractRecipe` `largessdExtractRecipe` `makeAllChips` `transformRecipe`
   `transformAllRecipe` `setFakeDress` `unsetFakeDress` `setFakeFlyerDress` `unsetFakeFlyerDress`, plus `setDressHide` and the H5 catalog read
   `getDressCatalog`. Tủ Đồ panel (4 tabs Tổng Quan / Kích Hoạt / Rút Bộ / Chuyển Bộ + Đổi bộ window), opened from the character panel
   "Tủ đồ" button (today it opens the bag — move the bag to its own entry if needed, follow the research §4.1).
3. **Dress-book stat provider** (R12) and the **fashion/flyer workshop gate** (R17, parent open question 11 → yes).

Out (stay in the parent plan's later phases): wings (layer + RPCs, `setWingHide`), fairy, Hồn Khí / deco (10 RPCs), rebirth look, the
"Chọn bộ" picked-transform variant (second arg of `transformAllRecipe` is accepted and handled like Go's picked path only if trivial),
wedding double-fly, flying encounter pools (`with_cloud` column does not exist in H5 `data_tbl_creature`), award type 37 (no rows in H5
`data_tbl_item_award`; crystal/jewel come from auto-buy only), legacy recipe normalize R5 (H5 has no legacy dress data; skip).

## 2. Decisions (parent open questions answered with the defaults)

1. Q10: `recieveGoods` stays repeatable (Go). Draw weights = Go's (dress-draw.md), not the client text odds.
2. Q11: forge refuses star / hole / socket / upgrade / prefix / element / bind / soul / rename / resolve on kind 10/11 (or position 14/21)
   with `onSystemMidMsgOrNote` "Thời trang và vật phẩm bay không thể thăng cấp / thăng tinh / đục lỗ / khảm nạm."; fashion has no
   durability loss.
3. Day key for `extract` = UTC+7 (`dayKey` in shared), not Go's UTC.
4. H5 validations Go lacked: `exchangeRecipe` only type 1, `is_open > 0`, `money > 0` and `< 999999999`; transform ids must be type-1 sets;
   fake dress needs `book[id] ≥ 1` and the right dress type (1 fashion / 2 flyer). Every refusal answers a toast (no silent `null`).
5. `dressInfo` travels as an object (shared type `DressInfo`), field names kept; never send `day`.
6. Rare-set announcement (R9c) via the chat/system broadcast already used for world messages.
7. Flying: `Character.appearance.flying` persisted (true = in the air); cooldown map in memory; gates exactly as research §6 (level 50,
   flyer worn, `data_tbl_map.flyable == 1`, 5 s cooldown, group leader sync for non-AFK members on the same map). Landing on map change to a
   no-fly map is silent. Flying refuses ground NPC fights (`layer != 3`) with the Go `onRedMsg`. Client: body lifted 100 px with a tween,
   hit mask ignored in the air (straight-line moves), landing walks to the nearest walkable cell first, HUD minimap "Bay" button toggles
   (label "Xuống" while flying) with a 3 s click throttle.
8. `dressResCode` "none" is sent as omitted / negative, never 0 (client research §5.1 trap) — in H5 the shared `AvatarView` simply omits it.
9. New RPCs are not quiet.

## 3. Phases (each ends with `pnpm --filter @mc/shared build`, `pnpm -r lint`, `pnpm -r test`, docs)

### A — Appearance + flying
| Touch point | Change |
|---|---|
| `packages/shared/src/appearance.ts` (+ `protocol.ts`) | `AvatarView` (strings), `DRESS_POSITION 21`, `FLYER_POSITION 14`, `EquipOnPush.dressFlag: boolean`, `SetResPush`, `FlyerOnPush {cid, resCode, wavCode?}`, `FlyingPush {id}`, `SceneCharacter`/`PlayerData` appearance fields (`av` or legacy names per parent §4), `FLIGHT_*` constants |
| `server/src/modules/appearance/*` (new) | pure `appearanceOf(...)` resolver (research §7) + tests; `AppearanceService` (view of a character, dress look sync, flyer push, flying state + gates + group sync); `appearance.rpc.ts` (`beginFlying` `stopFlying` `fixFlyState` `setDressHide`) |
| `inventory/equipment.service.ts`, `weapon-look.service.ts` | positions 21 / 14 trigger the dress look sync / `onFlyerOn` (self + map); weapon look reused, not duplicated |
| `character/character.service.ts`, `scene/scene.rpc.ts`, `scene-transport.service.ts` | scene/login payloads carry the appearance view (costume, flyer, flying, mount); land on no-fly maps |
| `vip/pm-state.service.ts`, `vip/pm-transform.service.ts`, `dungeon/mehuyen/*` | transform keeps winning; revert pushes go through the resolver (body may be a costume, not the class body) |
| `combat` encounter / NPC fight entry | refuse ground fights while flying |
| `client/src/game/AvatarView.ts` (new), `Entity.ts`, `AppearanceController.ts` (new), `CharacterController.ts`, `StoreSystemsController.ts`, `DungeonController.ts`, `ui/hud/miniMap.ts`, movement | layers flyer → body (costume or class) → weapon (class body only) → flyer front (airborne only); mount rider; flying tween + straight moves + landing; handlers for `onEquipOn/Off (dressFlag)`, `onSetRes`, `onFlyerOn`, `onBeginFlying`, `onStopFlying`; "Bay" button |
| `ui/characterPanel.ts` | "Ẩn thời trang" checkbox (`setDressHide`) |

**Phase A status (2026-11-07): done.** Implemented: shared `appearance.ts` (positions, `AvatarView`, pushes, `FLIGHT_*`), `modules/appearance/` (resolver + tests,
service, flight service + rules + tests, RPCs `beginFlying` `stopFlying` `fixFlyState` `setDressHide`), equip hooks for positions 3 / 14 / 21, scene /
login `av` (costume, flyer, flying, mount), no-fly landing, ground-fight refusal, VIP / Mê Huyễn reverts through the resolver, `AvatarView` +
`Entity` + `AppearanceController`, "Bay" button + F key, "Ẩn thời trang" checkbox, `flyEffect` zoom, `MAX_SHEET_PX` guard removed. Deviations:
`dressHide` stays in `interfaceData` (not `Character.appearance`); `AvatarView` also carries `base` and `body`; no encounters in the air (instead of
the `with_cloud` pools); battle units still draw the class body. Details: `docs/memory/appearance.md`.

- [x] Shared contract  - [x] Server module + tests  - [x] Equip / unequip hooks  - [x] Scene / login payloads (+ mount)  - [x] Landing on no-fly maps
- [x] Ground-fight refusal  - [x] VIP / Mê Huyễn reverts  - [x] Client AvatarView / Entity / AppearanceController  - [x] Bay button + hide checkbox

### B — Dress system

> **Deferred** (user, 2026-11-07: "A xong là được rồi"). Not started: no `modules/dress`, `shared/dress.ts` or `ui/dress` exist. Phase A's
> `AppearanceService.fakeArts` hook is where the fake dress / fake flyer plug in when this resumes.
| Touch point | Change |
|---|---|
| `packages/shared/src/dress.ts` | `DressInfo`, catalog rows, every RPC reply type, constants (costs 30/288/300/2880, crystal 1 / jewel 5 gold, `DRESS_FREE_EXTRACT 1`, chip `num`) |
| `server/src/modules/dress/*` | `dress-rules.ts` (pure, tested: activate, draws, chips, transform, exchange, book bonus), `dress.service.ts` (feature store key `dress`, char-lock, conditional spends), `dress.rpc.ts` + `dress-recipe.rpc.ts`, `DressBonusProvider` (stat provider registry), gamedata accessors `dress`, `recipe` (cached) |
| `server/src/modules/forge/*` | fashion/flyer gate (decision 2) |
| `client/src/ui/dress/*`, `client/src/game/DressController.ts` | Tủ Đồ panel + Đổi bộ window + result popups, strings verbatim from research §3, opened from the character panel |

## 4. Verification

1. Unit tests: resolver (class / costume / hidden / fake / transform / flyer + fake flyer), flying gates, activate (auto-buy maths), draws
   (seeded rng), chips, transform (duplicates, picked), exchange validation, book bonus sums.
2. `pnpm -r lint`, `pnpm -r test` against the baseline.
3. Browser (dev GM `/grant equip <id>`): equip a fashion → body changes for self and a second client, persists after map change and relog;
   hide checkbox; equip a flyer at Lv 50 → "Bay" takes off (100 px lift, flyer under, front layer), move in the air, land; no-fly map refuses;
   Tủ Đồ: draw, merge chips, transform, activate (auto-buy), stats rise, fake look, Nhận gives the item.
4. Docs: `docs/memory/appearance.md` (new), `docs/memory/dress.md` (new), index lines; update `character-stats.md`, `activities.md` (mount),
   `settings.md` (dressHide), `forge.md` (gate).
