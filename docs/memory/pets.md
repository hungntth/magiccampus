# Pets (M4): core, map follow, battle, catch, quest objectives, skills, equipment

Plan: `docs/plans/2026-11-04_05_PETS.md`, with implementation notes for phases A–E. Implemented 2026-11-04.
Research: `docs/research/2026-11-04_07_PET_CLIENT_RESEARCH.md`, `..._08_PET_SERVER_RESEARCH.md`.

## Contract (shared `pet.ts`, `petCatch.ts`, `petGear.ts`)
- `PET_LEVEL_EXP`: 160 cumulative entries; Flash and Go are identical. Helpers: `petLevelOfExp`, `petGrowColor`.
- Login `PlayerData extends PetLoginInfo`: `petMaxNum` (default 6), `showPetId` (-1 when none), `petList` (unwrapped data), `showPetObj?`.
- `PetView` (Flash keys: `tid, petName, exp, property, skill1..15, equ1..8`) plus H5 creature facts. The wrapper is `{id, data}`.
- RPCs (none quiet):
  - Management: `initViewPetMngP`, `changePetState(id, 1|3)`, `changePetName`, `delPetByClient`, `bindedPetByPlayer`, `changePetProperty`.
  - Follow: `startPetFollow`, `cancelPetFollow`.
  - Gear (all `forbidInBattle`): `petOpenSkill`, `petBook` (awaited `{f, rf?, n?}`), `petDelSkill`, `petEquipOn`, `petEquipOff`, `petOpenSlot`.
  - Life restore: `useItem(2, petId, itemId)` (type 507).
- Pushes:
  - Pet state: `onAddPet({id, data})`, `onDelPet(id)`, `onUpdatePet(id, key, value)` (positional), `onRefreshPetProp(id, property)`.
  - Map: `onCreatePet({cid, petData})` and `onCancelPet(ownerCid)`, broadcast to the map **including the owner**.
  - Equipment: `onPetEquipOn(petId, pos, oldId, newId)`, `onPetEquipOff(petId, pos, itemId)`.
  - `onPetSkillInfo`: H5-only skill names, since the client has no skill table.
- Battle: a type-39 cList entry at owner slot + 5 (`BATTLE_PET_SLOT_OFFSET`). `battleUpdateCmd([owner, pet?])`. Catch is `-70`; a failure carries `sSObj.catchF {cid, rate, selfCatch}`, a success behavior 10160.

## Rules
- **Storage**: Mongo `pets`, `_id` from counter `pets`. `exp` is cumulative (starts at 1) and `level` = `petLevelOfExp`. HP/MP are not stored: pets start every battle full.
- **Stats** (`pet/pet-stats.ts`): `buildBaseStats(profile, scale)` with scale = `growRate + growRateAdd` (characters use 0.8).
  - Attribute = creature att + (level−1) + `aptEx` + gear attributes.
  - Then gear flats → gear percents → passive skills (type 11 + `buff_id`).
  - Test vectors: creature 32 Lv1 grow 1.6 → hp 972 / atk 62 / def 304.
  - +5 points per level; no owner-level cap; max level 160.
- **Quest award** (kind 2 / type 12): `growRate = q/10`, bound. A full pet bag gives a red note and the quest still completes.
  - The active pet gets the full quest exp.
  - A new bound pet when no battle pet exists: the client calls `changePetState(id, 1)` after 500 ms.
- **State gates**: state 1 needs life > 0, pet level − 5 ≤ owner level and `use_lv` ≤ owner level; it binds the pet. The battle pet cannot be released (H5).
- **Life**: 10000 max, −10 per battle (any outcome). All 28 type-507 items restore life; they are really growth items, but Go treats them so, until the growth milestone.
- **Follow** (`PetFollowService`): one following pet; it persists across portals and relog (H5).
  - Scene payloads carry `showPetObj`; it is hidden for non-AFK party members.
  - A level-up or rename re-broadcasts.
  - Client `PetLayer` / `PetFollower`: 100 px radius, spawns behind the owner.
- **Battle** (`PetBattleService`): the state-1 pet with life > 0 fights.
  - A missing pet command becomes a basic attack on a random enemy. Pet skills must be in its slots and use pet MP. A dead owner with a live pet sends only the pet command.
  - On a win, exp `floor(splitExp × 0.5)` goes to each surviving owner's pet, even if the pet died.
  - Pushes at `battlePlayEnd`: exp, life, level/`attLastPoint`, then `onRefreshPetProp`.
- **Catch**:
  - Only `catchable == 1`: 29 of 2016 creatures. The 166 creatures with values 2–12 show as "Độ khó bắt" in Flash but are not catchable (Go parity).
  - Creature level ≤ owner + 5; free room, counting catches earlier in the same battle.
  - `rate = clamp(20 + round((1-hp/max)*65) + d, 5, 95)`. No catch item.
  - The pet is created at settle and `onAddPet` is sent last at `battlePlayEnd`. A caught creature counts as killed.
- **Pet turn-in objectives** (kind 3 / type 12): match by template, unchanged name and growth band ≥ q/10.
  - `finishQuest` deletes the lowest-growRate matches first, and that can include the battle pet (Go).
- **Skills**:
  - Slots 1..5 open; opening 6..15 costs `[10..460][slot-6] × {1,3,10}[qLevel]` (goldBind if it covers the cost, else gold).
  - `petBook`: type 506 book, `cre_kind` gate, conflicts, first empty slot.
  - `petDelSkill` needs a bound pet and item 1364.
- **Equipment** (positions 50..57):
  - Stored in `character_items` with slotType 6, `slotIndex = petId*8 + (pos-50)`; `pets.equ[]` mirrors the ids.
  - Gates: `req_level` ≤ pet level, `req_class` ∋ creature `class_ids`, `req_class_id` ∋ tid.
  - Release and quest turn-in return worn gear first; a full bag refuses the release.
- **`petOpenSlot`**: +1 slot for 20 gold, cap 180.

## Client
- `game/PetController.ts`, `ui/petPanel.ts` (W key or the HUD pet button) with tabs `petPanelTabs.ts`, `petSkillTab.ts`, `petEquipTab.ts`; `game/PetGearActions.ts`; `ui/hud/petCanvas.ts`.
- Battle: `battle/petStep.ts`, `ui/petCmdMenu.ts`, `battle/catchMode.ts`, `battle/reviveFlow.ts`.
- With the pet panel open, a bag double-click on a book, pet gear or a type-507 item routes to the selected pet.
- The client test `petFollow.test.ts` runs from `server/`.

## Deferred
- Growth systems: star, evolution, feather, join, eat, xd/xsd, `petUpSkill`, contract, guard, PVE tower, arena.
- Mounts and flying; bag summon items; `-90`/`-100` recall and swap; pet auto-battle.
- Not verified live: a catch in a group battle, passive percents other than HP, `req_class_id` items.
- Quiet the new RPCs after the user confirms.

## Detail rates (M9 phase F)
- `pet/pet-detail.rpc.ts`: `getFinalPraDefPet` / `finalPraMagDefPet` (Go names) and the H5 helper `getPetDetailData()`, all on the
  fighting pet (state 1); none push `onRefreshPetProp`. Pet rates = gear + passive skill rates (`final-rate.ts petRates`).
  The pet panel shows "Chi tiết" in the attributes tab only for the fighting pet.
