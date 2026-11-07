# Appearance + flying (M13 phase A, 2026-11-07)

Plan: `docs/plans/2026-11-07_02_DRESS_AND_FLYING.md` (phase A) under `docs/plans/2026-11-04_16_APPEARANCE_GEAR.md`. Research:
`docs/research/2026-11-07_04_DRESS_FLYER_CLIENT_RESEARCH.md`, `..._05_DRESS_FLYER_SERVER_RESEARCH.md`. Phase B (dress system: Tủ Đồ, fake
dress / fake flyer, dress-book stats) is not built yet; the resolver already has the slots for it.

## Contract (`packages/shared/src/appearance.ts`)
- Positions `WEAPON_POSITION 3`, `FLYER_POSITION 14`, `DRESS_POSITION 21`; `FLYING_STATE` (0 ground, 1 taking off, 2 in the air, 3 pre-landing,
  4 landing); `FLIGHT_HEIGHT 100`, `FLIGHT_MIN_LEVEL 50`, `FLIGHT_COOLDOWN_MS 5000`, `FLIGHT_BUTTON_THROTTLE_MS 3000`,
  `FLIGHT_FIX_INTERVAL_MS 30000`, `FLIGHT_LIFT_PX_PER_SEC 48`; `FLIGHT_TEXT` (refusal / button strings), `DRESS_HIDE_TEXT`.
- `AvatarView {res, base, body: 'class'|'dress'|'transform', wp, dress?, flyer?, flyerFront?, flying, mount?}` rides on
  `SceneCharacter.av` (scene rows, `createChars`, `onScenePlayerEntered`) and `PlayerData.av` (login). `resCode` / `wp` mirror `av.res` / `av.wp`.
  `wp` and `mount` are raw state: the client draws the weapon only on the class body, the mount only on the class body and on the ground.
- Pushes: `onEquipOn` / `onEquipOff` (`dressFlag` boolean: false = weapon, true = costume), `onSetRes {id, res, body?}` (absent `body` =
  transform, the legacy VIP push), `onFlyerOn {cid, resCode, wavCode?}` (`'-1'` removes), `onBeginFlying` / `onStopFlying {id}`.
  Dress look sync order (Go): `onEquipOn(dressFlag true)` or `onEquipOff(dressFlag true)` (+ weapon `onEquipOn` when bare), then `onSetRes`.
- RPCs (not quiet): `beginFlying`, `stopFlying`, `fixFlyState` (no args, reply null), `setDressHide(hide)` -> boolean.

## Server (`server/src/modules/appearance/`)
- `appearance-rules.ts` (pure, tested): `appearanceOf(LookInput)`. Body priority: transform > (dress hidden or no costume: class) > fake dress
  > worn costume. Fake dress / fake flyer only replace something that is worn (`AppearanceService.fakeArts` returns none until phase B).
- `appearance.service.ts`: reads worn items (positions 21 / 14 via `CharacterItem`), class body, `PmStateService.activeTransform`, the
  `mount` feature (riding skin art through `mountTables` / `ownedDresses`), weapon through `WeaponLookService.weaponRes`; builds `av`
  (`decorate(sc, mapId, settle)`, `loginExtra`), pushes (`pushWeapon`, `syncDress`, `pushFlyer`, `pushRes`), `isFlying` (cached) and
  `setDressHide`. `settle` (scene entry of the owner only) grounds a persisted flying flag when no flyer is worn, level < 50 or the map is
  no-fly (silent, persisted).
- `flight-rules.ts` (pure, tested) + `flight.service.ts`: gates in the Go order (level + flyer, group member without a flyer, no-fly map,
  5 s cooldown; refusals `onMidNote` / `onRedMsg`, a refusal does not restart the cooldown). A leader toggle sets every non-AFK member on the
  map (no gates); a follower's own toggle answers `onMidNote` "Đã ở trong nhóm...", `fixFlyState` aligns a follower with the leader.
  Flag persisted at `Character.appearance.flying`; the cooldown map is in memory; each character is serialised with `withCharLock`.
- `appearance.module.ts` imports `InventoryModule` (not the reverse): `EquipmentService` calls `EquipHooks.changed(cid, position)` after the
  lock (`inventory/equip-hooks.ts`), the module registers `onEquipChanged` (3 weapon, 21 costume, 14 flyer). Login `av` through
  `CharacterService.addLoginExtra`. Imports must stay a leaf for Inventory because CharacterModule -> QuestModule -> InventoryModule.
