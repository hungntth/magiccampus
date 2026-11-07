---
name: dress-flyer-client-map
description: Tủ Đồ (dress) + Phi hành (flying) file cluster, non-obvious client facts (dressResCode 0 quirk, unset* RPCs, dead push names)
metadata:
  type: reference
---

- Dress cluster: `compDragable/DressPanel.as` (4 tabs, all RPCs), `DressDisplay.as` (fake look / "Nhận"), `DressBag.as` (chips, `makeAllChips`),
  `DressLogic.as` (single responder `updateDressInfo`), `RecipeExchangePanel/RecipeItem` (Đổi bộ), `RecipeAlertFree/Ten`. Strings = `Language.DRESS_PANEL[0..55]`
  (`Language.as:7772`, `:9434-9440`) plus INLINE strings "Hình ảnh ảo hoá", "Bỏ ảo hoa", "(Có bộ)", "(K.Hoạt)".
- Fake flyer RPCs are `setFakeFlyerDress` / `unsetFakeFlyerDress(dressId, resCode, wavCode)` (DressDisplay.as:593-597); not in the older notes' short lists.
- `dressInfo` is a string re-quoted by `JSONUtil.JSONfy` (all scalars become strings); `recipe` holds both sets and chips keyed by recipe id.
- `dressResCode` quirk: `DynamicItemContainer.addC` treats <= 0 as none, `CreatureView.setCharGraphic` (9078-9088) treats only NaN / < 0 as none; 0 hides the weapon and the class tint.
- `onUpdateDressInto` (Go admin push) is NOT in the real CallBack method list; `DressPanel.onUpdateDressInfo` and `dressActiveValidate` have no caller in the decompile. `resetDressHide` is in the list with unknown body.
- Flying: state machine in `object/Creature.as:160-380`, tween in `CreatureView.playFlying` (8215), flyer art `setFlyerGraphic` (6896, under body at child index 0) / front (8056, on top, only while airborne). HUD button `MiniMapCanvas.flyBtn` is never hidden and has no level / flyer / flyable check client-side; those texts are Go server strings. `EnterFrameMove` not decompiled (timings inferred).
- Full output: `docs/research/2026-11-07_04_DRESS_FLYER_CLIENT_RESEARCH.md` in the mc-game-new repo.
