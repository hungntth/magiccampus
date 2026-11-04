# M4 Pets — legacy Go server research

Date: 2026-11-04. Source: `D:\mcgame` (read-only). Paths below are relative to `D:\mcgame\internal\`. Pet handlers live in
`presentation/rtmp/handlers/pet/`, the service in `application/pet/`, and the entity in `domain/pet/pet.go`.
Hand-computed stats were re-checked with a script. Client contract: `2026-11-04_07_PET_CLIENT_RESEARCH.md`.

## 0. Handler liveness
- All 36 pet RPCs are registered once (`handlers/pet/handler.go:33-73`); there are no collisions.
- `beginMounting` / `stopMounting` are registered by the mount wrapper (`cmd/gameserver/main.go:714`, `handlers/mount/dress.go:140`).
  The pet `BeginMounting` (`management.go:354`) is only the fallback for a non-dress id.
- **Growth RPCs are cost-free stubs whose arg shapes do not match Flash**:
  - Stubs: `petStar`, `petStarClear`, `petJoin`, `seniorPetJoin`, `petXd`, `petXsd`, `petPzXsd`, `toPetFeather`, `toPetFeatherNextStep`, `toPetEnvolution`, `petEat`
    (`enhancement.go`, `fusion.go`, `service.go:517-690`).
  - Flash sends item ids, e.g. `petStar(petId, itemId, flag)` and `petJoin(main, p1..p4)`; Go ignores them and charges nothing.
  - `contractPet`: Go reads arg0 as a creature id, while Flash (`PetEvolutionPanel.as:2888`) sends `_selectType, autoBuy`. `contractPetTen` is unregistered.
  - **Do not port these as written**; design growth later from the client and the data tables.

## 1. Persistence (`player.character_pets`)
- Columns:
  - identity: `id, character_id, template_id, name, level, experience`;
  - aptitudes: `apt_strength..apt_energy` (copied from the creature, display only), `apt_*_ex` (points the player distributed);
  - growth: `grow_rate, grow_rate_add, upgrade_num, evolution_lv, element`;
  - vitals: `current_hp/mp, max_hp/mp, life` (default 10000);
  - flags: `is_following, is_mounting`;
  - `property jsonb`;
  - points: `attr_points, max_attr_points, distributed_attr_points`.
  - Sources: baseline migration `:2278`, `20260423112250_add_pet_life_column.sql`, `20260418112813_add_attr_points_tracking.sql`, `pet_repository.go:36-110`.
- `property` jsonb:
  - `state` (1 battle, 2 follow, 3 rest), `binded` (0/1);
  - `skill1..skill15` (-1 locked, 0 open and empty, > 0 skill id), `equ1..equ8` (item id);
  - `equipGroup`, `featherLevel`, `cultivation`, auto-battle settings `p6-p9/bs*/bt*`;
  - the `final*` stats, rebuilt on every load.
- Character: `pet_slots` / `petMaxNum`, default 6 (`character.go:474-477`), cap 180 (`pet.go:850`). `pet_guard_data` jsonb is for later.
- Pet ids come from a global sequence. Pet equipment items use slotType 6, sids 1001..1200 (25 groups x 8; `equipment.go:458-464`, `equipment_bonuses.go:12-13`).
- Everything is persisted except the battle `Participant` copy.
- Login (`auth/login_payload.go:74-90, 277-309`):
  - It sends `petMaxNum`, `showPetId`, and `petList` keyed by pet id. Entries are the **unwrapped** `data` block of `ToDTO`.
  - `initViewPetMngP`, `onAddPet` and `contractPet` use the wrapped `{data:{...}}` form (`management.go:17-42`).
  - `showPetObj` (the `ToSceneDTO` block) is added only when a pet has `is_following=true`. The same `showPetId`/`showPetObj` go on scene payloads (`scene/pets.go:11-29`).

## 2. Stats, leveling, points
- `RecalculateStats` (`pet.go:191-291`) uses the shared `BuildBaseStats` (`stats/profile.go:70-115`, the same constants as H5 `buildBaseStats`). Inputs:
  - seeds HP 20, MP 5, hit 100, speed 100;
  - attribute `X = creature.att_X + (level-1) + apt_X_ex + gear attr` (gear raw props 20/21/22/23 → str/sta/int/eng; no agility gear prop);
  - per-mille apt = creature `apt_*` (1500-2700);
  - **growth scale = `grow_rate + grow_rate_add`** (instead of the character 0.8), not multiplied by level (`pet.go:293-310`). The DB default is 0.8;
  - creature `prop_hit/prop_dodge/...` are NOT applied to pets; SP is fixed at 150.
- Then gear flat bonuses → gear percents (props 24/25 only) → skill bonuses (passive `buff_id` → buff `prop*`; `percent_flag` 1 means a percent of the stat).
- Current HP/MP: 0 becomes max, above max is clamped. **HP is never persisted from battle**, and level-up does not refill it. Recommendation: the H5 pet starts every battle at full HP (deliberate).
- Exp: `petLevelExpTable` (`pet.go:857-875`), 160 cumulative entries.
  - `ExperienceForLevel(L) = table[L-1]` (L1 = 1); `LevelUpExperience(L) = table[L]-table[L-1]` (L1 → L2 = 36).
  - The DB holds the remainder inside the level; the client sees `exp = cumulative(level) + remainder` (`pet.go:894`).
  - Level cap 160; **no cap against the owner's level**.
  - +5 `attr_points` per level. Level-up does NOT change the base attributes (unlike characters).
- `changePetProperty(petId, {addStrength..addEnergy})` (`management.go:204`, `pet.go:427`):
  - Values are parsed from strings. A negative value, a total of 0, or a total above `AttrPoints` returns nothing.
  - Points go to `apt_*_ex`.
  - Shortfall: `onSystemMidMsgOrNote("Không đủ điểm thuộc tính!")`.
  - Pushes `onUpdatePet` for `attLastPoint, aptStrengthEx, aptAgilityEx, aptStaminaEx, aptIntelligenceEx, aptEnergyEx`, then `onRefreshPetProp {id, s: property}`.
- Life:
  - New pets have 10000 (`MaxLife`).
  - Each pet participant loses 10 at battle end for any outcome, even when dead (`rewards.go:515-540`).
  - Life 0 blocks `changePetState(1)` (`ErrPetDead`) and the `-100` swap.
  - Item type 507 (28 rows, all `n1=0`) used via `useItem(targetType, petId, itemId)` restores life to 10000 (`effect_pet_func.go`). Push `onUpdatePet(petId, "life", "<n>")`.

## 3. Acquisition
- New pet (`NewPetFromCreature` `pet.go:150-189`, `contract.go:48-105`):
  - Capacity first: `count + incoming <= petMaxNum`, else `ErrInventoryFull`.
  - Fields: name = creature name, level 1, exp 0, `grow_rate = creature.grow_base` (or an override), life 10000, `property.state = 3`.
  - Skills: `skill1..15 = -1`, then `ensurePetSkillSlots` opens 1..5 as 0, and `seedDefaultPetSkills` fills 1..5 from `data_tbl_creature_skill(cid)` ordered by `position, id`.
  - `attr_points` starts at 0. Not bound unless the caller binds it.
- Quest award (`application/quest/service.go:1198-1222`, type 12 rows):
  - `growRate = q/10` (q 16 → 1.6), then `BindPet` (`binding.go`), then `onAddPet(ToDTO())` at the end of the finish pushes (`quest/lifecycle.go:~303-310`).
  - Pet bag full: Go logs, skips the pet and still completes the quest.
  - Only 6 award rows are type 12 (quests 4, 2570, 3620, 4341, 4342, 50205); quests 4 and 2570 give creature 32 (q 16 / 19).
  - The active pet also gets the full quest exp (`service.go:1389-1410`), pushed as `onUpdatePet exp/level` + `onRefreshPetProp`.
- Pet turn-in objective (`data_tbl_quest_require` kind 3, type 12, 1344 rows):
  - Matches when the template matches, the name is unchanged, and `colorByGrowRate(growRate) >= colorByGrowRate(q/10)`, with bands `{1.1, 1.3, 1.6, 2.0, 2.5}` (`domain/pet/quality.go`).
  - The lowest `growRate` pet is deleted first, with `onDelPet`.
- Battle catch `-70` (`catch.go:24-92`, `turn_executor.go:373-400`, `pet_actions.go:18-50`):
  - Gates: the target is an NPC participant; creature `catchable == 1` exactly; creature level ≤ player level + 5; pet capacity free. If any fails, rate = 0.
    Flash shows `catchable` as "Độ khó bắt" (difficulty, 0 = no), but Go rejects every value above 1.
  - `rate = clamp(20 + round((1 - hp/hpMax) * 65) + d, 5, 95)`, where `d = min(5, lv - clv)` when the player is at or above the creature level, else `-2*min(5, clv - lv)`.
    Roll `rand(100) < rate`. **No catch item**.
  - Success:
    - `ContractPet` creates the pet with `grow_base`, unbound, state 3.
    - The target becomes `IsAlive=false` with a die action of behavior 10160.
    - It counts as a kill for exp, loot and quest credit.
  - Failure: the action is a miss with `sourceState.catchF = {cid: actorEntityId, rate, selfCatch: playerLevel}`.
  - `onAddPet` is pushed at `battlePlayEnd`, after the pet progress pushes and the reward items (`combat/battle.go:~425-460`).
- Bag summon items (`item/pet_bags.go`, types 508/550 `use_type 1`) resolve the creature by **fuzzy text matching** of the item name and description. It is heuristic; skip it or use a curated table.
  `effect_cre_book.go` (type 506 `i1` = creature) is dormant (all 506 rows are `use_type 2` skill books).

## 4. Management RPCs
Go errors go through `rtmp.ErrorToResponse` (404, 400, "Không đủ ô trống.", 500); H5 uses `RpcException`.

| RPC | Args | Rules | Reply and pushes |
|---|---|---|---|
| `initViewPetMngP` | – | all pets, wrapped DTO | `{id: {data}}`, then `onRefreshPetProp` for the active pet |
| `getPetDetailData` | `(cid, petId)` | owner check, `args[1]` | detail DTO |
| `changePetState` | `(petId, 1\|2\|3)` | other values → invalid. State 1: life > 0, demotes the other state-1 pet to 3, sets `binded=1`. State 2: demotes the other state-2 pet | `onUpdatePet(id, "state", n)` for every pet (+ `"binded"` for the changed one if bound), then `onRefreshPetProp` |
| `activePet` | – | first state-1 pet, else the following pet | `updateActivatePetObj(dto\|null)` push and the dto as reply |
| `startPetFollow` | `(petId, currentFollowId?)` | clears that id (or all), `is_following=true`; `state` is untouched | broadcast `onCancelPet(ownerCid)`, then `onCreatePet {cid, petData: sceneDTO}`, then `onRefreshPetProp` to the owner; reply `{success, pet}` |
| `cancelPetFollow` | `(petId)` | id ≤ 0 → success | broadcast `onCancelPet(ownerCid)` |
| `changePetName` | `(petId, name)` | byte length 1..20 | `onUpdatePet(id, "petName", name)` |
| `delPetByClient` | `(petId[, passHash])` or `(null, petId, passHash)` | no state/bound/follow gate; equipped items go back to the bag; optional secondary password | `onDelPet(petId)`; no `onCancelPet` |
| `bindedPetByPlayer` | `(petId)` | `property.binded=1` | `onUpdatePet(id, "binded", 1)` |
| `petOpenSlot` | – | cost = item 326 `gold` (20), goldBind first, else gold; cap 180 | `onMinusMoney(cid, type, cost, remaining)`, `onUPP{petMaxNum}`, `onSystemSay("Mất N kim phiếu")` |
| `getFinalPraDefPet`, `finalPraMagDefPet` | – | active pet stat | number |

Pet guard (`getPetGuardData`, `putDownPet`, `movePetToPetGuardSid`, `upGuardSid`, push `onUpdatePetGuardData`) lives in `characters.pet_guard_data`.
It needs class_ids 10 and `use_lv >= 50`. Later phase.

## 5. Pets in battle
- Participant (`encounter.go:92-147`):
  - id `pet_<id>`, type 39, player side, `EntityID` = pet id, `OwnerID` = owner;
  - stats from `final*` (`GetCombatStats`), `critDmg` 150;
  - `resCode, iconCode, colorCode, element`; HP/MP from `current_hp/mp`.
- Which pet fights: the first pet with `state==1 && life>0`, else the following pet with `life>0`, else none.
- Slots: owner at S (10..14) → pet at S+5 (15..19). This is the default because `setBp` defaults to false (`connection.go:91`).
- Start pushes:
  1. `onUpdatePet(petId, "currentHp", "<n>")`, then `"currentMp"`;
  2. `onSetCharState{state:5}`;
  3. `onBattleStart` with the pet in `cList`: `{type:39, id, cid(owner), resCode, colorCode, iconCode, element, currentHp, currentMp, bossFlag:0}`.
- Commands: `battleUpdateCmd` takes an array; index 0 is the owner and any other index is the pet (`commands.go:~290`). The pet command is optional.
  - Readiness waits only for living player characters.
  - With no pet command, a basic attack on the front-line enemy is generated at round start, or a timeout/defend when there is no target (`turn_processor.go:169-200`).
  - A pet skill (`-50`) is not ownership-checked and uses the pet's MP.
- `-90` recall: removes the pet participant; behaviors 15000 → 17000 → turn-back 10100.
- `-100` swap, `id` = pet id (`turn_executor.go:418`):
  - The current pet's id means recall.
  - Otherwise the new pet needs owner + `life>0` (`ResolveBattlePetSelection`); it takes the old slot (or owner+5).
  - Sequence: return 15000 → 17000, summon 16000 (`extra {type:0, pet: dto}`) → 18000, turn-back.
  - Afterwards every pet's `state` is rewritten (the active one 1 and bound, others 3), pushed as `onUpdatePet(id, "state", n)` (`service.go:308-360`).
- Pet exp (`rewards.go:83-125`): only on a win. `petExp = floor(splitExp * 0.5)`, where `splitExp` is the per-survivor character exp.
  It goes to each surviving owner's pet participant even if the pet died. No owner-level cap. `petBattleExpPct` is never read.
- Battle end (`battle.go:~425-460`): `onUpdatePet(id, "exp", "<cumulative>")`, `onUpdatePet(id, "life", "<n>")`, `"level"` if leveled, then `onRefreshPetProp {id, s}`.
  Order: `applyPetRewards` → `applyPetLifeDrain` → loot → `applyCaughtPetRewards`.
- Pet death has no persistent effect: the pet skips the rest of the battle, still gets the exp share and the life drain, and HP is not saved.

## 6. Pet skills
- Slots 1..15 in `property.skillN`; 1..5 open by default.
- `petOpenSkill(petId, slot)`:
  - Slot 6..15 and value -1.
  - Cost `[10,20,40,70,110,160,220,290,370,460][slot-6] * {1:1, 2:3, 3:10}[qLevel]`, goldBind first, then gold.
  - Pushes `onMinusMoney`, `onUpdatePet(id, "skillN", 0)`.
- `petBook(petId, bookItemId)`, reply `{f, rf?, n?}`:
  - The book is `type 506 && use_type 2` (199 rows).
  - Skill from `item.skill_id` (0 in the seeds), else an exact `name` match in `data_tbl_skill` at the lowest level.
  - `skill.cre_kind` = `classIds|minQLevel` must match the creature `class_ids` / `q_level`; 0 means unrestricted.
  - First slot with value 0; no conflict on id, name, `code_name` or `script_req_l`.
  - Failures: `f=2` for a book or skill problem, `f=1, rf=false` for no slot or a conflict, `f=3` for bad input.
  - Success: `{f:1, rf:true, n}` + `onUpdatePet(id, "skillN", skillId)` + `onRefreshPetProp`. The stack is decremented after the save, rolled back on failure.
- `petDelSkill(petId, slot, passHash)`:
  - The pet must be bound, else `onSystemSay("Phải khóa pet mới xóa được")`.
  - Secondary password; consumes item 1364 "Thuốc Tẩy Kỹ Năng Pet".
  - Pushes the slot push, then `onUpdatePet(id, "skillN", 0)`, then `onRefreshPetProp`.
- Passive skills (`skill.type 11` + `buff_id`) add to `final*`. Example: skill 5527 (`cre_kind '3|3'`) → buff 2113 = +22 % HP (`percent_flag 1`).
  Prop ids 1, 2, 4-9, 11 are scaled when the flag is 1; 10, 12-19, 25, 34 are direct.

## 7. Pet equipment (positions 50..57)
- `data_tbl_equipt_template` kind 9, positions 50-57: 572 rows. Slot = position - 49 (`equ1..equ8`).
- Gates (`equipment.go:408-445`):
  - `req_level <= pet level`;
  - `req_class` pipe list contains the creature `class_ids`;
  - `req_class_id` pipe list contains the pet template id;
  - the item is in the bag.
- `petEquipOn(petId, itemId)`: the displaced item takes the freed bag slot.
  Pushes: `onUpdatePet(id, "equN", itemId)`, `onMoveItem` per move, `onRefreshPetProp`, `onPetEquipOn {pid, pos, oldSid, newSid}` ("sid" values are item ids).
- `petEquipOff(petId, itemId)`: to the first free bag slot.
  Pushes: `onMoveItem`, `onUpdatePet(id, "equN", 0)`, `onRefreshPetProp`, `onPetEquipOff {pid, pos, sid}`.
- Bonuses: `mainProp1/2`, `prop1/2` (instance overrides, else the template), plus `bindMainPropNum1/2`.
  Flat props 1, 2, 4-9, 11-13, 14-19, 34; percent 24 (HP), 25 (MP); float 14, 26-32. Order: flat → float → percent.

## 8. Growth stubs (for a later phase)
All are free, with no randomness and no item cost:
- `petStar`: `upgrade_num++` (max 12). `petStarClear` resets it.
- `toPetFeather` + `NextStep`: `featherLevel++` (max 10), `grow_rate_add += 0.01`.
- `toPetEnvolution`: needs `level >= 30*(evo+1)` and `stars >= 2*(evo+1)` → `evo++` (max 5), base apts x1.05, `grow_rate_add += 0.05`.
- `petJoin` / `seniorPetJoin`: each material gives `+max(1, level/10)` to all `apt_*_ex` and `grow_rate_add += 0.01*(evo+1)`; the material pet is deleted.
- `petEat`: `+1 + costLevel/20 (+ luck)` to one `apt_*_ex`; the cost pet is deleted; secondary password.
- `petXd`: progress +10; at 100 → +5 to one apt. `petPzXsd`: `+itemId % 10` to all five apts. `petXsd`: `grow_rate_add += 0.01`.
- Tables that exist but are unused by Go: `data_tbl_pet_contract` (50), `pet_talent` (1024), `pet_soul` (840), `pet_stone` (132), `sublimation_pet`, `creatureh_*`.

## 9. Mounts and flying (not part of M4 pets; plan separately)
- Mount state is per character (`character_feature_states`, key `mount`: `lv, exp, upLv, addRate, addRateDay, useDress, getDate, extraDresses`).
  Login sends `mountInfo` as a JSON string (`mount/service.go:128-158`).
- `data_tbl_mount_dress` (18 rows). `beginMounting(dressId)` → broadcast `onMountOn {cid, resCode, wp:0}`. `stopMounting` → `onMountOff {cid, isMountOn:false, wp, ee, ef, star}`.
- Feeding items 3804 / 3805 / 6273. Also `getMountList`, `checkHaveMount`, `renewMount`. Mount stats feed character stats (`statfeature/character.go:89`). No speed effect was found.
- `beginFlying`: level ≥ 50 and a flyer equipped (position 14), else `onMidNote("Cần trang bị phi hành và đạt cấp 50 mới có thể bay")`.
  Broadcasts `onBeginFlying{id}`; `stopFlying` sends `onStopFlying`.

## 10. Map follow
- `onCreatePet {cid: ownerCid, petData}` and `onCancelPet(ownerCid)` are broadcast to the map, **including the owner**.
- `petData` = `ToSceneDTO` (`pet.go:560-607`): `id, cid, tid, name, level, currentHp, currentMp, hpMax, mpMax, life, element, property, apt*, equ1..8,
  petTrendAction:0, posCenterX:0, posCenterY:0, leaderId:0, growBase, resCode, iconCode, colorCode, brightCode, classId, catchable, qLevel`.
- The client moves the sprite itself; movement pushes carry no pet data.
- A character entering a map carries `showPetObj` in its scene payload. Nothing is pushed when a following pet is deleted.

## 11. Worked example: quest 4 "Nhận Pet"
- Quest 4: start NPC 238, finish NPC 237, min level 2, `award_exp_re 62`, 150 moneyBind. Award row 1350: kind 2, type 12, item 32, num 1, `q 16`, `b 1`.
- Creature 32 "Tiểu Nấm Yêu":
  - `att` 6/5/20/5/5 (str/agi/sta/int/eng), `apt` 1900/1600/2500/1500/1500, `grow_base 0.8`;
  - `catchable 1`, `class_ids 3`, `q_level 1`, `use_lv 1`, `life 3500`;
  - `res_code 2060100000014`, `icon_code 3060100000014`, `color_code -173`, `bright_code 116`, `is_bind 0`;
  - no `data_tbl_creature_skill` rows.
- Resulting pet:
  - `template_id=32, name="Tiểu Nấm Yêu", level=1, experience=0` (client exp 1);
  - `grow_rate=1.6, grow_rate_add=0, upgrade_num=0, evolution_lv=0, element=0, life=10000, is_following=false`;
  - `attr_points=0`, all `apt_*_ex=0`;
  - `property`: `state=3, binded=1, skill1..5=0, skill6..15=-1`.
- Stats (computed):

| | grow 1.6 (quest), Lv1 | Lv10 | grow 0.8 (catch), Lv1 | Lv10 |
|---|---|---|---|---|
| hp | 972 | 1400 | 496 | 710 |
| mp | 201 | 554 | 102 | 279 |
| atk | 62 | 161 | 31 | 80 |
| def | 304 | 466 | 151 | 232 |
| matk | 52 | 145 | 26 | 72 |
| mdef | 146 | 408 | 73 | 203 |
| hit | 103 | 107 | 101 | 103 |
| dodge | 2 | 6 | 1 | 3 |
| speed | 135 | 199 | 117 | 149 |
| crit | 2 | 5 | 1 | 2 |

- `finishQuest` push order: `onAddMoney`, `onUPP` (exp/level), [active-pet exp/level pushes + `onRefreshPetProp`], items, `onAddPet({data})`.
- Catchable creatures on map 3: 56 "Nấm Lục" (`catchable 1`, `grow_base 0.8`, spawn levels 5/3/3/3/4); also 14, 2, 4. The map `q_level` is ignored by catch.
  - Lv1 player vs a Lv3 creature at full HP: `20 + 0 - 2*2 = 16 %`. At 20 % HP: `20 + 52 - 4 = 68 %`.

## 12. Port notes
```ts
// server/src/modules/pet/pet-stats.ts (pure; reuse buildBaseStats with a growth-scale parameter)
petStats(c, p: {level, growRate, growRateAdd, aptEx}, gear) {
  const lv = p.level > 1 ? p.level - 1 : 0, scale = p.growRate + p.growRateAdd;
  attrs[k] = c.att[k] + lv + p.aptEx[k] + gear.attr[k];
  // buildBaseStats(attrs, apt = c.apt, scale) (character uses 0.8); no creature prop*; then gear flats, gear pct (HP/MP), skill buffs
}
award(charId, creatureId, growRate?, bind?) {
  if (count + 1 > petMaxNum) return null;            // quest: silent skip; catch: fail
  row = { level: 1, experience: 0, growRate: growRate ?? c.growBase, life: 10000, state: 3, binded: bind ? 1 : 0,
          skills: [0,0,0,0,0, ...Array(10).fill(-1)] };  // slots 1-5 seeded from data_tbl_creature_skill
}
gainExp(pet, n) { pet.experience += n; while (level < 160 && experience >= need(level)) { experience -= need(level); level++; attrPoints += 5; } }
catchRate(pl, cl, hp, max) { clamp(20 + Math.round((1 - hp/max) * 65) + (pl >= cl ? Math.min(5, pl - cl) : -2 * Math.min(5, cl - pl)), 5, 95) }
```
- Placement:
  - Module `server/src/modules/pet/`.
  - Creature columns to add to `gamedata/combat-data.ts`: `catchable, classIds, qLevel, isBind, iconCode, colorCode, brightCode, life`, and the skills from `data_tbl_creature_skill`.
  - Shared `packages/shared/src/pet.ts`.
- H5 hooks:
  - `Fighter.kind = 'pet'` at owner slot + 5; the pet command at `cmd[1]`;
  - quest award kind 2 and the kind-3 turn-in (`quest-reward.service.ts`);
  - settle: pet exp and life;
  - login and scene payloads: `petMaxNum, showPetId, petList, showPetObj`.
- Decisions:
  - catchable `=== 1` (Go) vs `> 0`;
  - full pet HP at each battle start (recommended);
  - replacing the fuzzy bag-summon matcher.
- Recommended order: schema + creation + login snapshot → management RPCs + follow → pet in battle (participant, exp, life) → catch → skills + equipment → growth (designed from the client).

## 13. Unverified / open
- **Stub RPC replies**: whether Flash accepts the stub reply shapes such as `{success, pet}`.
- **Catch failure display**: `catchF` and die 10160 were not cross-checked against the Flash battle code.
- **`onUpdatePet` value types**: string vs number per key.
- **Exp table**: the pet exp table was not diffed against the client `PET_LEVEL_EXP`.
- **`data_tbl_pet_contract`**: column meaning unknown.
- **Pets in group battles**: edge cases not traced.
- **Mounts**: mount speed and mount combat stats not traced.
- **Stale legacy memory**: `pet-system.md` overstates the growth RPCs and says pet HP is persisted (the code does not persist it).