- Consumers: `SceneRpc.createChars` / `SceneTransportService` use `appearance.decorate`; `PmTransformService` and `MeHuyenCurseService`
  revert / curse through `appearance.pushRes` (the resolved body, so a costume returns after a transform); `SettingsRpc.us` calls
  `onSettingsSaved` (a saved `dressHide` runs the look sync); `CombatRpc`: `cbom` does nothing while flying (flying encounter pools,
  `with_cloud`, are not ported) and `hitNpc` / `clickBoss` answer `onRedMsg` FLIGHT_TEXT.GROUND_FIGHT when the NPC template layer is not 3.
- `dressHide` lives in `Character.interfaceData.dressHide` (0 / 1, the system-settings key), not in `appearance` (parent plan deviation).
  `GameDataService.TEMPLATE_FIELDS` gained `res_code` and `wav_code` (flyer art).

## Client
- `game/AvatarView.ts`: layers flyer (airborne only) -> body (mount sheet replaces it while riding) -> weapon (class body, not mounted) ->
  flyer front (airborne only). Missing sheet falls back body -> `base` class body -> portrait marker. Clip choice: dir 0 of most sheets is
  stored under the Chinese `order[0..7]` names (`SheetAnim.orderLabel`), in the air the body breathes and the flyer plays `behavior % 8`,
  mount sheets use behaviours 8 / 9 / 10. The old `MAX_SHEET_PX` guard in `Entity` is gone (paged WebP atlases; mount rider renders).
- `game/Entity.ts`: owns an `AvatarView`; `applyScene(sc)`, `beginFlight` / `endFlight` (lift tween `FLIGHT_LIFT_PX_PER_SEC`), `flyingState`,
  `airborne` / `freeFlight` (straight routes), labels / markers follow the lift.
- `game/AppearanceController.ts`: handlers for all look pushes (replaces the weapon handlers of `CharacterController`, the mount handlers of
  `StoreSystemsController` and the `onSetRes` handler of `DungeonController`); `toggleFlight` (3 s throttle; followers call `fixFlyState`);
  landing walks a straight line to `HitMask.nearestWalkable(radius 800)` and then calls `stopFlying` (back to "in the air" if no
  `onStopFlying` within 2.5 s); `zoomStep` = `flyEffect` camera zoom 0.7 over about 2.1 s (not during a battle).
- `GameScene`: movement ignores the mask while `freeFlight`; HUD "Bay" button (`miniMap.ts`, label "Xuống" while airborne) and the `F` key
  (`MainHud.onFly`); character panel "Ẩn thời trang" checkbox next to the costume slot (`setDressHide`, mirrors `interfaceData.dressHide`).

## Verification (2026-11-07)
- Unit: `appearance-rules.test.ts` (9), `flight-rules.test.ts` (5).
- ws e2e (two local test accounts, level 50, GM): flyer equip -> `onFlyerOn` (self + peer), refusal without flyer, take-off -> `onBeginFlying`,
  cooldown `onRedMsg`, `cbom` ignored in the air, `hitNpc` (layer 1) refused in the air, costume equip -> `onEquipOn(dressFlag true)` +
  `onSetRes(dress)`, `setDressHide` on / off, unequip, landing, persisted flag false, relog while flying -> `av.flying true`, no-fly map
  (2002) lands silently, transform in `character_vip` -> `av.body 'transform'`, mount riding -> `av.mount`.
- Browser: costume body drawn, flyer (dragon) under the lifted body, straight walk in the air, landing at the nearest walkable cell,
  "Bay" / "Xuống" label, camera zoom while airborne, mounted rider sprite, hide checkbox swaps to the class body.

## Deferred / notes
- Not done: battle units still draw the class body (`BattleUnit`), peers' 0.9 scale while self is airborne, wings, fairy, deco, rebirth
  look, double fly, flying encounter pools, F-key conflict check, `onFixFlyState` (unknown body), fake dress / fake flyer data (phase B).
- A hidden browser pane renders at about 1 fps (Pixi caps the frame step), so the lift / landing tweens look very slow there.
- `Entity.ts` (394 lines) and `GameScene.ts` (451) are over the size guideline; a follow-up should move the chat / speech-bubble code of
  `Entity` and a few controller wirings of `GameScene` out.
