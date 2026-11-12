# Forge (M5): crafting, mixing, equipment upgrades

Plan: `docs/plans/2026-11-04_06_ECONOMY.md` (phases C and D; the implementation notes include the gem chain list). Implemented 2026-11-04.
Shared `forge.ts` (~320 lines); server `modules/forge/`; client `game/ForgeController.ts` and `ui/forge/*`.
The forge window "Tạo" (top row in Flash order: Trang bị, Cải tạo [Thăng tinh, Khảm nạm, Thăng cấp, Tinh luyện, Phân giải], Ng.liệu, Bảo thạch, Thần khí → opens the Thần khí window, T.bị pet) opens from the HUD "Chế tạo" button (craft tab) or the "Luyện" button (star tab).

## Equipment instance (`character_items.properties`, `star`)
- Instance fields: `quality, prefix, element, makerName`, main/sub/bind lines, `holeNum`, gems `t1..t10`, soul `activeProp/activePropNum`.
- Stats read the instance lines and fall back to the template (`equip-stats.ts`).
  - The star multiplier `[1, 1.1, 1.21, ...]` applies to main lines.
  - Gems map through `prop_type`/`propl_num` and the shared `EQUIP_PROP`; they are flat and not star-multiplied.
  - The soul is stored and shown in the tooltip but has no stat effect (in Go it only feeds set bonuses).
- Every change to worn gear pushes `onAddCharactorSlot` plus the stat-refresh `onUPP`.

## Crafting and mixing (phase C)
- Recipes are equipment templates with `makable == 1` and `require_item1..3`. Calls: `getMakeRecipes` (H5 helper), `getMakeColor` (preview) and `newMake` (awaited `{flag}`).
  - Rates come from the material ColorCode levels. Recipes 1001+ (jewelry, Lv 66+) use `data_tbl_recipe_plan`; the remainder of its rates is failure.
  - Materials are consumed even on failure. A success rolls quality/prefix, the `EQUIPT_QUALITY` line multipliers, 1–3 holes (40/35/25 %), an element and the maker name.
- Client craft tab (`ui/forge/craftTab.ts` + `craft.css`, pure CSS, no skin bitmaps) mirrors the Flash layout: kind/type tree (`AUCTION_KINDS` 1–4), recipe list, "Chọn nghề" class dropdown (`CLASS_NAMES`, default = all), Vật phẩm / Nguyên liệu cần / Đặt nguyên liệu cells, "Tự đặt ng.liệu" autofill (selecting a recipe no longer autofills), four quality-rate boxes (0% until getMakeColor confirms; Flash cleanMake), class filter trims weapon/off-hand types in the tree (makeTreeChange2), required cells use `MakeRecipe.materials[].iconCode`, a 2 s progress bar and "Chế".
- `materialMixOne` / `All(num 2..5, ref, tempBagFlag)`: rate `num × (ColorCode==4 ? 6 : 20)` %. A ColorCode-5 stack is refused (Go burned it). Temp-bag refs are refused.
- `jewelUpdateOne` / `All`: gem tier upgrade, rate `num × 20` % along the chains. The top tier is refused.

## Upgrades (phase D)
- Star: `starOne(count, equipId, stoneId)`, `starAll(count, equipId, maxTarget, stoneId)`, `getStarNum`.
  - Costs stone 5. Rate table indexed like the client display: 100, 100, 90, 80, 70, 60, 50, 30, 30, 30.
  - **A failure keeps the star** (H5; Go's reset at ≥ 8 was invented).
- Sockets and gems:
  - `holeDig(diamondId, equipId)`: the equipment must be bound and the diamond (16) colour ≥ `floor((hole-1)/2)`. Costs 2000 silver; max = template `hole_num` or 10.
  - `jewelSet(equipId, {slot: {idx}})`, `jewelDel(equipId, slot)`: the remove fee is `round(gold × 0.2)` silver; the gem returns bound.
- Refining: `changeElement/Bind/Soul/Prefix/Name` plus `sureChange*`.
  - Element, bind and soul charge at the preview (no refund on reject). Prefix charges at the confirm (Go).
  - Name applies at once (no sure step) and needs bound gear of colour ≥ 4.
  - Previews are held in memory (`refine-pending`) and cleared on disconnect.
- `bindItem`.
- `changeLevel({e,i1,i2,i3})`: tier upgrade in place (same id and slot); cost `next.req_level² × 10`; resets stars, holes and gems.
- `equResolve(equipId, pw)`: returns bound materials. Worn gear is refused.
- `getUpgradeInfo`: an H5 helper so the client needs no template tables.

## Deferred
Cooking and medicine (life skills, M8), runes and deco, soul set bonuses, the star buff table (buff 3263), the orange-item broadcast. Quiet the RPCs after the user confirms.

## Pet gear upgrades (M12 slice 5)
Same module, no new panel yet: `pet-gear-ops/up/mod`, `sublime`, `pet-gear-repair` services and `pet-gear-up.rpc.ts` (petEquLevelUp, petEquModColor, petEquModBind / surepetEquModBind, petEquModPre / surePetEquModPre, sublimePetEquip, onValidateSublimePet, restrainPetEquip, onValidateRestrainPet, repairPetEqu, repairPetEquAll). Pure `sublime-rules.ts` is character-ready (M13.4: pass `GameDataService.sublimeRow(false, level)`); bind / pre previews share `RefinePending` (kinds petBind / petPre). Details: `docs/memory/pet-depth.md`.

## Pet gear tabs in the forge window (M12 client C4)
`ForgeTab.group = 'pet'` tabs (`ui/forge/petGearTab.ts`, `petLevelTabs.ts`, `petModTabs.ts`, `petSublimeTabs.ts`) are appended in `FORGE_TABS`; `ForgePanel` shows one group at a time with a switch button. `ForgeHost.petGear()` is the host list for them (bag, pet item page, worn by pets); materials reuse `MaterialSlots`. `EquipPicker(sticky)` keeps a selection across the delete/re-add pair a tier-up pushes. Details: `docs/memory/pet-depth.md`.

## Fashion / flyer gate (M13 phase B, 2026-11-09)
`ForgeItemsService.equipRow` refuses kind 10 / 11 and position 14 / 21 equipment for every mutating call (star, hole, socket, upgrade, prefix, element / bind / soul, name, resolve) with "Thời trang và vật phẩm bay không thể thăng cấp / thăng tinh / đục lỗ / khảm nạm."; info calls pass `gate = false`, `bindItem` calls `refuseDressGear`. See `dress.md`.

## Equipment depth (M13 phase D, 2026-11-09)
Character Thăng hoa / Khắc chế, Kỳ Linh / Trùng Chú and the jewel exchange (`pmJewelExchage`, `MixService.exchangeJewel`, add before remove) live in this module: `equip-sublime.*`, `qiling.*`, `qiling-rules.ts`,
`equip-sublime-rules.ts`. State on `properties.sublime` / `properties.qiling`; `TierService` keeps both through a tier upgrade (`keptProperties`); `ForgeMoneyService` has mode `'gold'` (plain Vàng). The forge window gained
the tabs Thăng hoa, Khắc chế, Kỳ Linh, Trùng Chú (group Cải tạo) and Đổi bảo thạch (group Bảo thạch). Details: `docs/memory/equip-depth.md`.
