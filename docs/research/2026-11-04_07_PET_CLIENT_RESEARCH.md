# M4 Pets - legacy Flash client research

Scope: decompiled client at `D:\mcgame\docs\client` (paths below are relative to it). Read-only. `system/CallBack.as` is an
aborted stub (`system/CallBack.as:1-14`), so every push *name* below is taken from the panel method that consumes it (handler
signatures live in `PetManagerPanel`) and the push *wire shape* is **inferred** unless a consumer proves it. The Go notes
(`D:\mcgame\docs\memory\pet-system.md`, `pet-guard.md`) were verified against the client; discrepancies are listed in section 8.

## 1. Summary

Pets are creatures (`TBL_CREATURE`, table id 12) owned by the player. The pet list is fetched once at login by
`PetManagerPanel.initView()` -> RPC `initViewPetMngP` and kept in `_core.player.petList` keyed by pet id. Exactly one pet may be
the **battle pet** (`state == 1`), shown in the HUD `PetCanvas`; one pet may **follow** the player on the map (separate
`startPetFollow`/`cancelPetFollow`, scene pushes). Pets are acquired by catching in battle (`CATCH -70`), quest awards
(kind 2), item bags (server-side, via `useItem`) and shop/other flows; each arrives as push `onAddPet`. Exp is **cumulative**
and level is always derived client-side from exp via `GamePredef.PET_LEVEL_EXP`.

## 2. Key files

| File | Role |
|---|---|
| `view/view/compDragable/PetManagerPanel.as` (11701 lines) | pet list/detail/stats/skills/equip panel (`PANEL_PETMANAGER` = 265, `view/ViewManager.as:105`); owns the pet-list push handlers |
| `view/view/compMain/PetCanvas.as` | HUD widget under the portrait (`MAIN_PET`): icon, name, level, HP bar, MP bar (no exp bar) |
| `view/view/compBattle/PetCmdCanvas.as` | in-battle pet command menu (`cPetCmd`) |
| `view/view/compBattle/BattleStage.as` | builds battle views from `cList`; `checkPet`, `setBattlePet`, auto-DEFENCE when player dead |
| `logic/Battle.as` | `battleCmd` (command batching), `battleSendCmd`, `battleGetPlayerPet` |
| `view/view/compGameStage/BattleCreatureView.as` | catch click gating (`ST_BATTLE_CATCH`), `checkCatchValid` |
| `view/view/compGameStage/PetView.as`, `DynamicItemContainer.as`, `ItemContainer.as` | follow-pet sprite on the map |
| `system/Core.as` | `createPet`, `createCharactor`/`createPlayer` (showPetObj), `getShowPetId`/`setShowPetId`, `battlePet` |
| `object/Pet.as`, `object/Creature.as` | client pet object (type 39), base creature fields |
| `logic/PetLogic.as`, `predef/GamePredef.as` | exp<->level helpers and constants |
| `view/view/compDragable/PetPanel.as` | battle/skill pet detail panel (`PANEL_PET`), skill slots, `petUpSkill/petDelSkill/petOpenSkill` duplicates |
| `view/view/compDragable/PetFuncPanel.as` | growth tools: star, join (fuse), eat, xd, xsd, pzxsd, book, starClear |
| `view/view/compDragable/PetEvolutionPanel.as` | contract (khe uoc), evolution, feather |
| `view/view/compDragable/MountPanel.as`, `object/Creature.as` | mounts / flying |

## 3. Language strings (`config/Language.as`, Vietnamese exact)

`PETMANAGERPANEL_S` (lines 1750-1776): [0] "Tên mới pet: " | [1] "Đổi tên pet" | [2] "Không thể triệu hồi pet có cấp độ cao hơn cấp độ nhân vật 5 cấp!" |
[3] "Không thể triệu hồi pet có cấp độ cao hơn nhân vật!\nNgười chơi cần đạt cấp {useLv} mới có thể thuần phục pet." |
[5] "Pet này sẽ bị khóa, xác nhận cho tham chiến?" | [6] "{petName} nhận được {exp} kinh nghiệm" | [8] "Cấp độ của {petName} tăng lên cấp {newLv}!" |
[10] "Nhận được 1 pet: [@" | [11] "Đã khóa" | [12] "Chưa khóa, nhấp chọn icon để khóa pet" | [13] "Cấp: " | [14] "Xác nhận phóng sinh pet này?" |
[15] "Mất 1 pet: [<font color='{color}'>{petName}</font>]" | [16] "Đấu" | [17] "Nghỉ" | [18] "Thả" | [19] "C.tiết" | [20] "Đổi tên pet" | [21] "Dùng vật phẩm" |
[22] "Xóa pet" | [23] "Hiển" | [24] "Vui lòng không thực hiện liên tục các thao tác với pet" | [25] "Thu hồi" |
[26] "Khi bạn sử dụng Sách Triệu Hồi, thần thú đã khóa của bạn (phẩm chất tím hoặc cam) sẽ được triệu hồi ra và đi sau nhân vật của bạn!" |
[27] "Khi cấp độ pet chiến đấu hiện tại quá cao thì nếu người chơi không thăng lên cấp cao hơn sẽ không thể gọi ra được, xác nhận đổi pet chiến đấu?" |
[28] "M.Hồn" | [29] "Xác nhận khóa {petName}?"
`PETPANEL_S` (1777-1794): [0] "Cấp độ cường hóa: {upgradeNum}" | [1] "Xác nhận xóa kỹ năng" | [2] "Xóa kỹ năng pet cần " | [3] "Kỹ năng này đã đạt cấp cao nhất!" |
[4] "Xác nhận thăng cấp kỹ năng {skillData.name}?" | [5] "Thăng cấp kỹ năng này cần {petSkillUpItem} x 1!" | [7] "... x 3!" |
[8] "Xác nhận trả {num} vàng để mở ô kỹ năng này?" | [10] "Mở ô kỹ năng này cần {num} vàng hoặc kim phiếu!" | [12] "Hệ số cơ bản" | [13] "Hệ số cường hóa" |
[14] "Tư chất cơ bản" | [15] "Tư chất cuối" | [16] "Tư chất ảo hóa" | [17] "Tư Chất Vũ Hóa".
Battle/catch: `BATTLECREATUREVIEW_S[0]` (2035) "Pet đã đầy!" | `[1]` (2036) "Pet cao hơn bạn 5 cấp, không thể bắt!" |
`BATTLESTAGE_S[13]` (748) "Điểm bắt Pet của bạn là{num}，quá thấp nên không thể bắt Pet." | `[14]` (749) "Bạn có {rate}% xác suất bắt được pet này, tiếp tục cố gắng nào." |
`TIPCRE_S[1]` (577) "Không thể bắt" | `[10]` (586) "Độ khó bắt: " | `[15]` (591) "Độ khó bắt pet:{value}" |
`MAILPANEL_S[101]` (1641) "Bạn không có đủ chỗ trống trong túi pet!" (quest pet-slot gate) | `PETCMDCANVAS_U[0..6]` (3217-3223) "Kỹ năng","Vật phẩm","Phòng ngự","Tấn công","Vị trí","Pet","Bỏ chạy" |
`PETCANVAS_S[4]` (2172) "Nhấp xem thông tin chi tiết" | `[5]` "Vật phẩm pet sử dụng" | `[6]` "Tiểu \nTinh \nLinh".

