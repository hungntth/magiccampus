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
- Growth systems: the Luyện pet window (star, join, refine, rebirth, point, skill, illusion, element) is done client side (ui/petfunc, pet-depth.md); the evolution / feather / contract windows and the Sách Tiến Hóa book are done client side (ui/petevo, T.Hóa button); the guard, talent, stone, forge pet-tab and Menh Hon (ui/petsoul) windows are done client side; the PPVE tower and arena windows (ui/petbattle, HUD "Điêu Khắc" / "Đấu Pet" buttons) and the pet battle replay stage are done client side too.
- Mounts and flying; bag summon items; `-90`/`-100` recall and swap; pet auto-battle.
- Not verified live: a catch in a group battle, passive percents other than HP, `req_class_id` items.
- Quiet the new RPCs after the user confirms.

## M12 Phase A foundation (2026-11-05)
- Pet documents retain star state (`starNum`, `starGrowAdd`) and refined / illusion aptitude buckets. The view folds these sources into the stat sheet without changing ordinary distributed points.
- Shipped training RPCs (all remain un-quieted): `petStar`, `petStarClear`, `petJoin`, `seniorPetJoin`, `petXsd`, `petPzXsd`, `petXd`, `petEat`, `ensurePetEat`, `elementPet`, and `petUpSkill`. The compact pet-panel entry currently opens star training; the eight-tab window is deferred.
- Senior fusion advanced rates / 3014 and the illusion luck flow landed in slice 2; M12 phases C-G are only partly ported.

## M12 slice 1 (2026-11-05): stat registry, aptitudes, training fixes
- Stat sheet aptitude = (`aptRefined` > 0 ? refined : creature) + Vu Hoa (`featherAptitudes(tid, envoInfo)` from the generated `petFeatherSteps.ts`, derived at read time, not stored) + `aptIllusion`. Distributed points (`aptEx`) stay attribute points. `PetView.aptX` = instance base, `aptXEx` = points + illusion (Go ClientAptitudeEx), plus `aptXEvolution` / `aptXIllusion` on the view and in `property` (Flash reads `property.aptXEvolution`).
- `PetStatRegistry` (PetModule export): feature modules `register()` a `PetStatProvider` (key, contexts panel|battle|arena|ppve) in `onModuleInit`; talent is the first. `PetBonusService.extrasOf/extrasFor(cid, rows, ctx = 'panel')`; the battle fighter passes `'battle'`. PetModule no longer imports PetBoostModule (PetBoostModule imports PetModule). PetModule must not import ProgressionModule (it reaches CharacterModule, which imports PetModule): pet code reads `character_features` by model.
- Rules fixed to the original: star success is `PET_STAR_SUCCESS[starNum + 1]` (13 entries); Tay Tuy (xsd) judges against the creature aptitude, normal pills apply only when higher, Cao Cap rolls [cur+1, 1.2t] and refuses at max, replies carry `i/n` and the pill is consumed per roll; Phuc Sinh consumes the pill on every roll and refuses at the band max; fusion colour = `petGrowColor` 0..4 (white allowed, orange refused), rate `PET_JOIN_SUCCESS[color]` (+VIP right 6 for purple), success rolls the NEXT band, a bound sub binds the main, subs in battle / following / gear / guard slot are refused; element cost `round(BASIC_GET_MONEY[level] * 0.1)`, selected silver kind first, reply `{petId, element}` + `onAddMoney(cid, key, -cost, balance)`.
- Feather: success table round 2 row fixed; reaching stage 9 of round 0/1 rolls to the next round (only round 2 stage 9 is the cap and is refused); costs copied from GamePredef into shared; evolve / feather push `onRefreshPetProp`; a following pet is re-created (`onCancelPet` + `onCreatePet`).
- Announcements: stars 9..12 and an orange fusion broadcast on the system channel (plain text, no [@PET] link token yet).
- Slice 1 deferrals (senior join advanced rates, Bua Cau Nguyen, petEat luck flow, contract, handbook bonus) were closed in slice 2 below.