## 4. Pet data model (client)

### 4.1 Where the list comes from
- `Core.initMainUI()` (`system/Core.as:1458-1469`) calls `view.initView(PANEL_PETMANAGER)`; `PetManagerPanel.initView()`
  (`PetManagerPanel.as:8972-8982`) sends `_core.remote.call("initViewPetMngP", new Responder(onInitViewPetMngP))` (**no args**, awaited).
- `onInitViewPetMngP(obj)` (`:10805-10835`): iterates `for each (p in obj)` (so a map/array of wrapped pets); for each pet copies
  every key of `p.data` onto `p` except `"pi"` and `"soulInfo"`, then `delete p.data`. Because `pi` (`:8696-8720`) and `soulInfo` (`:11352`) are read from the pet
  root afterwards, they must be sent as **siblings of `data` on the wrapper** (`{id, pi, soulInfo, data:{...}}`) - **inferred**; if they were inside `data` they would be dropped,
  sets `p.creatureData = getGameData(TBL_CREATURE, p.data.tid)`, stores `_core.player.petList = obj`. All later pushes index
  `petList[petId]`, so the container must be keyed by pet id (`petList[id]`), as the Go note says.
- Add: push `onAddPet(petWrapper)` (`:11407-11434`): same unwrap (`data.*` -> root, `creatureData`), `petList[p.id] = p`, system blue msg
  `PETMANAGERPANEL_S[10]` + link `[@PET|<id>|<creature name>|<colorIdx>|0|0]`, `updateView()`.
- Delete: push `onDelPet(petId)` (`:8948-8970`): msg `[15]` colored by `growRate`, `delete petList[id]`, `updateView()`, bag `petInit()`.
- Counts: `Player.petMaxNum` (`object/Player.as:95`), `getPetNumAll()` counts non-null petList entries (`:2381`),
  `enoughPetSlot(n)` = `petMaxNum - count >= n` (`:263-270`). Manager shows `count/petMaxNum` (`PetManagerPanel.as:8306`).
  `petMaxNum` is set by `onUPP({petMaxNum})` (Go note; the push body is not visible in the client - **inferred**).
  Bag pet grid: `MAX_PET_PER_PAGE = 18` (`predef/GamePredef.as:1454`); manager list page = 10 (`PetManagerPanel.as:102`).

### 4.2 Pet object fields read by the client (root level after unwrap)
| Field | Type | Evidence |
|---|---|---|
| `id` | number | list key, all RPCs |
| `tid` | number (creature template id) | `:8188`, `:9371` (`gameData[TBL_CREATURE][tid]`), `Core.getPetNum` |
| `petName` | string | list text `:8185`, `:9238`, `Core.as:1030` (NOT `name`) |
| `exp` | number, **cumulative** | `PetLogic.expToLv(exp)` everywhere; level is never read from server (`selPetData.level = expToLv(exp)` `:8888`) |
| `growRate` | number | colour: `Basic.colorByGrowRate` (`logic/Basic.as:127-138`) over `PET_GROWRATE_NUM=[1.1,1.3,1.6,2,2.5]` (`GamePredef.as:1459`) -> idx 0..4, fallthrough 4 |
| `state` | 1 battle, 2 follow icon, 3 rest | `:8162-8181`; icons `ICON_PET_BATTLE/FOLLOW/STANDBY` |
| `binded` | 0/1 | `:9379`, `:8878` |
| `currentHp`, `currentMp` | number | `:8865-8872`, `PetCanvas.as:673-674` |
| `life` | number (shown in panel as text) | `:8894` |
| `close` | number (intimacy, shown) | `:8893` |
| `element` | int | `ResManager.ELEMENT_KIND[element]`, `ELEMENT_INFO` `:8876` |
| `colorCode` | number (override of creature colour) | `:8858` |
| `aptStrength/Agility/Stamina/Intelligence/Energy` | number | root, `:4207-4211` |
| `aptStrengthEx..aptEnergyEx` ("ảo hóa") | number or absent | `:4212-4216` |
| `upgradeNum` | 0..12 stars | `:4251-4259` |
| `skill1..skill15` | -1 locked, 0 empty, >0 skill template id | `drawSkillSlots :8015-8082` |
| `equ1..equ8` | item instance id >0, else empty | `:4266-4286`, `GamePredef.PETEQU_NUM = 8` (`:1413`) |
| `pi` | object, per-pet auto-battle settings (`bs2..bs10`, `p6..p9`) | `updatePetAutoBattleSet :8696-8720` |
| `soulInfo` | object (`.data`) | `:11352` (pet soul; deferrable) |
| `property` | object | `finalHp/finalMp/finalSp/finalAttack/finalMAttack/finalDefence/finalMDefence/finalHit/finalCritical/finalDodge/finalSpeed/finalStrength/finalAgility/finalStamina/finalIntelligence/finalEnergy/lastPoint/growRate/growRateAdd/apt*Evolution` (`:8864-8908`, `:4206-4250`); detail keys `PROP_INT_KEY_ARR` (19: finalCombo, finalCounter, finalRebornRate, finalBreakReborn, finalDefy, finalResiDefy, finalResiCritical, finalDizzy, finalConfusion, finalSleep, finalPoison, finalRage, finalLight, finalResiDizzy, finalResiConfusion, finalResiSleep, finalResiPoison, finalResiLight, finalResiRage) `:3953`, `PROP_PER_KEY_ARR` (finalReduceHurt1/2, finalEnhPhyHurt, finalEnhMagicHurt, finalPraDef, finalPraMagDef, finalCriticalDamage) `:3954` |
| `creatureData` | client-built from `TBL_CREATURE[tid]`: `resCode, iconCode, colorCode, classId (1..7), qLevel (1..3), useLv, name` | `:8853`, `:8874-8875`, `PetCanvas.as:665-667` |

Derived (client formulas, do not need server): level = `expToLv(exp)`; in-level bar = `exp - lvToExp(level)` / `lvUpExp(level)` (`:8891`).
`PET_LEVEL_EXP` table is the client constant `predef/GamePredef.as:8838-` (index = level-1; `PetLogic.as:14-44`):
`lvToExp(L)=PET_LEVEL_EXP[L-1]` (0 if L<=0), `expToLv(e)`= first index i with `e < table[i]` (that index is the level) else table length, `e<=0 -> 1`,
`lvUpExp(L)=table[L]-table[L-1]`. Table starts `[1, 37, 179, 463, 888, ...]`, 160+ rows (rows to 94838109102 seen at `:8997`).
Attribute final display formula in client: `final apt = round((apt + evolution + aptEx) * (growRate + growRateAdd))` (`:4207-4221`).

### 4.3 Client-side attribute points
`changeProperty()` (`:10307-10332`) sends fire-and-forget `changePetProperty(petId, {addStrength, addAgility, addStamina, addIntelligence, addEnergy})`
whose values are **strings** from text fields (may be `""`); `Multiple` step buttons add up to `Multiple` (default 1; checkbox `AddMultipleCheck`) bounded by
`attLastPoint` (`:9899-9935`). Whole panel stats refresh through `onUpdatePet(...)` + `onRefreshPetProp` (Go sends keys `attLastPoint`, `apt*Ex`
via `onUpdatePet` then `onRefreshPetProp`; client handles any key generically).

## 5. Flows

### 5.1 Battle pet (state) - `PetManagerPanel.changePetState` (`:10883-10942`, `_changePetState :9358-9406`)
1. Button `stateBtn` (`__stateBtn_click :9107`) toggles: selected state==1 -> target 3 ("Nghỉ" ... label shows the action), else target 1.
2. Client gating before target 1 (`:9364-9390`): `expToLv(exp) - 5 > player.level` -> Alert S[2] and stop; creature template missing or
   `useLv > player.level` -> Alert S[3]; `binded == 0` -> confirm Alert S[5] (YES -> `stateHandler :10168`); then **client** sends
   `changePetState(otherPetId, 3)` for every other pet with state 1, then `changePetState(petId, 1)`.
   Server must therefore accept the demote-then-promote pair; it does not need to demote itself (but the Go note says it does not either).
3. Rest (target 3): optional Alert S[27] if the current battle pet is >5 levels over the player; sends `changePetState(id, 3)`.
4. Target 2 branch exists (`:9394-9403`) but no UI reaches it in this file (**unconfirmed use**).
5. RPC `changePetState(petId:number, state:number)` is fire-and-forget (`_core.remote.changePetState`, `:9388,9400,9405`). Result is pushes:
   `onUpdatePet(petId, "state", n)` (+ `onUpdatePet(petId,"creatureData",...)` per Go note; client rebuilds `creatureData` itself in unwrap, but
   `updateView` skips pets without `creatureData` `:8159`, so any pet created by `onUpdatePet` after unwrap keeps it).
6. `updateView(petId)` (`:8133-8425`): sets `_core.battlePet` = the pet with `state==1` (needs `creatureData`), calls `MAIN_PET.showPet(pet)` via
   `showMainPetCanvas :7229-7246`, and refreshes the bag pet tab. If no pet has state 1, `showPet(null)` shows the default icon.
7. Quest 4 tutorial: `QuestPanel.callGuide` (`QuestPanel.as:766-776`) -> 500 ms later `setFirstPetActive` opens the manager and calls `changePetState(1)`
   on whatever is selected (`:855-860`). So after the quest-4 pet award (kind 2) the server must have pushed `onAddPet` before the client reaches it.

### 5.2 Follow on the map
- Button `showPetFollowBtn` ("Hiển"/"Thu hồi", `PETMANAGERPANEL_S[23]/[25]`, `switchFollowButton :8666-8678`) -> `changePetFollow :11549-11567`:
  if `petId != Core.getShowPetId()` -> `startPetFollow()` else `cancelPetFollow()`; button disabled for 5 s (`Timer(5000,1)`).
- `startPetFollow` (`:11323-11328`): awaited `remote.call("startPetFollow", Responder(startPetFollowHandler), petId:number, currentShowPetId:number)`.
  Responder: any truthy result -> `_core.setShowPetId(petId)` + button state "Thu hồi" (`:11673-11680`). Falsy -> nothing happens.