## M12 slice 2 (2026-11-05): contract, handbook, protect, senior join, illusion
- Khe Uoc: `contractPet / contractPetTen / ensureBuyContractPet` (`PetContractRpc`); state on `Character.contractPet`; replies are plain `{type, newLvl, newExp}` (Flash Responders, no push). Short of Da Khe Uoc (4979) with autoBuy, `contractPet` pushes `onEnsureBuyContract(gold)` and replies null; the confirm calls `ensureBuyContractPet` (10 gold per missing stone, assumed constants in `pet/pet-depth-constants.ts`). Refusals throw with the Go note texts. A level up pushes `onRefreshPetProp` for the evolved battle pet.
- Bonus providers (`pet/pet-feature-providers.ts`, registered by PetModule): handbook and contract apply to the BATTLE pet only (state 1) in the panel and battle contexts, to every pet passed in for `ppve`, never in the arena; contract additionally needs an evolved pet. Contract = percent of HP (1) / speed (11) / attack (4) / magic attack (5), Tho San (class 5) adds `extra_numN`. Handbook = flat or percent entry props + `PET_SERIE_PROP` for a fully activated series. Rate props (32, 58, ...) land in `rates`, which pet stats and combat do not read yet (display only).
- Handbook: `activePet({pid,num})` and VIP-only `activePetGold({pid,num,moneyType:'gold'})` (ceil(remaining/5) gold); both push `onUPP{currencies,gold}`, `updateActivatePetObj(state)` and, when the entry completes, `onRefreshPetProp` for the battle pet. Feather protection: a protected try on a non-milestone stage consumes the 3911 charms first ("Bùa Cầu Nguyện không đủ!" when short, nothing charged); the reply keeps `protect`.
- Senior join: rate `ADVANCED_JOIN_PROBABILITY[colour][subs]`, Noi Don Tinh Linh 3014 (blue 1 in total, purple 2 per sub) consumed before the roll; refusals answer null + `onSystemMidMsgOrNote`. Args accepted: `[main, ...subs]`, `[[main, ...subs]]`, `(main, [subs])`.
- Ao Hoa: `PetIllusionService`; `petEat(main, sub, luckItemId|null, luckNum, aptType, md5)` replies `{msg, costPet, costItem, isHint, petId, aptType, value}` (refusals reply `{msg}` only); `ensurePetEat` replies `{succ, propName, value, msg}` + `onUpdatePet(aptXEx)` + `onRefreshPetProp`. Sub pet and stones are consumed either way; the previous pending value is dropped on every attempt.

## M12 slice 4 (2026-11-05): Tu Linh Bao Thach
- Stones are not items: bag in `character_pet_stones` (`{slot:{g,n,s}}`, slots 0..319, wire = sparse array `[tid,num,skillId]`). Pet gear (kind 9, in the bag, the pet-item page or worn) keeps inlaid stones in `properties.flag3`; they give no stats and the energy skill is only stored / shown. Compose 3 -> 1 x qty (silver selected kind first, never split, bag room checked before charging), absorb 5 level-5 stones (main stone family decides), resolve -> `energyStone`, energy refining 500 / 1000 `energyStone`. Refusals show a note and answer the unchanged state. See `docs/memory/pet-depth.md` and the plan notes (slice 4).

## M12 Menh Hon (slices E + 6, 2026-11-05)
- `PetSoulModule`: 12-free-slot character bag (`character_features:soul`: `open`, `data`, `temp` prey bag, `crystalSid`), pet ring on `pets.soul` (sockets 1..8 by `openNum` = pet level 80/80/80/80/80/100/120/140, 9..16 by `openNum2` bought with Exp Menh Hon 20000..55000). 11 RPCs: openBag (10 plain gold), lockSoul, soulLevelUp(slot[, petId]; ring slot = +100), putInToExp, transformExp (single / VIP bulk), transformExpInPanel, preySoul (Pha Le crystals 4000..12000, VIP advanced 200 gold, VIP quick), exchangeSoul (Manh Vo), putSoulToBag, openPetSoulBag, moveSoul. A ring holds one gem per kind (`prop_type`).
- Ring gems add the current row prop_val to the pet sheet (all contexts); `soulInfo` is part of the pet view / wrapper and the login payload carries `soulBagData`, `tempSoulData`, `crystalSid`. A Lv.80+ pet level-up pushes `onPetLevelUp({openNum, pid})`. Rates and status keys are display-only. No H5 source for Pha Le, Exp Menh Hon bags or Manh Vo (GM `/grant`); the client window is `ui/petsoul` (client slice C5). Details: plan notes (slice 6) and `docs/memory/pet-depth.md`.

## Detail rates (M9 phase F)
- `pet/pet-detail.rpc.ts`: `getFinalPraDefPet` / `finalPraMagDefPet` (Go names) and the H5 helper `getPetDetailData()`, all on the
  fighting pet (state 1); none push `onRefreshPetProp`. Pet rates = gear + passive skill rates (`final-rate.ts petRates`).
  The pet panel shows "Chi tiết" in the attributes tab only for the fighting pet.
- **Guard / talent (slice 3)**: pets in a Chien Thu Ho Ve slot (0..4 and sub slots 11..45) cannot be traded, auctioned, mailed, released, fused or eaten; slot 0..4 pets get the guard stats in the panel / battle / arena / ppve contexts (centre formula, or the Chien Thu row x inner multiplier). Thien Phu talent bonuses apply to every pet; changes refresh only the battle pet and the guard-slot pets.
- Pet gear upgrades (M12 slice 5, `modules/forge/pet-gear-*`, `sublime*`): Thang cap (same item id, next template, shards 2333 by current req_level, spec 2529), Doi mau (80/50/30/20 %, shards spent either way, orange announcement), Doi khoa / Tai thiet lap (30000 silver + material at the preview, roll 1..min(30, round(bindPropNum x colour))), Thang hoa (dust 4841, rate + add, element on the first success, state in `properties.flag`) and Doi khac che (dust 4842 or 5 gold), repair parity. Pieces marked `properties.petGear` use Go numbers (colour-scaled lines, bind percent); unmarked pieces keep the template-only numbers. Sublime stats add to worn gear; element hurt is display-only. See `docs/memory/pet-depth.md` and the plan notes (slice 5).