- `cancelPetFollow` (`:4452-4456`): awaited `call("cancelPetFollow", Responder(cancelPetFollowHandler), showPetId)`; truthy -> `setShowPetId(-1)` (`:7345-7352`, `Core.as:1807-1814`).
- Also fire-and-forget `cancelPetFollow(showPetId)` from `Core.createPlayer` (`Core.as:1221-1224`) when the self player is created with **neither buff 1709 nor 1979**
  (`SHOW_PET_BUFF`, `SHOW_PET_BUFF2`, `GamePredef.as:1981-1982`) and `player.pmLevel` falsy/0. So the client expects a follow pet to be backed by buff 1709/1979 (item
  "Sách Triệu Hồi", S[26]) or VIP level (pmLevel). Go does **not** enforce this (grep for 1709/1979 in Go: none). Treat as optional gate.
- The map sprite is **scene-driven** (no consumer of `onCreatePet`/`onCancelPet` in the client files - handlers are in the stubbed CallBack; names from Go
  `handlers/pet/helpers.go:134-153`, **inferred**): `ViewManager.addP(pet)` stores `_pDict[pet.cid]` (`view/ViewManager.as:945-948`), `removeP(cid)` destroys (`:620-626`).
  So `onCancelPet(ownerCid)` / `onCreatePet({cid, petData})` -> `Core.createPet(petData)` (`Core.as:654-659`: `new Pet(); pet.data = obj` copies only keys that exist on Pet/Creature)
  then `view.addP`.
- Other players: `Core.createCharactor` (`Core.as:814-850`) and `createPlayer` (`:1204-1237`) read `data.showPetObj` from the scene/character object and add the pet after
  the character is added; skipped if character is in a group and not `groupAfk` (`:838-841`, `:1217-1220`). For the self player it additionally requires
  `getShowPetId() > 0`. The client never initialises `_showPetId` from login data (`setShowPetId` is only called from the panel, grep-verified), so after relogin it is `NaN`:
  self pet is not drawn until the player toggles the button again (**inferred runtime consequence**; the button then sends `startPetFollow(petId, NaN)`).
- Pet scene object fields consumed: `cid` (owner; required, `Pet.cid`), `leaderId` (optional; if >0 pet spawns at that charactor's pos `DynamicItemContainer.as:126-135`),
  `name` (shown yellow + green line `Language.CREATURE_VIEW_U[0]` with owner name, `CreatureView.as:7014-7024`), `tid`, `id`, `level`, `resCode`, `colorCode`, `element`,
  `petTrendAction` (1 = begin flying cloud, 2 = stop). Pet extends `Creature` (`object/Pet.as:10`), so any `Creature` field (`resCode`, `iconCode`, `colorCode`, `hp`, ...) is accepted.
- Map behaviour (`PetView.followHandler`, `compGameStage/PetView.as:33-81`): each frame, moves toward owner's view if distance > `GROUP_PET_FOLLOW_DISTANCE = 100`
  (`GamePredef.as:37`; `GROUP_FOLLOW_DISTANCE_FLYING = 120` when pet `flyingState != ON_GROUND`); step = `_speed`, scaled by frame delta if <=40 ms; idle -> `BH_BREATH_SLOW`.
  Spawn position (`DynamicItemContainer.setPetPos :124-210`): behind owner by 100 px opposite to facing `dir` (0..7; diagonals use 100/1.4). Layer: ground pets in `midLayer`,
  flying owners -> `flyLayer`, with cloud sprite (`ItemContainer.addP :179-210`).
  Pet follows `CharactorView` of `cid` (`startFollow`, `CreatureView.as:7995-8010`). No movement RPC for pets: purely client simulation.

### 5.3 Rename / release / bind
- Rename: `changePetName(petId, newName)` fire-and-forget (`:10842-10870`). Client validates `haveSpecialStr`/`haveBadWord` (Alert `CHARACTORPANEL_S[11]`), skips if equal to current;
  empty string means reset to creature template name (`TBL_CREATURE[tid].name`). Result: `onUpdatePet(petId, "petName", name)` (inferred; client has no other path).
- Release: `deletePet()` (`:11341-11394`): refuses if any `soulInfo.data[i]` truthy (Alert `PET_SOUL_S[50]`); confirm S[14]; if `growRate > PET_GROWRATE_NUM[1]` (1.3) asks
  password -> `delPetByClient(petId, md5(password))` else `delPetByClient(petId)`. Fire-and-forget; result push `onDelPet(petId)`.
- Bind (lock): icon click `__bindImg_click` -> `bindedPet()` (`:10450-10473`), only when `binded == 0`; confirm S[29]; `call("bindedPetByPlayer", null, petId)` (no responder).
  Result: `onUpdatePet(petId, "binded", 1)`. Binding is irreversible in the client (no unbind UI).
- Pet details: `getPetDetailData(cid, petId)` (`DetailPropPanel.as:2063`) awaited, for inspecting.

### 5.4 Items on pets
- `useItem(targetType, petId, slotId)` (`object/Player.as:927-948`): `targetType` 1 = character, 2 = pet (`GamePredef.MOUSE_TARGET_PET`, `:1007`). Pet is the battle pet
  (`_core.battlePet.id`) or the pet shown in the open manager. Client checks (`Player.as:872-890`): item `useType` must be 2 or 3; pet level (`expToLv(exp)`) >= `tData.reqLevel`
  (else `PLAYER_S[7]`); pet equipment (kind 9, position 50..57) forces target = pet and needs a pet selected (`PLAYER_S[26]`).
  `useMultiItem(targetType, petId, slotId, count)` for bulk items. HP/MP shortcut: HUD bars call `fullHpRecoverByItem(2, petId, ...)` (`PortraitCanvas.as:1130`) / MP equivalent.
- Pet bag items in the bag grid have no client-side pet-summon logic: `ITEM_TYPE_QUEST=508`, `ITEM_TYPE_OTHER=550` are generic types (`GamePredef.as:1061,1065`); summoning is purely `useItem`
  + server `onAddPet`. Item type 506 (`ITEM_TYPE_CREBOOK`) = skill book dragged on a pet (`petBook`), 507 = `ITEM_TYPE_PETFUNC`.
- Pet equipment: bag double-click of an equipment whose template `position` is in 50..57 and manager has `petData` -> `petEquipOn(petId, itemInstanceId)` fire-and-forget (`view/view/comp/Slot.as:1085-1103`);
  double-click a pet equip slot -> `petEquipOff(petId, slotItemGiid)` (`PetManagerPanel.as:11069-11077`; PetPanel `:4969`). Pushes (handler signatures):
  `onPetEquipOn(petId, pos 1..8, oldItemInstId, newItemInstId)` (`:8530-8559`) and `onPetEquipOff(petId, pos, itemInstId)` (`:10509-10525`). They look up `_core.data.getSlot({id})`,
  restore stack counts, so `onMoveItem`/slot sync must precede them (Go note order). `pos` is the slot index 1..8 matching `equ1..equ8` (template position 50..57 -> 1..8, **inferred 50->1**).

## 6. Battle

### 6.1 Catch (command -70)
1. Menu `btnCatch` (`PlayerCmdCanvas.as:551-554`): `cmdState = ST_BATTLE_CATCH (430)`, `view.showSelect()`; player clicks a battle creature.
2. `BattleCreatureView.mouseDownHandler` case `ST_BATTLE_CATCH` (`BattleCreatureView.as:838-855`): counts `petList` entries; if `>= petMaxNum` -> `sysMidNote(BATTLECREATUREVIEW_S[0])` and no send;
   `checkCatchValid()` = `(target.level - 5) < player.level && leftSide` (`:281-284`; `leftSide` = enemy side, `battlePos.x < APP_WIDTH_OLD/2`, `:134-140`) else S[1]; then
   `_core.battle.battleCmd(targetBattleId, BATTLE_ACTION_CATCH /*-70*/)` (id/level default -1). Hover shows red when invalid (`:1750-1757`).
3. Client does **not** gate on creature `catchable` (template field, `object/Creature.as:61`): only the tooltip uses it (`TipCre.as:2334-2343`, `0` -> "Không thể bắt", else "Độ khó bắt pet:{value}"; also level gap >=5 -> "Độ khó bắt: " via `getCatchAble :2400-2415`). Catch eligibility / success rate must be server-side.
4. Server failure feedback arrives as a battle status object key `catchF` (`GamePredef.BS_CATCH_FAILED`, `:306`) with `{cid, rate, selfCatch}` in the round's status (`BattleCreatureView.as:1320-1341`): only for own `cid`,
   `rate > 0` -> `BATTLESTAGE_S[14]` with `{rate}`; `rate == 0` -> `BATTLESTAGE_S[13]` with `{num}=selfCatch`. Success: creature disappears via behaviour `BH_CATCHED` (`:372`) and pet arrives by `onAddPet`.
5. Per-command wire entry: `{tid, action, id, level}` -> `battleUpdateCmd(array)` (`logic/Battle.as:1105-1130`, `sendNow :845-851`).

### 6.2 Pet in `onBattleStart` cList
- `BattleStage.setBattleGroups` (`BattleStage.as:1060-1085`): first all `type == 2` (TBL_CHARACTOR), then each `type == 12` creature (`setBattleCre`) or `type == 39` pet (`setBattlePet`, `:1823-1850`).
  `setBattlePet` does `_core.createPet(entry)` (copy of entry keys onto a `Pet`) then `BattleCreatureView.initBattleView(pet, entry, ...)`.
- `initBattleView` (`BattleCreatureView.as:1131-1210`) reads entry: `hpMax, mpMax, spMax, hp, mp, sp, battleId, cid, type, resCode, level, name, bossFlag`; for type 39 with `cid` truthy it does
  `_core.getCharactor(cid)` and dereferences it (`.prsUseId`) -> **owner must be a known Charactor on the client** or it throws. SP bar hidden; on enemy side `_showProp=false`.
- Pet slots used by the client: enemy side `battleId%10 < 5` mirrors `+5/-5` (`BattleStage.as:1830-1842`); H5 convention 15-19 for pets matches `Battle.BATTLE_POS/BATTLE_ID` (not re-verified here).
- Mid-battle summon: `globalBehavior` case `BH_SUMMON`, `actionObj.type == 0` -> `setBattlePet(actionObj.pet)` (`BattleStage.as:2128-2140`); type 1/2 creatures.
- `Battle.battleGetPlayerPet` (`Battle.as:629-646`) finds the own pet view: visible, `!leftSide`, `gameObject.type == 39`, `gameObject.id == _core.battlePet.id`. So the cList pet `id` must equal the petList id.

### 6.3 Command turn with a pet
- `Battle.battleCmd(tid, action, id=-1, level=-1)` (`Battle.as:1105-1158`) pushes `{tid, action, id, level}` into `_cmdAry`; if length >= 2 -> send. Else if `_core.battlePet` exists and
  `BattleStage.petActive` (= `_petAlive`, set by `checkPet :1786-1806` at `firstRound :1659-1664`) -> hides player menu, shows `cPetCmd` (`PetCmdCanvas`) for the second command; otherwise sends the single command.
  => with a live pet the client batches **exactly 2 commands**: player command first, pet command second (array order). Without pet: array of 1.
- If the player is dead but the pet alive: `BattleStage.startNewRound` (`BattleStage.as:1206-1214`) auto-pushes `battleCmd(-1, DEFENCE(-20), -1)` for the player and shows the pet menu.
- `PetCmdCanvas.btnClick` (`PetCmdCanvas.as:358-404`): attack (`cmdState=ST_BATTLE_ATTACK` -> target click -> `battleCmd(tid, -10, 0)`), skill (opens `PANEL_PET` in state "skill" with battle pet; skill click ->
  `battleCmd(tid, -50, skillId, skillLevel)`), item (`-60`), defence (`battleCmd(-1, -20, -1)`), escape (`-30`), position (`-80`), auto (`-110`); `Phòng ngự` "Vị trí" etc. per `PETCMDCANVAS_U`.
  Note: `BATTLE_ACTION_PET (-100)` is only produced from the player menu `btnPet` (opens bag pet tab, `PlayerCmdCanvas.as:537-540`); the swap-pet send path lives in the bag panel (BagPanel is an aborted stub) - **unconfirmed args**.
- Pet skill validity client-side: `checkSkillValid` (`BattleCreatureView.as:627-700`) by `targetType`; `SELF_PET` requires the target view to be the own battle pet. Cost check `Core.checkSkillRequire(skill, notify, isPet)` (`Core.as:1180-1202`) reads pet `currentHp/currentMp` vs skill `useHp/useMp`.
  `onUpdatePet(petId,"currentMp",v)` while `player.state == ST_BATTLE` sets `battlePet = petList[id]` and `skillAddMp = true` (`PetManagerPanel.as:9266-9273`) - the pet's MP is kept in sync by that push during battle.
- Pet death: `isDead()` on view; `_petAlive=false` -> no pet menu. Client has no revive logic here.

### 6.4 HUD (`PetCanvas`, `MAIN_PET`)
`showPet(pet)` (`PetCanvas.as:652-686`): icon `ResManager.getIconUrl(creatureData.iconCode)`, name = `petName`, level = `expToLv(exp)`, `hpBar.setProgress(currentHp, property.finalHp)`,
`mpBar.setProgress(currentMp, property.finalMp)`; null -> `PET_DEFAULT_ICON`, 100/100 bars, `itemBtn` disabled (`showNullPet :290-302`). There is **no exp bar**. Click icon -> toggles pet manager (`:641-645`);
HP/MP side buttons use blood bag counts `_core.bloodBag[3]/[4]` (`setHpMp :481-`; tooltip `PETCANVAS_S[0..3]`), item button turns the mouse into an item cursor targeting the battle pet (`:436-458`).
HUD refreshes only through `PetManagerPanel.updateView` -> `showMainPetCanvas`, i.e. every `onUpdatePet`/`onRefreshPetProp`/`onAddPet`/`onDelPet` repaints it.

### 6.5 Post-battle updates
Client contains no special post-battle pet handler; exp/HP/MP/life changes come as `onUpdatePet(petId, key, value)` where `key` in `exp|currentHp|currentMp|life|...` (`PetManagerPanel.as:9222-9283`):
- `exp`: value is the **new cumulative exp**; client prints `S[6]` with `{exp}` = `new - old` (only if > 0) and `S[8]` with `{newLv}` when `expToLv(new) > expToLv(old)`, as blue system messages, then stores it.
- `onRefreshPetProp(petId:Number, property:Object)` (`:7162-7183`) replaces `petList[id].property` wholesale (all `final*` + `lastPoint` must be present) and, for the battle pet, re-queries
  `getFinalPraDefPet(key, value, cid)` / `finalPraMagDefPet(...)` (awaited, result text for tooltips; `detailUpdateView :10611-10657`). Needed after level-up (new `final*`, `lastPoint`).
- `onUpdatePet` generic: sets `petList[id][key] = value`, `updateView(id)`.

## 7. Skills, growth, mounts

### 7.1 Skill slots (PetManagerPanel + PetPanel)
- 15 slots, 3 tabs x 5 (`selectedTabIndex*5 + n`, `drawSkillSlots :8015`). Values `skillN`: `>0` learned (del/up buttons visible; up disabled when skill `level >= 3`), `0` open empty, `-1` locked
  (open button shown if slot index >= 6 or in "skill" state). Slots 1-5 default open (Go note: normalise to 0).
- `petOpenSkill(petId, index 1..15)` fire-and-forget (`:7595-7627`, only index > 5): cost `GOLD_PET_SKILLOPEN[index] * GOLD_PET_SKILLOPEN_Q[creatureData.qLevel]`
  (`GamePredef.as:1422-1423`: `[0,0,0,0,0,0,10,20,40,70,110,160,220,290,370,460]`, `[0,1,3,10]`); `Player.enoughMoneyAuto(2,num)` gate (goldBind first); alert S[8] / msg S[10].
- `petUpSkill(petId, index)` fire-and-forget (`:9152-9220`): needs item `ITEM_PET_SKILL_UP[qLevel]` (`config/ItemConfig.as:49` = `[-1,1365,1366,1367]`) x1 when skill level 1, x3 when level 2; max level 3. **Not in Go notes' RPC list** - missing from the Go handler registry (`handlers/pet/handler.go:38-73`).
- `petDelSkill(petId, index, md5pw?)` fire-and-forget (`:9566-9600`), cost item `ITEM_PET_SKILL_DEL = 1364` (`ItemConfig.as:48`), requires binded (Go note).
- `petBook(petId, bookItemInstanceId)` awaited (`PetFuncPanel.as:2327`); handler `onBook` (`:3031-`): `f` 1/2/3; `rf` bool; `n` remaining stack.
- Skill ids come from `TBL_SKILL` (`level`, `kind`, `name`); pet skills also fire in battle through the pet menu.

### 7.2 Growth panels (identify only; defer)
| RPC | Args (types) | Panel / meaning |
|---|---|---|
| `petStar` | petId, itemInstId, flag(bool/int `_local_1` safe item) awaited | PetFuncPanel "cuong hoa": stars 0-12 (`upgradeNum`); result `{petId, starNum, growRateAdd, starSlotId, num, starSafeNum, flag}` (`PetFuncPanel.as:2542-2570`) |
| `petStarClear` | petId, itemInstId | reset stars |
| `petJoin` | mainPetId, pet1..pet4 ids (5 args) | "dung hop" fuse; result `{flag, pid, grow}` (`:4613-4640`) sets `growRate` |
| `petEat` / `ensurePetEat` | mainId, costId, luckItemId, luckNum, aptType, md5pw / petId | "ao hoa" (aptEx boosts) with confirm password |
| `petXd` / `petXsd` / `petPzXsd` | petId, itemInstId | "tay tuy" / "tay diem" (re-roll apt / reset points), "phuc sinh"; `onXd` result `{f, pet}` |
| `contractPet` / `contractPetTen` | type 1..4 (`CONTRACT_DICT`: hp/speed/physics/magic), autoBuy:bool | PetEvolutionPanel account-wide "Khe uoc" levels (max 50, `GamePredef.as:7039-7045`); result `{type,newLvl,newExp}` (`:4631-4649`). **Not "acquire a pet"** (`player.contractPet` is a bonus table) |
| `toPetEnvolution` | petId | evolution |
| `toPetFeather` / `toPetFeatherNextStep` | petId, useProtect:bool / petId | "vu hoa" (feather) steps |
| `activePet` / `activePetGold` | creatureId | PetHandbook activation |
| `getPetGuardData`, `putDownPet`, `movePetToPetGuardSid`, `upGuardSid(sid, costType)` | see pet-guard.md | PetGuardPanel (level >= 50 to open: `PetManagerPanel.openGuardPanel :4403-4416`, `PANEL_PETGUARD[10]`) |

### 7.3 Mounts / flying (outside the pet panel)
- Fly: MiniMap flying button `changeFlyingState` (`MiniMapCanvas.as:1960-1975`) -> `Creature.beginFlying()` (`object/Creature.as:316-345`): only when `flyingState == ON_GROUND`; blocked for non-leader group
  members (sends `fixFlyState()` at most every 30 s, notes `NPCVIEW_S[0]`) and when `taskSweep`; else fire-and-forget `remote.beginFlying()` (no args). Push `onBeginFlying` -> `flyingState = TAKING_OFF(1)`,
  clouds, `playFlying` (`object/Creature.as` `onBeginFlying`, ~line 190). A MiniMapCanvas function just above `changeFlyingState` (`MiniMapCanvas.as` ~1945-1958, name not captured) disables `btn_pet`, `btn_petArena` etc. while flying (**unconfirmed which trigger**). Landing: `stopFlying()` sets `PRE_LANDING(3)`, walks to a safe area, then `remote.stopFlying()` (no args; `CreatureView.as:8374`, `:10202`).
  States: 0 ground, 1 taking off, 2 in air, 3 pre-landing, 4 landing, 5 double fly (`GamePredef.as:1776-1781`); flight height 100, zoom 0.7/0.9 (`:1775-1788`). Pet follows into `flyLayer` with cloud.
- Mount: `MountPanel.beginMount` (`MountPanel.as:2796-2826`) -> `_core.player.beginMounting(dressId)` -> `remote.call("beginMounting", null, dressId:int)` (`Creature.as:421-433`, blocked by `taskSweep`).
  Other RPCs: `getMountList` (awaited), `addMountExp`, `addMountUpExp`, `renewMount(id)`. Appearance via `Creature.mountResCode`/`MOUNT_STATE_OFF(0)/ON(1)` (`GamePredef.as:1784-1785`). Speed change is not found in these files (**unconfirmed; separate MountPanel research**).
  Recommendation: defer both mounts and flying out of M4 pets.

## 8. Contract tables

### 8.1 RPCs (client -> server)
| Name | Args (order, types) | Reply | Source |
|---|---|---|---|
| `initViewPetMngP` | none | awaited: map/array of `{id, data:{...pet}}`-style wrappers (see 4.1) | `PetManagerPanel.as:8981` |
| `changePetState` | petId:number, state:1\|3 (2 exists) | fire-and-forget; pushes | `:9388-9405` |
| `startPetFollow` | petId:number, currentShowPetId:number | awaited, truthy = ok | `:11327` |
| `cancelPetFollow` | showPetId:number | awaited, truthy = ok (also fire-and-forget in `Core.as:1223`) | `:4454` |
| `changePetName` | petId, name:string ("" = reset to template name) | fire-and-forget | `:10857-10866` |
| `changePetProperty` | petId, `{addStrength,addAgility,addStamina,addIntelligence,addEnergy}` (strings, may be "") | fire-and-forget | `:10314` |
| `delPetByClient` | petId, md5pw? (only when growRate > 1.3) | fire-and-forget | `:11377-11384` |
| `bindedPetByPlayer` | petId | no responder | `:10463` |
| `petEquipOn` / `petEquipOff` | petId, itemInstanceId | fire-and-forget | `Slot.as:1101`, `PetManagerPanel.as:11076` |
| `petOpenSkill` | petId, index | fire-and-forget | `:7612` |
| `petUpSkill` | petId, index | fire-and-forget | `:9178,9202` |
| `petDelSkill` | petId, index, md5pw | fire-and-forget | `:9585,9594` |
| `petBook` | petId, bookItemInstId | awaited `{f, rf, n}` | `PetFuncPanel.as:2327` |
| `petOpenSlot` | none | fire-and-forget (BagPanel stub; Go note) | Go note |
| `useItem` / `useMultiItem` | targetType (2=pet), petId, slotId[, count] | see 5.4 | `Player.as:927-948` |
| `battleUpdateCmd` | `[{tid, action, id, level}]` len 1 or 2 | fire-and-forget | `Battle.as:849` |
| `getFinalPraDefPet` / `finalPraMagDefPet` | key:string, value:number, cid:number | awaited, text for tooltip (`onSetSpeText :8561`) | `:10632,10645` |
| `getPetDetailData` | cid, petId | awaited | `DetailPropPanel.as:2063` |
| `uif` | key, value, isPet:bool (pet auto-battle settings `bs*`/`p*`) | no responder | `Core.as:351-356` |

### 8.2 Pushes (server -> client). Shapes marked (i) are inferred from handler signatures
| Name | Payload | Effect |
|---|---|---|
| `onAddPet` | wrapper with `id`, `data{tid, petName, exp, growRate, state, binded, currentHp, currentMp, life, close, element, colorCode, apt*, skillN, equN, upgradeNum, property{...}}` | add to `petList`, chat link, `updateView` |
| `onDelPet` | petId | remove |
| `onUpdatePet` | (petId:number, key:string, value) | set `petList[id][key]`; special keys `exp`, `state`, `currentMp`, `petName` (`PetManagerPanel.as:9222-9283`) |
| `onRefreshPetProp` | (petId, property) per handler signature (i: Go sends `{id, s}`) | replace `property` |
| `onPetEquipOn` / `onPetEquipOff` | (petId, pos, oldItemId, newItemId) / (petId, pos, itemId) | slot icon update |
| `onCreatePet` / `onCancelPet` | (i) `{cid, petData}` / `cid` | map follow pet sprite |
| `onMinusMoney`, `onUPP{petMaxNum}`, `onMoveItem`, `onAddCharactorSlot`, `onDelCharactorSlot` | per other features | costs / slots / capacity |
| battle `cList` entry type 39 | `id, cid, tid, name, level, type:39, battleId, hp, hpMax, mp, mpMax, sp, spMax, resCode, colorCode, element` (i, fields read in 6.2) | pet unit |
| battle status `catchF` | `{cid, rate, selfCatch}` | catch failure message |

## 9. Proposed shared types (`packages/shared/src/pet.ts`, re-export from `index.ts`)
```ts
export const PetState = { BATTLE: 1, FOLLOW: 2, REST: 3 } as const;

export interface PetProperty {            // client reads every key; missing -> NaN/0 in UI
  finalHp: number; finalMp: number; finalSp: number;
  finalAttack: number; finalMAttack: number; finalDefence: number; finalMDefence: number;
  finalHit: number; finalCritical: number; finalDodge: number; finalSpeed: number;
  finalStrength: number; finalAgility: number; finalStamina: number; finalIntelligence: number; finalEnergy: number;
  lastPoint: number; growRate: number; growRateAdd: number;
  aptStrengthEvolution?: number; aptAgilityEvolution?: number; aptStaminaEvolution?: number;
  aptIntelligenceEvolution?: number; aptEnergyEvolution?: number;
  [detail: string]: number | undefined;   // PROP_INT_KEY_ARR / PROP_PER_KEY_ARR keys (finalCombo, finalPraDef, ...)
}

export interface PetData {                // wire wrapper content; client unwraps data.* to root
  id: number; tid: number; petName: string;
  exp: number;                            // cumulative; level = expToLv(exp)
  growRate: number; state: 1 | 2 | 3; binded: 0 | 1;
  currentHp: number; currentMp: number; life: number; close: number;
  element: number; colorCode?: string;    // resource codes as strings (repo rule)
  aptStrength: number; aptAgility: number; aptStamina: number; aptIntelligence: number; aptEnergy: number;
  aptStrengthEx?: number; aptAgilityEx?: number; aptStaminaEx?: number; aptIntelligenceEx?: number; aptEnergyEx?: number;
  upgradeNum: number;
  skill1: number; /* ... skill15: -1 | 0 | skillId */ equ1: number; /* ... equ8 */
  property: PetProperty;
  pi?: Record<string, number>; soulInfo?: { data: Record<string, number> };
}
export interface PetWire { id: number; data: PetData }              // initViewPetMngP result values / onAddPet arg
export type InitViewPetMngPResult = Record<number, PetWire>;       // keyed by pet id

export interface ChangePetPropertyArgs {
  addStrength: string; addAgility: string; addStamina: string; addIntelligence: string; addEnergy: string;
}
export interface PetScene { id: number; cid: number; tid: number; name: string; level: number;
  resCode: string; colorCode?: string; element: number; leaderId?: number; petTrendAction?: number }
export interface OnCreatePet { cid: number; petData: PetScene }
export interface BattlePetEntry {          // cList entry, type 39
  type: 39; id: number; cid: number; tid: number; name: string; level: number; battleId: number;
  hp: number; hpMax: number; mp: number; mpMax: number; sp: number; spMax: number; resCode: string; colorCode?: string; element: number;
}
export interface CatchFailed { cid: number; rate: number; selfCatch: number }
```
Server owner: `server/src/modules/pet/` (`pet.schema.ts`, `pet.service.ts`, `pet.rpc.ts`, `pet-exp.ts` with `PET_LEVEL_EXP` ported from `GamePredef.as:8838+`, `pet-scene.ts`).
Client owner: `client/src/ui/petManager.ts` (panel), `client/src/ui/hud/petCanvas.ts` (existing empty HUD slot), `client/src/game/petFollow.ts` (follow sprite), battle menu pet branch in `client/src/ui/battleMenu.ts`.

## 10. Delta vs H5 repo (verified by grep)
- `packages/shared/src/battle.ts:6,14` already has `CATCH -70`, `PET -100`, `PetBattle participant type 39`; `server/src/modules/combat/battle-command.service.ts:73` handles only the first command (comment "no pets"):
  needs 2-command arrays (player, pet). `use-item.rpc.ts:35` ignores `petId`. `client/src/ui/battleMenu.ts:48-50` has disabled Bắt/Pet buttons. `quest-award.ts` skips kind 2. No pet module, schema or shared pet types.

## 11. Open questions
1. `onRefreshPetProp`, `onPetEquipOn/Off`, `onCreatePet/onCancelPet`, `onUPP` payload packing (CallBack stub): handler signatures are positional (`petId, prop`), Go sends maps `{id,s}`. H5 can choose positional args; client port is ours.
2. `soulInfo`/`pi` placement (4.1): wrapper-level siblings of `data` is the only reading consistent with the unwrap loop, but unconfirmed.
3. `state == 2` (follow icon) - no client path sets it; likely legacy. `_changePetState(2)` branch has no caller found.
4. Pet-swap command during battle (`BATTLE_ACTION_PET -100`) arguments: sent from bag panel (decompile gap).
5. Whether the follow pet needs buff 1709/1979 server-side (client cancels on map entry without it); Go ignores.
6. Catch success rate / eligibility (`catchable`, `selfCatch` points): server-only; client shows only rate on failure.
7. Exact `Battle.BATTLE_POS` mapping for slots 15-19 (not re-read here; combat research 2026-11-04_03 covers).
8. Mount speed effect and `onBeginMounting` push body not found in client files read.