## M12 PPVE tower (slice 7, 2026-11-05)
- `PetBattleModule` (`modules/pet-battle/`): Khong Gian Dieu Khac, floors 1..150 against a floor-seeded five-enemy line-up (Go ppve_scaling formulas) simulated headlessly (`simulatePetBattle`, 24 rounds); only a win spends a free try (3 per day, 10 / 20 / 50 / 50 gold for extra tries) and pays the floor KP + item (mail when the bag is full). Line-up = up to 5 bound pets of different templates with a per-round cmdList (targets 1 random / 2 top attack / 3 lowest HP / 4 fastest / 50..54 opposing position 1..5). Khac Van carve nodes (KP) add pet stats in PPVE and the arena only; line-up pets cannot be released or used as fusion / Ao Hoa subs. Replays (last 20 per character) replay through `replayPetPVEFight`. See `docs/memory/pet-depth.md`.
- Pet arena (Dau pet, `modules/pet-battle/arena*`): weekly ladders per level group A..F (positional: beating a higher rank takes it), 20 daily turns + 10 min cooldown (gold: `addPetFightNum` (max - 19) x 5 up to 30, `clearArenaCD` ceil(s / 30)), registered line-up = up to the group's team size of bound, distinct-template pets at positions 5..9 with per-round cmdList. Fights are simulated headlessly (24 rounds, attacker 15..19 vs defender 5..9, contract / handbook off, carve / guard / talent / soul on, no life drain, an offline defender fights too) and pay `paPnt` by group (6 12 16 20 24 28, a loss half); last week's rank pays round(coef x 1.02^(200 - r)) once. Arena line-up pets cannot be released or used as fusion / Ao Hoa subs. See `docs/memory/pet-depth.md`.
## M12 client C3 (Hộ Vệ / Thiên Phú / Bảo Thạch windows, 2026-11-05)
- Windows live in `client/src/ui/petboost/` (controllers `PetBoostController` / `PetStoneController`); the static talent / stone / guard-cost tables are generated into `shared/petBoostData.ts` (`server/tools/gen-pet-boost.ts`). Details: `docs/memory/pet-depth.md` (client slice C3).

## M12 client C4 (forge pet gear tabs, 2026-11-05)
- The forge window ("Chế tạo" / "Luyện" HUD buttons) has a second tab group "T.bị Pet": Thăng cấp, Đổi màu, Đổi khóa, Tái thiết lập, Thăng hoa, Khắc chế over kind-9 gear in the bag, the pet item page and worn by pets; the pet panel equipment tab repairs gear ("Sửa" tool, "Sửa tất cả"). Sublime state reaches the client as `BagItem.sublime` and shows in the tooltip. See `docs/memory/pet-depth.md` (C4) for contracts.

## Pet-target items (item use D / E, 2026-11-07)
- `pet/pet-item.service.ts` (+ `pet-item-rules.ts`, pure): grow potions (`PET_GROW_ITEM_EXP`, exp clamped to owner level + 5 through `PetBattleService.grantExp`), Tho Menh Dan 1533 / 1534 (life, cap 10000) and Tinh Hon Chi Thuc 3984 (+1 lowest aptitude below round(template * 1.2), written to `aptRefined`). Plans return a refusal or an `apply` step; the item-use caller consumes the unit in between and holds the character lock. `PetSlotService.bookPlan / applyBook` serve the pet slot book 326. Pet HP / MP and loyalty are not persisted, so HP / MP potions and loyalty potions never change a pet. Wiring: `docs/memory/item-use.md`.

## Chân Hồn Thần Thú on the battle pet (M13 phase G, 2026-11-12)
- PetStatProvider `prs` (`prs/prs-pets.service.ts`, registered by PrsModule): soul tree + activated Thần Dụ forms in panel units on the battle pet (state 1; every PPVE line-up pet), dictionary `TALENT_PROPS` + 14 / 34. Tree / form changes push `onRefreshPetProp` through `PetBonusService.battlePetPushes`.
- `PetFollowService.setLookHook` / `lookOf`: the equipped form (`prsUseId`) goes on every scene character, the following pet shows the form art while it is the battle pet (`sceneViewOf`), and `PetBattleService.fighterOf` gives the pet fighter the same `resCode` (Flash BattleCreatureView). Details: `docs/memory/prs.md`.

## Tiểu Tinh Linh (M13 phase G, 2026-11-12)
The fairy is **not** a pet: it lives in the feature store (`fairy`), buffs the owner only (no PetStatRegistry provider: Go has no pet-side effect)
and has its own window opened from the fairy toggle of the HUD pet bar (Flash `PetCanvas.__fairyTog_click`). See `docs/memory/fairy.md`.
