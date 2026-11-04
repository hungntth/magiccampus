# Life skills, idle systems and quest leftovers (M15): Implementation Plan

**Date**: 2026-11-04 · **Status**: Draft (awaiting approval)

**Goal**: port roadmap milestone M15 (`2026-11-04_11_FEATURE_GAP_ROADMAP_2.md` §3) to H5:
- the five life skills: Câu Cá, Hái Thuốc, Trồng Trọt, Nấu Ăn, Chế Thuốc, with Sức lực (vigor) and độ thành thục (dex);
- gathering: fishing schools, herb nodes, mushroom/fruit picks, mining with the gathering glove;
- cooking and medicine;
- the map-57/58 farm plots and the Magic Estate (Trang viên Pháp Thuật, 16 RPCs);
- the offline auto task (Tự động hoàn thành phụ bản) and the Mạo Hiểm Bí Cảnh dice board (20 RPCs);
- the quest leftovers: daily, class, guild and callboard quests, the quest manager window, cross-map "Tìm",
  `checkLuckyTime`, `getLoopQuestStartTime`, `npcScript` / `onList` menus and the `npcFuncOther` healer.

Today none of this exists in H5:
- `server/src/modules/skill` only serves `initLearnedSkill`;
- the character has no vigor or dex fields;
- `SUPPORTED_QUEST_TYPES` is {1, 2, 4, 10, 7};
- the NPC dialog has no scripted menus.

The plan has **six independently shippable phases**:

| Phase | Content |
|---|---|
| A | Life-skill core and gathering (fish, herb, pick) |
| B | Mining (ProductPanel) and cooking/medicine |
| C | `npcScript` menus and the farm plots |
| D | Magic Estate |
| E | Secret treasure hunt and auto task |
| F | Quest leftovers |

**Research base** (the implementer reads these first):
- Legacy memory: `E:\mcgame\docs\memory\` `farm-life-skill.md` (all sections), `crafting-system.md`, `food-potion.md`,
  `temp-bag.md`, `auto-task.md`, `dungeon-phu-ban.md` ("Quick complete via the auto-task panel"),
  `secret-treasure-hunt.md`, `treasure-map.md`, `npc-quest-system.md`, `quest-loop-system.md`,
  `quest-start-grants.md`, `fishing-contest.md`.
- The legacy STH wire research: `E:\mcgame\docs\research\2026-10-24_15_SECRET_TREASURE_HUNT_RESEARCH.md`. It is binding
  for the STH payloads; the STH pushes were read from SWF bytecode because `CallBack.as` did not decompile.
- H5 memory: `quest.md`, `loop-quest.md`, `npc-dialog.md`, `forge.md`, `activities.md`, `inventory.md`, `pets.md`,
  `progression.md` (currencies, `character_features`, gmGrant).
- **Legacy paths.** The legacy checkout is `E:\mcgame` (CLAUDE.md says `D:\`), and it is read-only. File references
  below are relative to it: `H/` = `internal/presentation/rtmp/handlers/`, `A/` = `internal/application/`,
  `L` = `docs/client/config/Language.as`, `GP` = `docs/client/predef/GamePredef.as`.

## 1. Scope

| # | Sub-feature | Legacy RPCs (verbatim) | Pushes (verbatim) | Data | Legacy memory |
|---|---|---|---|---|---|
| 15.1a | Life-skill core | `skillLearnByClient` (life branch), `useItem` on books 2400/2408/2409/2410/2411, `initLearnedSkill` | `onSkillUpdate`, `onUpdateLifeDex`, `onUpdateLearnedSkill`, `onUPP {vigor, maxVigor, fishDex…}`, `onBlueMsg` | `data_tbl_skill` types 14–18 (10 rows each) | farm-life-skill |
| 15.1b | Fishing | `clickNpc` (npc type 21), `queryFishPool`, `quitGatheringClinet` | `onSetCharState` 26, `onGathering`, `quitGathering`, `onSystemMsgCode 20` | npc type 21 (37), `data_tbl_plan` t 8 `8-N`, rods `data_tbl_equipt_template` type 1201 | farm-life-skill |
| 15.1c | Herb picking | `clickNpc` (type 23 runtime nodes), `queryHerb`, `quitGatheringClinet` | `onSetCharState` 28, `onGathering`, `onNpcOff`, `onNpcOn` | npc 1241–1250, `data_tbl_map.pl_product`, items type 612 | farm-life-skill |
| 15.1d | Mushroom / fruit picks | `clickNpc` (type 24 sub 1), `queryGather` | as herbs, plus the 06:00/18:00 window | npc type 24 sub 1 | farm-life-skill |
| 15.1e | Mining (product) | `onProductReady({npcId, gloveId})`, `onProductCancel`, `queryGather` | `productInit {nid, iid}`, `onProduct(stock\|"f"\|"eb"…)`, `onGloveEquip(1\|2, id)` | npc type 24, `data_tbl_plan` `5-N`, gloves type 1200 | farm-life-skill |
| 15.2 | Cooking, medicine | `newCook`, `newMedicine`, `initLearnedSkill`; recipe books type 516 via `useItem` | `onAddCharactorSlot`, `onDelCharactorSlot`, `onUpChaSlotStackNum`, `onSystemMidMsgOrNote` | skill types 17/18 (base), 21 (54) / 22 (24) recipes, product `i1..i3`/`n1..n3` | crafting-system, food-potion |
| 15.3a | Farm plots (maps 57/58) | `npcScript(func)`, `queryPlant(plotId[, ownerCid])`, `ripenImmediately`, `uproot`, `doDoubleHarvest` | `onList`, `onNpcMsg`, push `ripenImmediately(plotId, 9)`, push `uproot(plotId, 1)`, push `doubleHarvest(plotId)`, `onNpcOn`, `onNpcReload`, `onGetRipeMsg`, `onGathering`, `a` (guide) | plot npcs 1228, 1707–1725; crop npcs 1229–1240, 1525–1529 | farm-life-skill |
| 15.3b | Magic Estate | `getFarmByCid`, `getFriendFarm`, `addMineral`, `delMinearl`, `addFarmNum`, `farmLvUp`, `harvestMine`, `steelMine`, `getFarmBag`, `getFarmBagAll`, `getFromFarmBag`, `getFarmLog`, `getReplayList`, `saveReplay`, `delReplay` (+ `queryPlant` above) | `onGetFarmData`, `onGetFriendFarm`, `onAddMineral`, `onDelMineral`, `onAddFarmNum`, `onFarmLvUp`, `onHarvestMine`, `onSteelMine`, `onUpFarmBag`, `onGetFarmLog`, `onGetReplayList`, `onSaveReplay`, `onDelReplay`, `addFarmLog`, `onMinusMoney`, `onUPP {actpoint, movePnt}` | `data_tbl_mineral_template` (10 rows) | farm-life-skill |
| 15.4a | Auto task | `getAutoTaskData`, `autoTaskStart`, `autoTaskCancel`, `autoTaskComplete`, `autoTaskCompleteByGold`, `autoTaskGetAward` | `onGetAutoTaskData`, `onAutoTaskStart`, `onAddMoney` | `GP.TASK` / `EXP_SWEEP` / `MONEY_SWEEP` (constants), item 3630 | auto-task, dungeon-phu-ban |
| 15.4b | Secret treasure hunt | `sthPlayIsInGroup`, `getSecretTreasureHuntData`, `SecretTreasureHuntGo`, `SecretTreasureHuntGoXY`, `afterSTHPlayerStop`, `buySecTreaHuntSZ`, `setSTHIfCheck`, `getTreaHuntJiechuGold`, `SecTreaHuntGoldJiechu`, `getFriendOnlList`, `STHForHelp`, `STHCancelTrip`, `friendSecTreaHuntJiechu`, `getSTHScoreRank`, `getSTHSpeedRank`, `autoPlaySecretTreasureHunt`, `autoSecretTeasureHuntComplete` (sic), `stopAutoPlaySecretTreasureHunt`, `getSecretTreasureHuntLiJiGold`, `AutoPlaySecretTreasureHuntLiJi` | see §2.8 | `data_tbl_mevent_map` (103), `data_tbl_mevent_type` (19), items 5290–5302 | secret-treasure-hunt |
| 15.5 | Quest leftovers | `initCB`, `initCBByItem(idx)`, `takeCBQuest(sIndex)`, `takeBuildQuest`, `checkLuckyTime(qid)`, `getLoopQuestStartTime(type)`, `npcScript`, `npcFuncOther(npcId, funcId)`, `initQuestManager` (tabs); item locators `useRadar`, `useSeek`, `useTrack` | `onGetLoopQuestStartTime`, `onList`, `onNpcPos`, `onCharPos` | quest types 3 (285), 6 (810), 9 (712), 11 (320), 12 (92); npc types 8 (22) and 13 (4) | npc-quest-system, quest-loop-system |

**Research outcomes that change the roadmap line:**
- **`onGetMakeLimitTimes` is not a cooking RPC.** It is the DecoratePanel / mystery-treasure counter `{n, t}`
  (`H/mysterytreasure/make_actions.go:166-181`, `H/craft/get_make_limit_times.go:1-8`). It moves to M13.6.
- **`canQuest` is owned by the quiz contest** (`H/quiz/handler.go:1-9`). It moves to M10.5.
- **The roadmap's "treasure map items" are unrelated item utilities.**
  - `useRadar` (NPC locator, `H/item/radar.go:1-9`), `useSeek` (player locator, `H/item/friend_items.go`) and
    `useTrack` (teleport to a player, `H/item/track.go:1-8`) are cheap and go into phase F.
  - `treasureTake` is the key/bag gacha board (`H/item/treasure_board.go`); it moves to M13.
  - The real treasure maps (items 41/42/3388/3389/313) are a `useItem` hook with no RPC of their own. They are listed as
    an optional phase-E extra (§8 E3).
- **`uproot`, `ripenImmediately` and `doubleHarvest` are server pushes.** Each one asks the client to confirm, and the
  client then calls the RPC of the same name (`doDoubleHarvest` for the booster) (`H/npc/farm.go:220,245,267` and
  `:835-992`).
- **`queryPlant` is the map-plot tooltip, not an estate call** (`H/farm/handler.go:100-158`).
- **Mining in Go is a placeholder.** `productRewardTemplateIDForNPC` turns the sub_type digits into an item id
  (`H/npc/gathering.go:156-173`), so it grants potion ids 2/3/4. The data's real pool is the `npc.item` plan key `5-N`.
- **Quest award kind 3 (skill) has 0 rows.** Kind 2 (pet) has 6 rows and is already ported, so skill rewards need no
  work.

## 2. Confirmed mechanics

### 2.1 Life-skill core
- **Skills and books.**
  - `data_tbl_skill` types: 14 Câu Cá, 15 Trồng Trọt, 16 Hái Thuốc, 17 Nấu Ăn, 18 Chế Thuốc. Each has 10 levels.
  - Books (type 505, "Nhấp đôi để học kỹ năng"): 2400 Câu Cá, 2408 Hái Thuốc, 2409 Trồng Trọt, 2410 Nấu Ăn, 2411 Chế
    Thuốc (`A/skill/life_skill.go:34-47`).
  - Row ids run in different directions: Trồng Trọt 4965..4956 and Hái Thuốc 4975..4966 descend, the others ascend.
    **Always select by `type` + `level`**, never by id order.
- **Learning.**
  - `useItem` on a book needs character level ≥ `req_level` (50) and creates the level-1 skill row.
  - "Bạn đã học kỹ năng này." keeps the book; "Cấp độ không đủ!" is the level refusal.
  - Nấu Ăn and Chế Thuốc can also be learned from the panel without a book: `skillLearnByClient` on the level-1 id
    (`learnsWithoutBook`, `A/skill/life_skill_cost.go:13-15`).
- **Upgrading** (`skillLearnByClient(skillId)`, `A/skill/life_skill.go` `upgradeLifeSkill`). The next level's row
  gates the upgrade:

  | Gate | Column | Refusal text |
  |---|---|---|
  | Character level | `req_level` (L1..L10: 50, 55, 60, 70, 80, 90, 100, 105, 110, 120) | "Cấp độ nhân vật không đủ" |
  | Dex | `dex_skill` (the dex is not consumed) | "Độ thành thục không đủ" |
  | Exp pool | `exp_skill` (deducted from the exp pool) | "Kinh nghiệm không đủ" |
  | Silver | `price`, from the selected silver then the other one (`life_skill_cost.go:17-40`) | "Bạc không đủ" |
  | Contribution | `cost_guild_contrib` (L6/L7 only; guild contrib, then donate) | "Điểm cống hiến không đủ" |

  - `gold` is 0 for every life skill.
  - Reply `{success, skill}`; a failure replies `{success:false}` plus `onSystemSay`.
- **Dex ladders** (`dex_skill` for L2..L10):
  - Fish / Plant: 560, 800, 1760, 3130, 28750, 47500, 82080, 168000, 330000.
  - Herb: the same, except L7 = 37500.
  - Cook: 560, 800, 1760, 9600, 40400, 102500, 160000, 160000, 220000.
  - Medicine: 560, 800, 1760, 9600, 40400, 102500, 160000, 320000, 640000.
- **State pushes** after any learn, upgrade or craft (`H/../utils/life_skill_state.go:24-54`), in this order:
  1. `onSkillUpdate(skills)`
  2. `onMWeaponSkillUpdate(skills, true)` (not used in H5)
  3. 5 × `onUpdateLifeDex {prop, value}`
  4. `onUPP {fishDex, herbDex, plantDex, cookDex, medicineDex, money, moneyBind, guildContrib, donateContrib}`
  5. after a learn only: `onUpdateLearnedSkill "<id>"`
- **Vigor (Sức lực, Go `CurrentSP`)** (`domain/character/vigor.go:16-65`, `A/farm/vigor_regen.go`):
  - **Cap**: level × 10, plus flat prop 40 "Giới hạn sức lực" bonuses.
  - **Hourly refill**: +10 % of the cap per full online hour of the local day, never above the cap.
  - **Daily refill**: full, at the first online minute of a new day. A value above the cap is never cut.
  - Client texts: L `CHARACTORPANEL_S[40]` "Mỗi ngày khi online 1 giờ sẽ được hồi phục 10% giới hạn." and `[61]`
    "Online càng lâu điểm sức lực nhận được càng nhiều, cách 1 ngày sẽ khôi phục đầy".
  - Login sends `vigor` / `maxVigor`; `onPlayerLevelUp` carries `maxVigor`.
- **Notices**: `onBlueMsg` "Mất N điểm sức lực" and "+N độ thành thục <kỹ năng>" (`utils/life_skill_notice.go:46-57`).

### 2.2 Gathering (fishing, herbs, picks)
- **Tooltips.** `queryFishPool(id)`, `queryHerb(id)` and `queryGather(id)` reply `{name, level, remain}`.
  `remain` is the live stock for herb and pick nodes (`H/npc/gathering.go:30-85`, `gathering_herb.go:79-93`).
- **Requirement order** (`H/npc/gathering_tools.go:76-97`), checked before anything is spent:
  1. Skill learned, else "Bạn chưa học kỹ năng %s."
  2. Skill level ≥ `npc.lv`, else "Cấp kỹ năng %s không đủ, cần cấp %d (hiện cấp %d)."
  3. Tool equipped (equipment slot position 13, shared by the rod and the glove):
     - rod (template type 1201), else "Bạn chưa trang bị Cần Câu.";
     - glove (type 1200), else "Bạn chưa trang bị Găng Tay Thu Thập.".
  4. Bag room.
- **Fishing (npc type 21)**:
  - Flow: `onSetCharState {cid, state:26}`, then one round per bar.
  - Round push: `onGathering {hint:" Đang câu cá", delay: rod.pro_time*1000, prop:{fishDex}}`.
  - **At the end of a round**, charge 2 vigor and give +2 fishDex (owner rule 2026-11-02; a miss also costs).
  - Then roll the rod's `succ_rate`:
    - miss: "Câu cá thất bại, cá đã sổng mất.";
    - hit: one weighted pick from `data_tbl_plan` `t=8, st="8-"+min(lv,7)` (by `r`; rows with `qid` only while that
      quest is active).
  - The next round starts at once (server-side auto-repeat).
  - Stop pushes: `quitGathering` + `onSetCharState state 1`.
  - Stop causes:
    - not enough vigor: `onSystemMsgCode 20`;
    - bag full;
    - rod removed: "Bạn đã tháo Cần Câu, ngừng câu cá.";
    - cancel.
  - Rods (`pro_time` s / `succ_rate` %): 1437 20/70, 1438 20/75, 1622 10/98, 1629 19/85, 1630 17/95, 1631 17/70,
    1632 25/95, 1697 20/75, 1698 8/90, 1699 8/80, 1700 8/70, 2275 8/95.
- **Fishing tools (type 515, 15-minute buffs, round time never below 5 s):**
  - 2391 Bột Mì (-2 s), 2392 Tôm (-4 s), 2393 Giun Đất (-6 s / +5 %), 2394 Tôm Viên (-8 s / +5 %), 2398 Dầu Mè (-6 s),
    2397 Lao (+10 %).
  - A bait clears the other baits.
  - Not usable: 2395, 2396, 2399.
- **Herbs (npc type 23)** (`herb_nodes.go:23-47`, `gathering_herb.go`):
  - The templates are 1241–1250 (Dược Thảo Cấp 1–10), parked on map 200.
  - At runtime each map group gets 8 nodes placed at random `data_tbl_map.pl_product` points ("x,y|x,y").
  - Stock is rand(num ± 5) (num 50). Respawn takes `rf` minutes (seed -1, so 5 min) and the node moves to another free
    point.
  - Map groups by level: L1 {2,15}, L2 {17,41}, L3 {34,27}, L4 {5,8}, L5 {42,16}, L6 {7,35}, L7 {22,18},
    L8 {21,19}, L9 {23,29}, L10 {24,20}.
  - Round: `onSetCharState 28`, then `onGathering {hint:" Đang hái <name>", delay:5000, prop:{herbDex}}`. After 5 s the
    node gives 1, charges 1 vigor / +1 herbDex and delivers one of the two herbs of `item_level` N:
    - levels 1–5 start at 2491 + 2(N−1);
    - levels 6–10 start at 2603 + 2(N−6).
  - The last pick broadcasts `onNpcOff(id)`. The regrown node broadcasts `onNpcOn {id, nid, map, name, resCode, x, y}`.
  - Empty-node note: "%s đã bị hái hết, khoảng %d phút nữa sẽ mọc lại.".
- **Picks (npc type 24 sub_type "1": Nấm Tươi, Hoa Quả, Nấm Dại)** (`gathering_pick*.go`):
  - 5 s rounds, no vigor, no dex. Stock `num` (10) per node, respawn `rf` (10 min).
  - Rewards: Nấm Dại 2015; Hoa Quả 17; Nấm Tươi 19 Nấm Lục, or 20 Nấm Tím at 10 %.
  - Only open 06:00–07:00 and 18:00–19:00 ICT. H5 already filters visibility (`gamedata/npc-visibility.ts`, the
    `MushroomFruit` tag).
  - Out-of-window click: "%s chỉ mọc vào %s mỗi ngày, hẹn gặp lại lúc đó.".
- **Cancel.** The X button sends `quitGatheringClinet` (no args). The reply is `{success:true, npcId}`, followed by
  `quitGathering` and state 1. A round cancelled early costs nothing.
- **Quest substitutions:**
  - Tiệm Thuốc Đông dailies 5226–5232: while one is active and short, a herb round on its maps gives the quest herb
    2924–2930.
  - Quest fish (plan rows with `qid`) always go to the normal bag.
  - The Âu Dương dailies 1793/1794/1796/1797 have a bulk turn-in. The exp is round(`BASIC_GET_EXP[lv]` × 1.5) per unit,
    ×2 for 1796/1797, one turn-in a day (`A/quest/gathering_quest_bulk.go`, `gathering_quest_exp.go`).

### 2.3 Mining (ProductPanel)
- **Opening.** `clickNpc` on a type-24 product NPC pushes `productInit {nid, iid:"<reward tid>"}`.
  - The panel takes the glove from `GLOBAL_SETTING.glid`. The login payload must carry the equipped glove id.
  - `equipOn` / `equipOff` of a type-1200 glove push `onGloveEquip(1|2, itemId)` (`H/item/glove_equip.go`).
- **Start.** `onProductReady({npcId, gloveId})` takes one object argument (ProductPanel.as:724-729).
  - The reply comes first: the stock left (int), or an error string:
    - "e": not a product NPC;
    - "eg": no glove;
    - "ee": glove durability 0;
    - "em": MP < 30.
  - On success the server charges 30 MP (`onUPP {currentMp}`) and sets state 13.
- **Rounds.** The server waits 1 s, then every `glove.pro_time` s rolls `succ_rate`:
  - success: `onProduct(stockLeft)`;
  - miss: `onProduct("f")`;
  - after each round: wait 1 s, recheck the glove and charge 30 MP again;
  - stop strings: "em", "eg", "eb" (bag full).
- **Client mapping.** The client maps e/ed/eg/em/eb/ea/ee/el to `PRODUCTPANEL_S[12..20]`. Examples: [15]
  "Nhắc nhở: Không có găng tay!", [16] "Nhắc nhở: MP không đủ!", [17] "Nhắc nhở: Túi đầy!".
- **Cancel.** `onProductCancel()` (no args, also sent when the panel closes) → state 1, `{success:true}`.
- **Gloves** (`pro_time` / `succ_rate`): 1123 Tân Thủ 25/70, 1124 20/70, 1125 15/80, 1126 Đặc Cấp 10/90, 1127 VIP
  10/100, 1131 10/100. Defaults 25 s / 70 %.
- **Not in Go:** 0.1 glove durability per round and the "sức sống" cost described in `PRODUCTPANEL_S[9]/[13]`.

### 2.4 Cooking and medicine
- **Call.** `newCook(ingredients, recipeSkillId[, 17])` and `newMedicine(ingredients, recipeSkillId[, 18])`.
  `ingredients = {"1": itemId, "2": itemId, "3": itemId}`; all three slots are required (`H/item/life_skill.go:56-147`).
- **Gates** (`A/skill/life_skill.go:149-182`):
  - the recipe skill (type 21 → Nấu Ăn, type 22 → Chế Thuốc) is learned (a character_skills row);
  - the base life-skill level ≥ the recipe `level`.
- **Ingredients.** The product is `skill.use_item_id`. Its item template's `i1/n1, i2/n2, i3/n3` are the ingredients.
  Each slot's instance must match its template id. Example: recipe 5088 makes 2536 Xúp Bí Ngô = 10 × 2530, 10 × 2482,
  10 × 2481.
- **Result** (Go):
  - consume the ingredients; grant `use_item_id` × 1, plus `use_item_type` × 1 when > 0 ("Sản phẩm phụ");
  - bound if any ingredient was bound;
  - +20 dex of the base skill (`lifeSkillCraftMasteryGain`).
  - **No success roll, no daily limit, no vigor/MP cost.**
- **Reply.** `true` on success. Otherwise `null` plus `onSystemMidMsgOrNote` with one of: "Thiếu nguyên liệu",
  "Không tìm thấy công thức", "Chưa học công thức", "Cấp kỹ năng sống không đủ", "Không thể thực hiện kỹ năng sống".
- **Client loop.** The client plays a 2 s bar, then calls the RPC. "Làm hết" repeats while the stacks last.
- **Recipe books** (type 516, 144 rows) via `useItem` (`A/skill/recipe_book_match.go`):
  - name match, in order: alias map (5305, 6968), exact name, name minus "Sách Dạy Nấu " / "Công Thức ", then the
    product name;
  - learning needs base level ≥ recipe level; the new skill row's level = the recipe level;
  - texts: "Bạn đã học công thức này.", "Cấp kỹ năng sống không đủ.".
- **Panel data.** LifeSkillPanel reads TBL_SKILL types 21/22 client-side and asks only `initLearnedSkill`. Strings are
  in L `LIFESKILLPANEL_S` (1311-1365): [0] "Kỹ năng sống", [43] "Nấu ăn", [44] "Chế thuốc", [48] "Nguyên liệu cần",
  [51] "Làm", [52] "Làm hết", [53] "Đang làm...", [54] "Sản phẩm phụ".
  - **Note:** `data_tbl_recipe` (187 rows) is the dress-recipe table, not cooking.

### 2.5 Farm plots (maps 57/58)
- **Plots and limits.**
  - Plot NPCs: 1228 and 1707–1725 (`A/farm/service.go:97-110`).
  - One active plot per character. A second plant is refused with "Tại kênh X - vị trí Nông Trường Số Y [x,y], bạn có
    một vườn <crop>".
- **Plot menu** (`onList`, `H/npc/farm.go:421-450`): "Trồng cây ngắn ngày", "Trồng cây dài ngày", "Trồng nông sản đặc
  biệt", "Thao tác nông trường", "Ta muốn xem cách trồng cây".
  - Its operations: "Sử dụng thuốc tăng trưởng", "Lập tức thu hoạch", "Tiêu diệt".
  - Crop labels are "<crop name> (Lv N)".
- **Planting** (`farm.go:32-38, 85-93`):
  - Costs: 25 vigor, and Trồng Trọt level ≥ crop `npc.lv`. Refusals: "Cấp độ kỹ năng không đủ", `onSystemMsgCode 20`.
  - Short crops take 4 min; long crops take 40 min and yield ×5.
  - The money tree needs seed 2909 ("Ngươi không có Hạt Giống Cây Kim Tiền"), takes 40 min and yields 5 × 1156.
- **Crops** (`service.go:113-137`):

  | Crop NPC | Harvest item | Base yield |
  |---|---|---|
  | 1229 | 2481 | 11 |
  | 1230 | 2482 | 11 |
  | 1231 | 2483 | 10 |
  | 1232 | 2484 | 12 |
  | 1233–1236 | 2485–2488 | 10 |
  | 1239 | 2489 | 10 |
  | 1240 | 2490 | 10 |
  | 1525–1529 | 2613–2617 | 10 |

- **Visual stages.**
  - Plant: `onNpcOn`.
  - At 1/3 of the grow time: `onNpcReload` with the growing res code.
  - Ripe at `ReadyAt`: `onNpcReload` with the ripe res code, plus `onGetRipeMsg` to the owner.
  - Withered at `ReadyAt + 2/3 × grow`: plot reset.
- **`queryPlant(plotId[, ownerCid])`** → `{name, plantName, ownerName, level, remain, total, state, timeLeft}`.
  - state 2 counts down to `ReadyAt`; state 3 counts down to the wither time ("Cách thời gian héo úa").
- **Harvest.**
  - Click: `onSetCharState 27` and `onGathering {hint:" Đang thu hoạch", delay:5000}`.
  - Then `onAddItem` + `onAddCharactorSlot`, +20 plantDex, and the achievement 294 counter.
  - **A friend's share**: a non-owner may take `max(1, total/10)` once per plot. Only one sharer is allowed, and the
    owner must keep ≥ 1 (`service.go:252-315`).
- **"Lập tức thu hoạch" (ripen now).**
  - A ripe plot harvests at once. Otherwise the server pushes `ripenImmediately(plotId, 9)` and the client confirms.
  - RPC `ripenImmediately(plotId)`: 9 gold ("Mất 9 vàng", `onUPP {gold}`), ripen, harvest (`farm.go:835-896`).
- **"Tiêu diệt" (destroy).** Push `uproot(plotId, 1)`, the client confirms, then RPC `uproot(plotId)`: 1 gold, delete,
  "Đã tiêu diệt nông sản trên ô đất này." (`farm.go:936-992`).
- **"Sử dụng thuốc tăng trưởng" (booster).** Push `doubleHarvest(plotId)`, then RPC `doDoubleHarvest(plotId)`.
  - It doubles the yield once ("Nông sản đã được tăng sản lượng." on a repeat).
  - **Go charges nothing** (`farm.go:897-935`).

### 2.6 Magic Estate (Trang viên Pháp Thuật)
- **Profile** (`domain/farm/magic_estate.go:16-76`):
  - 16 slots, base `farmNum` 2, exp max 1921;
  - `actpoint` (Năng Lượng) max = level × 10 + 150;
  - `movePnt` (Điểm Hành Động) max = level × 5 + 100;
  - a farm bag of `{c, tid, num}` slots.
- **Entry gate.** Level 20 (`FAZENDAPANEL_S[11]` "Người chơi cấp 20 trở lên mới có thể vào trang viên").
- **`getFarmByCid(cid?)`** replies and pushes `onGetFarmData`. The payload (`H/farm/magic_estate.go:549-600`):

  ```
  {farm: {name, exp, timeStamp, f, id, cid, farmNum},
   icon,
   mine: {slot: {havestFlag, id, time, num, maxNum}},
   lv}
  ```

  - `f` is the AS-literal string `{1:{id:"..",num:"..",maxNum:"..",time:N,havestFlag:B},…}`.
- **`getFriendFarm`** → `onGetFriendFarm`: the same views for every friend (relationships).
- **`addMineral(slot, mineralId)`** (`A/farm/magic_estate.go:350-426`):
  - Slot ≤ `farmNum`, slot empty, and not in its harvest cooldown.
  - Costs `mineral.money` silver (selected silver first, `estate_money.go`) and `mineral.act_pnt` actpoint.
  - Gives estate exp +1. The slot holds `num = maxNum = mineral.num`.
  - Pushes: `onMinusMoney(cid, key, cost, left)`, `onUPP {actpoint}`, `addFarmLog "Đã mất 100 điểm Năng Lượng"`,
    `onAddMineral`.
  - Errors: "Không đủ bạc hoặc ngân phiếu", "Không đủ điểm Năng Lượng".
- **Minerals** (`data_tbl_mineral_template`, all `money` 10000, `act_pnt` 100, `time` 60):

  | Ids | Names | Yield | Items |
  |---|---|---|---|
  | 1–5 | Nham Quái / Tinh Thụ / Tinh Quái / Nhện Tơ / Cự Hùng Thường | 100 | 7, 18, 22, 25, 27 |
  | 6–10 | the same "Hiếm" versions | 50 | 24, 21, 23, 26, 28 |

- **`harvestMine(slot)`** (`:428-471`, handler `:203-256`):
  - The yield goes to the farm bag. Cooldown ends at now + `time` minutes.
  - Pushes `onUpFarmBag {idx:{c,tid,num}}`, `addFarmLog "Nhận N<name>(Kho lương trang viên)"`, and
    `onHarvestMine {f:true, c:0, coldTime, tid, num, fid}`.
  - In cooldown: `onHarvestMine {f:false, time: remainMs}`.
  - In Go a slot is harvestable right after planting; `time` is only the replant cooldown (`FazendaFarm.as:578-595`
    resets the slot when it expires).
- **`delMinearl(slot)`** (sic): clears a planted, not-cooling slot. No refund. Push `onDelMineral {f:true, fid}`.
- **`addFarmNum()`** (`:473-506`):
  - Cost from `[0,0,30000,60000,120000,210000,330000,480000,660000,960000,1380000,1920000,2620000,3480000,4500000,
    5680000][farmNum]` bound silver.
  - Capped by the level max farm.
  - Pushes `onMinusMoney` + `onAddFarmNum {f, num}`.
  - Texts: "Số lượng đất đã vượt mức, cần thăng cấp trang viên mới có tăng số lượng đất." and
    `FAZENDAPANEL_S[3]` "Muốn tăng số đất cần {num} bạc…".
- **`farmLvUp()`** (`:508-543`):

  | Exp threshold | Max farm | Level-up cost (bound silver) |
  |---|---|---|
  | 60 | 4 | 400 000 |
  | 240 | 6 | 2 600 000 |
  | 640 | 8 | 11 000 000 |
  | 1920 | 12 | 42 000 000 |
  | 1921 | 16 | — |

  - Push `onFarmLvUp {f, exp}`.
- **`steelMine(ownerCid, slot)`** ("trộm", `:573-672`):
  - Costs 10 movePnt. Needs a planted slot that is not cooling ("Đất đang đóng băng").
  - The result is level-based: attacker > owner wins (1), equal draws (-1), lower loses (2).
  - A win takes `max(1, num/10)` of the slot into the stealer's **bag**. It writes a log entry for both sides, with a
    battle id.
  - Pushes:
    - `onUPP {movePnt}`;
    - `addFarmLog "Mất: 10Điểm Hành Động"`;
    - `onMinusMoney(cid,"movePnt",10,left)`;
    - `onSteelMine {name, result, tid, bid, logTime, cid, fid, id?, num?}`.
- **Farm bag.**
  - `getFarmBag()` → the bag map (Responder).
  - `getFromFarmBag(bagIdx, -1)` and `getFarmBagAll()` move items to the bag. Each slot is checked for room
    **before** the add (dupe fix, `farm-life-skill.md` 2026-10-22).
  - Pushes `onAddCharactorSlot` + `onUpFarmBag`.
- **Log and replays.**
  - `getFarmLog()` → `onGetFarmLog`.
  - `getReplayList()` → `onGetReplayList`.
  - `saveReplay(name, battleId)` → `onSaveReplay` + "Lưu clip thành công".
  - `delReplay(battleId)` → `onDelReplay` + "Xóa clip thành công".
  - A "replay" is a named log entry. There is no real battle to replay.
- **Actpoint refill.**
  - +10 % of the max per full online hour (`A/farm/actpoint_regen.go`), pushed as `onUPP {actpoint, maxActpoint}`.
  - The potions restore it: 2021 +100, 2074 +25, 2077 +50 % ("Năng Lượng đã đầy, không cần hồi phục.").
  - `FAZENDAPANEL_S[9]` ("…Mỗi ngày lực hành động sẽ tự làm mới thành 0") is ambiguous, and Go never resets it.

### 2.7 Auto task
- **Tasks** (`A/autotask/config.go:28-50`, from `GP.TASK`). Columns: tid, name, battles, silver, quick-finish gold.
  Every battle lasts 180 s.

  | Tid | Name | Battles | Silver | Gold |
  |---|---|---|---|---|
  | 1 | Mê Huyễn Động | 6 | 200k | 9 |
  | 2 | Kho Báu Đại Mạc | 6 | 200k | 9 |
  | 3 | Lục Tiên Cảnh | 6 | 200k | 9 |
  | 4–6 | Liệt Diễm Thâm Uyên Dễ / Thường / Khó | 7 / 7 / 8 | 150k / 200k / 250k | 10 / 10 / 12 |
  | 7–9 | Trở Về Lang Huyệt | as 4–6 | as 4–6 | as 4–6 |
  | 10–12 | Quỷ Hút Máu | 7 / 7 / 8 | 150k / 200k / 200k | 10 / 10 / 12 |
  | 13–15 | Thế Giới Số | 7 / 7 / 8 | 100k / 150k / 200k | 10 / 10 / 12 |
  | 16 | Thám Hiểm Di Tích | 8 | 200k | 12 |

- **Exp factor `EXP_SWEEP`** (per battle, × `BASIC_GET_EXP[lv]`):

  | Tid | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10–12 | 13–15 | 16 |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|
  | Factor | 1.5 | 2.8 | 2.4 | 1.8 | 2.28 | 2.5 | 2.1 | 2.6 | 2.88 | 2.14 / 2.85 / 3.12 | 2.14 / 2.85 / 3.12 | 2.5 (no client row) |

  - `MONEY_SWEEP` 0.3 × `BASIC_GET_MONEY` per battle, for tids 10–15 battles 1–5 only (bound silver).
- **Box UI.** 8 boxes: tids 1, 2, 3, 4, 7, 10, 13, 16. The boxes for 4/7/10/13 have a Dễ / Thường / Khó combo that
  sends tid + index.
- **Start** (`autoTaskStart(tid)`):
  - Costs `TASK.money` silver, plus one free run or one item 3630 Sách Tự Động Hoàn Thành Phụ Bản.
  - Free runs per day (`config.go:78-88`, `TASKSWEEPPANEL_U[21]`): level 100–119 → 1, level 120+ → 2.
  - One task runs at a time; the others queue. A difficulty group holds one entry.
- **Cancel.** A running task keeps floor(elapsed / 180 s) battles as a partial result; a queued task is dropped. No
  refund.
- **Quick finish.**
  - `autoTaskCompleteByGold(tid, true)` returns the quote ceil(gold × remaining / total), shown in
    `TASKSWEEPPANEL_U[53]` "Hoàn thành nhanh cần {num} vàng, xác nhận tiếp tục?".
  - `(tid, false)` charges gold only.
- **Award.** `autoTaskGetAward(tid)` pays the battles' exp + bound silver.
- **Payload** (`onGetAutoTaskData` / `onAutoTaskStart`):

  ```
  {todayNum, useNum, data: {data: {id, st}, queue: {"<tid>": 1}, finish: {"<tid>": battles}}, ct}
  ```

  The nesting under `data` matters (`auto-task.md`).
- **Dungeon gate** (`A/autotask/dungeon.go:1-20`). Since 2026-10-29 every tid maps to a dungeon, and the start needs:
  - the dungeon level;
  - a carried ticket (spent);
  - a normal clear of that difficulty.

  The award also pays the chest exp and the completion grant. H5 has no dungeons (M10).

### 2.8 Secret treasure hunt (Mạo Hiểm Bí Cảnh)
- **Board.**
  - A 103-cell dice board from `data_tbl_mevent_map` (`pos "x,y,meventId"`) and `data_tbl_mevent_type`, which has 19
    types. Examples: 4/5/6 chests (npc 2343/2344/2345), 7 battle, 8 Ô Đại Thánh, 9 teleport, 10 silver, 11 minigame
    "Chức năng chưa mở!", 12 exp, 13 spring, 14–17 traps.
  - Opened from activity icon 59 (level ≥ 50) or NPC 2351 Sứ Giả Bí Cảnh (map 9, 987,961), which pushes
    `onSTHShowPanel()`.
- **Constants** (`A/secrettreasurehunt/config.go:12-30`):
  - dice: 5 free normal dice a day; buy prices 20 / 50 gold, Vàng only; 50 buys a day;
  - locks: defeat 2 min, traps 5 min; unlock costs 10 gold per started minute;
  - instant finish: 2 gold per roll;
  - auto play: at least 100 s between steps; auto battles win at 80 %;
  - teleport ±10 cells; a friend-help request lives 5 min; ranks top 10.
- **Overrides on blank cells 4..100**: 8 × battle, 10 × silver, 10 × exp.
- **Rewards.**
  - Silver = `BASIC_GET_MONEY[lv]` × U[0.5, 1.0] as bound silver. Exp = `BASIC_GET_EXP[lv]` × U[0.3, 0.6].
  - Chest bags (bound): small 5298/5299, medium 5299/5300, large 5301/5302.
  - Weekly rank bags: score 5290–5293, speed 5294–5297.
- **Battles.** Manual battles are 1v1 PvE: meventId 7 → creature 2114/2118, 8 → 2115/2119, 9 → 2116/2120,
  10 → 2117/2121. A defeat revives at 10 % HP with a 2-minute lock.
- **Score.** Small chest 10, medium 20, finish 100; battle win 5 or 10.
- **Speed** = seconds from the first roll to cell 103. The weekly best counts (ISO week).
- **Wire contract.** Every RPC and its reply are in the table in `secret-treasure-hunt.md` (§"Wire contract"). Port it
  verbatim. Highlights:
  - `afterSTHPlayerStop` pushes exactly one `onSetSecTreaHuntPlayStop(type, value)`, or
    `onSetSecTreaHuntCanPlay(false, 14..17)`;
  - auto steps end with a fresh `onSecretTreasureHuntGetData(data, play, auto)`;
  - notes go through `onSTHSysMidNote(22/29/30/31/32)`.

### 2.9 Quest leftovers
- **Quest types** (`GP:348-359`): 3 CLASS, 6 ACTIVITY (Go treats it as daily), 9 CALLBOARD, 11 GUILD, 12 LUCKY.
- **Daily re-take (type 6).** A completed type-6 quest is hidden from `questLog` and from NPC lists only until its
  last completion is older than the current day (`A/quest/daily_quest.go`). The row is deleted on finish.
- **Class quests (type 3)** pay by formula:
  - `idx = classQuestsFinished % 10`;
  - exp = round(`BASIC_GET_EXP[lv]` × K[idx] × 10 / 31.5);
  - money = round(`BASIC_GET_MONEY[lv]` × K[idx] × 3 / 31.5);
  - K = `CLASS_QUEST_MONEY_EXP_NUM` [0.6..1.5] (`GP:706`).
  - H5 already has this as `loopRoundReward`.
- **Callboard (type 9, NPC type 13).**
  - `npcFuncInit {npcType:13}` opens CallBoardPanel directly (`NpcFuncPanel.as:756-759`).
  - `initCB()` → `{f:true, n:10, data:[{id, qid, state:101, sIndex, c, data}]}` (`H/quest/callboard.go:45-66`).
  - `initCBByItem(idx)` refreshes with an item from `ITEM_CALLBOARD [731, 1330..1333, 1335]`:
    - idx 0 = 731, random colour per slot (weights 20/30/30/15/5);
    - idx 1..5 = a forced colour.
    - The free board weights are 50/30/14/5/1.
    - The item is consumed only when at least one candidate exists.
    - Errors: `t:1` = the daily limit of 4 (`MAX_CALLBOARD_QUEST_NUM`, `CALLBOARDPANEL_S[0]` "Số lần làm mới đã vượt quá
      giới hạn, 1 ngày chỉ có thể làm mới tối đa {num} lần!"); `t:2` = no item ("Bạn không có Đông Huyền Lệnh Kỳ
      tương ứng!").
  - `takeCBQuest(sIndex)` accepts with the real objectives, colour stored on the row.
  - Exp = round(`BASIC_GET_EXP[lv]` × 0.15) × `CALLBOARD_AWARD_NUM` [1,2,8,12,20][colour].
  - Money = `money_num` × the same factor.
  - Completion bonus by colour: Trắng 1 NL cấp 3 + 1 item 1407 … Cam 1 NL cấp 5 + 5 (`callboard_bonus.go`).
  - Level fit: target spawn level ≤ char level, within 10 levels (`callboard_level.go`).
- **Guild quests (type 11).**
  - `takeBuildQuest({id, nid} | (qid, npcId))` accepts like `takeQuest` and replies `{flag:true, qn}`
    (`H/quest/build_quest_args.go`, `lifecycle.go:122-150`).
  - Example: 4669 "Đăng Ký Bang Hội Mỗi Ngày" at NPC 1069.
- **`checkLuckyTime(qid)`** → `{itemId: qid, lastTime: 0}`. No quest has a time limit (`H/quest/lucky_time.go`).
- **`getLoopQuestStartTime(type)`** → `{startTime}`, and pushes `onGetLoopQuestStartTime {"51": midnightMs}`
  (`H/quest/manager.go:57-77`).
- **Quest manager window** (QuestManager.as). Strings:
  - `QUESTMANAGER_U` (L 4003-4012): tabs "Đã nhận" / "Có thể nhận" / "Liên hoàn"; buttons "Xong", "Bỏ", "Nhận",
    "Làm mới", "Phục hồi", "Hoàn thành ngay".
  - `QUESTMANAGER_S` (L 1842-1851): [1] "Xác nhận từ bỏ nhiệm vụ: {name}?", [4] "NPC mở: ", [7] "(Thời gian chờ để
    nhận lần tiếp theo: {minute} phút)", [8] "(hoàn thành)", [9] "(chưa hoàn thành)".
  - The "Có thể nhận" list is client-filtered with `Player.canTakeQuest` over `questLog`.
- **`npcFuncOther(npcId, funcId)`** (NPC type 8 healer, `H/npc/npc_func_other.go:109-190`):
  - funcId 1 = character, 2 = pet, 3 = both.
  - Cost = ceil((missingHP + missingMP × 1.3) × min(1, `BASIC_GET_MONEY[lv]` / 70000)) per target, paid in bound
    silver (or silver by the selected type).
  - Pushes `onUPP` + `onAddMoney`.
- **`onList` / `npcScript`.**
  - `onList(npcId, title, info, [{label, func}])` shows a scripted menu, with the built-in "Rời khỏi"
    (`NPCFUNCOTHER_U[0]`). `npcScript(func)` runs an entry.
  - When the NPC also has quests, "Nhiệm vụ" (`open_npc_interaction_<id>`) is prepended.
- **Locators.**
  - `useRadar(name)` (items 1397 / 1484 / 1615) → `onNpcPos([{name, posMapId, posX, posY}] | null)`.
  - `useSeek(name)` → `onCharPos`.
  - `useTrack(name)` (items 1034 / 1483) moves next to a player on an ordinary map.

## 3. Decisions for H5
1. **Single process, UTC+7.** All day keys use `@mc/shared` `dayKey`. Node stocks, gathering tasks and STH friend help
   live in memory (as in Go); a restart regrows nodes and drops running rounds.
2. **Vigor** becomes `character.vigor` (default = cap at creation, lazily filled for old characters).
   - `maxVigor` is derived: level × 10, plus prop 40 through the stat providers.
   - The hourly / daily refill rides on the existing 60 s online-time ticker of `modules/activity`. A per-day
     `vigorHours` counter goes in `character_features.vigor {day, minutes, refilledDay}`.
   - The same ticker drives the estate actpoint (phase D).
3. **Dex fields** go on `Character`: `fishDex`, `herbDex`, `plantDex`, `cookDex`, `medicineDex` (default 0). Dex is never
   consumed.
4. **`skillLearnByClient`** is owned by M9.3.
   - If M9.3 has landed, phase A adds a life-skill branch for types 14–18.
   - Otherwise phase A registers the RPC limited to life skills (refusing other types with "Chức năng chưa mở"), and
     M9.3 extends it.
   - The exp pool is the character's current-level exp. H5 exp is cumulative, so the cost may not take the character
     below the start of its level (`levelStartExp`); record this.
5. **Gathering is server-driven.**
   - A `GatheringTasks` registry holds one task per session (fish, herb, pick, product or farm harvest).
   - A new click replaces the task. The task is cancelled by `quitGatheringClinet` / `onProductCancel`, scene change,
     battle start, disconnect or back to char select.
   - All charges happen **at the end of a round** (Go 2026-11-01).
6. **No temp bag yet (M11.3).** Rewards go to the bag, and the room is checked before a round starts and again before
   the node take.
7. **Runtime node ids.**
   - Herb nodes use 980000 + 16 × group + slot.
   - STH NPC ids are static.
   - H5 sends them in `createNpcs` through a new `SceneNpcProvider` hook in the scene module. Picks and farm plots use
     the same hook for per-viewer state (crop stage, depleted).
8. **Mining reward (H5 fix).** One weighted pick from `data_tbl_plan` where `st == npc.item` (e.g. "5-2"), by `r`.
   - Grantable rows only: `ti` 29/19, no `qid`.
   - A node with no plan key is refused with "e".
   - The Go placeholder (sub_type digits) is not ported. Glove durability −0.1 per round is not ported (Go).
9. **Cooking** follows Go: no success roll, no limit, +20 dex. `onGetMakeLimitTimes` is out of scope (M13.6).
10. **Farm plots.**
    - Go rules, including the gold costs (ripen 9, uproot 1 — gold, never goldBind).
    - The booster `doDoubleHarvest` costs nothing (Go). **Open question Q3.**
    - Confirms use the legacy push names `ripenImmediately` / `uproot` / `doubleHarvest`. H5 renders them as a
      `confirmDialog` and then calls the RPC.
11. **Magic Estate.**
    - Ported as Go, including harvestable-at-once with `time` as the replant cooldown. **Open question Q4.**
    - `movePnt` refills to max on the first estate access of each UTC+7 day (H5; Go had no refill, so stealing would
      die out).
    - Replays are log entries only; there is no battle replay.
    - Friends come from `modules/social` relationships.
    - Mutating calls take `withCharLock`; steal locks both ids in order.
12. **Auto task depends on dungeons.** The phase ships the panel, the timers and the rewards behind a `DungeonGate`
    interface. Until M10 lands, the gate refuses every tid ("Cần vượt qua phụ bản này trước" — reuse the Go refusal text
    if one exists). The free-run and book rules work unchanged. **Q5** asks whether to allow a level-only gate before M10.
13. **STH** follows the Go design defaults (`config.go`).
    - No line gate, since H5 is single process.
    - Chest and rank bags are granted as items. `useItem` on 5290–5302 opens them like the diary chests: a level-scaled
      exp + bound silver (`activity-rewards`, `REWARD_K.sth`), plus named items when the description parses.
    - Achievements 6401–6408 are not counted (as in Go).
14. **Gold** means `gold` only, never `goldBind`, for every paid action here: dice, unlock, quick finish, ripen,
    uproot. The top-up stays "not ready".
15. **Quest types.** Add 3, 6, 9, 11 and 12 to `SUPPORTED_QUEST_TYPES` with these rules:
    - **Re-take**: per-UTC+7-day re-take for type 6, and for 9 too. Go's "type 9 completed forever" is a known gap; H5
      lets type 9 return the next day.
    - **Rewards**: the class formula for type 3, the callboard formula and bonus for type 9.
    - **Gating**: type 11 needs guild membership (H5 rule; Go relied on NPC placement).
    - **Type 12**: rows are offered only if they pass the normal gates; `checkLuckyTime` returns 0.
    - Gathering bulk turn-in for 1793/1794/1796/1797.
16. **Cross-map "Tìm".**
    - A shared pure `mapRoute(fromMap, toMap, gates)` does a BFS over the transport gates (`data_tbl_sceneitem` type 3,
      already cached) and returns the gate chain.
    - The client walks to the first gate, takes it, and continues after `onSceneEnter` until it reaches the NPC map,
      then calls the existing `talkToNpc`.
    - No route → today's toast.
17. **Herb quest substitution** (5226–5232) and the Âu Dương bulk turn-in land in phase F. They need type-6 quests.
18. All new RPCs are registered **without `quiet`**, with `requireCharacter`, and `forbidInBattle` when they change state.

## 4. Shared protocol additions (`packages/shared/src`, re-exported from `index.ts`)
- **`lifeSkill.ts`**:
  - `LifeSkillType = {FISH:14, PLANT:15, HERB:16, COOK:17, MEDICINE:18}`, `RecipeType = {COOK:21, MEDICINE:22}`;
  - `LIFE_SKILL_BOOKS` (template → type);
  - `DexProp` = `'fishDex' | 'herbDex' | 'plantDex' | 'cookDex' | 'medicineDex'`;
  - `UpdateLifeDexPush {prop, value}`;
  - `maxVigor(level, bonus)`, `vigorRefill(state, minutes, day)` (pure);
  - `LifeSkillLearnReply {success, skill?}`;
  - `CraftIngredients = Record<'1'|'2'|'3', number>`.
- **`gathering.ts`**:
  - `GatherQueryReply {name, level, remain}`;
  - `GatheringPush {hint, delay, prop?: Partial<Record<DexProp, number>>}`;
  - `ProductInitPush {nid, iid: string}`;
  - `ProductReadyArgs {npcId, gloveId}`;
  - `ProductReadyReply = number | 'e' | 'eg' | 'ee' | 'em'`;
  - `ProductPush = number | 'f' | 'eb' | 'em' | 'eg' | 'ee'`;
  - `NpcOnPush {id, nid, map, name, resCode: string, x, y}`;
  - `CharStateValue` (26 fish, 27 harvest, 28 herb, 13 product, 1 normal);
  - `FISH_ROUND_COST`, `HERB_ROUND_COST`, `PRODUCT_MP_COST`, `HERB_ITEMS(level)`, `herbMapsOf(level)`;
  - fish-tool table (2391–2398).
- **`farm.ts`**:
  - `PlantQueryReply`, `FarmConfirmPush` (tuple types for `ripenImmediately(plotId, gold)` / `uproot(plotId, gold)` /
    `doubleHarvest(plotId)`);
  - `NpcReloadPush {id, resCode: string}`;
  - crop table (`CROPS`, grow 4 / 40 min, ×5 long), `WITHER_RATIO = 2/3`, `PLANT_VIGOR = 25`.
- **`estate.ts`**:
  - `EstateData` (the `onGetFarmData` shape above; ids as strings like Go), `EstateMine`, `EstateBagSlot {c, tid, num}`;
  - `AddMineralPush`, `HarvestMinePush`, `SteelMinePush`, `FarmLogEntry`, `ReplayEntry`;
  - `ESTATE_LEVELS`, `FARM_NUM_COSTS`, `LV_UP_COSTS`;
  - `maxActpoint(level)`, `maxMovePnt(level)`, `steelResult(a, b)` (pure).
- **`autoTask.ts`**:
  - `AUTO_TASKS`, `EXP_SWEEP`, `MONEY_SWEEP`, `freeRunsPerDay(level)`, `quickGold(task, remainMs)`,
    `autoTaskReward(tid, battles, level)`;
  - `AutoTaskPayload {todayNum, useNum, data: {data: {id?, st?}, queue, finish}, ct}`.
- **`sth.ts`**:
  - the STH constants, `SthData` / `SthPlay` / `SthAuto` (per the legacy research doc), `SthPlayStopPush`, rank rows;
  - pure `rollTarget`, `resolveTeleport`, `unlockGold`, `weekKey` (ISO week, UTC+7).
- **`questExtra.ts`**:
  - `CallBoardEntry {id, qid, state, sIndex, c, data}`, `InitCbReply {f, n, data} | {t: 1|2}`;
  - `ITEM_CALLBOARD`, `CALLBOARD_AWARD_NUM`, `CLASS_QUEST_MONEY_EXP_NUM`;
  - `LuckyTimeReply`, `LoopStartTimePush`;
  - `NpcListEntry {label, func}`, `OnListPush` (tuple);
  - `NpcPosEntry`, `CharPosPush`;
  - pure `mapRoute()` + test.
- **`protocol.ts`**:
  - `PlayerData` += `vigor`, `maxVigor`, the 5 dex, `actpoint`, `maxActpoint`, `movePnt`, `maxMovePnt`, and
    `interfaceData.glid`;
  - `PlayerUpdate` += the same keys;
  - `QuestType` += `ACTIVITY: 6, GUILD: 11, LUCKY: 12`;
  - `NpcType` += `CALLBOARD: 13`, `HEAL: 8` if missing.

## 5. Server design
| Module | Owns |
|---|---|
| `modules/lifeskill/` | `life-skill-rules.ts` (pure: ladder, upgrade gate, dex, vigor refill) + test; `life-skill.service.ts` (learn by book, upgrade, `addDex`, `spendVigor`, state pushes); `life-skill.rpc.ts` (`skillLearnByClient` life branch); `vigor.service.ts` (ticker hook) |
| `modules/gathering/` | `gathering-tasks.ts` (per-session registry, timers, cancel on session events); `fishing.service.ts`, `herb-nodes.service.ts` (placement, stock, respawn, `SceneNpcProvider`), `pick-nodes.service.ts`, `product.service.ts`; `gather-rules.ts` (pure: requirement order, loot picks, round time with tools) + tests; `gathering.rpc.ts` (`queryFishPool`, `queryHerb`, `queryGather`, `quitGatheringClinet`, `onProductReady`, `onProductCancel`) |
| `modules/cooking/` | `cooking.service.ts` + `cooking-rules.ts` (ingredients from the product template, bind rule) + `recipe-book.ts` (name match) + `cooking.rpc.ts` (`newCook`, `newMedicine`) |
| `modules/farm/` | `farm-plot.schema.ts` (`character_farm_plots`: characterId unique, plotNpcId, cropNpcId, plantedAt, readyAt, harvestItem, harvestCount, totalHarvestCount, sharedHarvesterIds[]); `farm-plot.service.ts` (+ stage timers rebuilt from the rows on startup); `farm-rules.ts` + test; `farm.rpc.ts` (`queryPlant`, `ripenImmediately`, `uproot`, `doDoubleHarvest`); `farm-menu.ts` (the `npcScript` handlers) |
| `modules/estate/` | `estate.schema.ts` (`character_estates`: characterId, exp, actpoint, maxActpoint, movePnt, movePntDay, farmNum, slots{1..16}, bag{idx}); `estate_logs` (characterId, logTime, result, guest, cid, tid, name, itemTid, num, battleId, saved, replayName); `estate.service.ts`, `estate-bag.service.ts`, `estate-rules.ts` + test; `estate.rpc.ts` (15 RPCs) |
| `modules/autotask/` | state in `character_features.auto_task {day, use, run{id,st}, queue[], finish{}}`; lazy `advance(now)`; `autotask-rules.ts` + test; `autotask.rpc.ts` (6) |
| `modules/sth/` | `sth.schema.ts` (`character_sth`, the Go blob fields: cycle, week, ptDice, xyDice, boughtToday, checkPt, checkXy, run{…}, lockType, lockUntil, auto, weekScore, weekBestSec, prev{…}); `sth-board.ts`, `sth-roll.ts`, `sth-battle.ts`, `sth-rank.service.ts` (Mongo aggregate over `week`/`weekScore`), `sth-help.ts` (memory), `sth.rpc.ts` (20), NPC 2351 menu via `npcScript` |
| `modules/npc/` (extend) | `npc-menu.registry.ts`: `NpcMenuRegistry.register(npcId, builder)` and `registerFunc(prefix, handler)`; `npcScript` RPC; `onList` push; the "Nhiệm vụ" prepend; `npcFuncOther` (heal) in `npc-heal.service.ts` |
| `modules/quest/` (extend) | `quest-daily.ts` (type 6/9 re-take by day key from `quest_history.finishedAt`); `callboard.service.ts` + `callboard.rpc.ts` (`initCB`, `initCBByItem`, `takeCBQuest`, board cache in `character_features.callboard {day, refreshes, slots[]}`); `takeBuildQuest`, `checkLuckyTime`, `getLoopQuestStartTime` in `quest-extra.rpc.ts`; `gathering-turnin.ts`. `quest.service.ts` is already 356 lines: new logic goes into new files, and the plan does not grow it |
| `modules/inventory` (extend) | `useItem` hooks for the life books (505), the recipe books (516), the fish tools (515), the actpoint potions 2021/2074/2077 and the STH bags; `useRadar` / `useSeek` / `useTrack` in `locator.rpc.ts`; `onGloveEquip` push from `EquipmentService` |

- **GameDataService.** `GameDataService.rows()` plus a small cached `LifeSkillDataService` (skill ladders, recipes,
  gather NPCs, `pl_product` points, plan pools by `st`, rods/gloves), as `ActivityDataService` does. Do not grow
  `gamedata.service.ts`.
- **Seeds.** Every table is already in Mongo:
  - `data_tbl_skill`, `data_tbl_npc`, `data_tbl_plan` (31631), `data_tbl_map`, `data_tbl_equipt_template`,
    `data_tbl_item_template`;
  - `data_tbl_mineral_template` (10), `data_tbl_mevent_map` (103), `data_tbl_mevent_type` (19).

  No importer change; restart the server after any re-import.
- **Battles (STH).** A battle-end listener is needed. If `CombatService` has no hook registry, add a tiny
  `BattleEndHooks` (`register(kind, fn)`) next to `battle-end.service.ts`. Daily boss already starts tagged PvE
  battles; reuse its `combat.start(...)` call shape.
- **Timers** never outlive their owner:
  - gathering: per session;
  - farm stages: per plot, rebuilt at startup from `readyAt`;
  - STH lock-expiry: per online session, lazy otherwise.
- **Spend first (mark-first).** Charges and stock takes are compare-and-set updates written before any credit. Bag room
  is checked before anything is spent.

## 6. Client design
- **Gather progress bar** `ui/gatherBar.ts` (port of GatherProgressCanvas):
  - a centred 300 px bar with the hint text and an X button;
  - `onGathering` plays `delay` ms; `quitGathering` hides it;
  - X / Esc → `quitGatheringClinet`.
  - The character plays a "gather" pose: reuse the idle sheet with a small bob, since no gather art is extracted.
    `onSetCharState` 26/27/28/13 blocks movement clicks while it lasts.
- **Node tooltips.** Hovering a type 21/23/24 NPC for 500 ms calls `query*` and shows "name / Cấp N / Còn lại: N".
- **Mining panel** `ui/productPanel.ts`:
  - layout: the glove slot, the MP line, "Thu thập", the bar, "Lần này nhận được: … / Tài nguyên còn lại: …";
  - handles `productInit`, `onProduct`, `onGloveEquip` and the error-to-`PRODUCTPANEL_S` mapping.
- **Life-skill panel** `ui/lifeSkillPanel.ts` (+ `game/LifeSkillController.ts`):
  - tabs Nấu ăn / Chế thuốc, level filter "Cấp 1..10" / "Đã học" / "Tất cả";
  - the recipe list comes from an H5 helper `getLifeRecipes()` returning types 21/22 with ingredient names, because H5
    has no client tables;
  - 3 ingredient slots ("Tự đặt ng.liệu" auto-fills from the bag), "Làm" / "Làm hết" with a 2 s bar,
    "Sản phẩm phụ".
  - A "Kỹ năng sống" tab in the character panel shows the 5 skills: level, dex / next `dex_skill`, the upgrade button
    with the cost tooltip (`TIPREQSKILL_S`), and vigor current / max.
- **NPC menus.** `ui/npcDialog.ts` gains `showList(npcId, title, info, entries)`. An entry calls `npcScript(func)`;
  "Rời khỏi" closes. The farm confirms use `confirmDialog`.
- **Farm plots.** `Entity.setRes` on `onNpcReload`. The `queryPlant` tooltip shows "Thời gian trưởng thành" / "Cách
  thời gian héo úa".
- **Magic Estate** `ui/estate/estatePanel.ts` (FazendaPanel) + `estateBag.ts` + `estateLog.ts` +
  `game/EstateController.ts`:
  - a 4×4 slot grid (locked slots greyed);
  - a mineral picker (FazendaShop, 10 rows);
  - harvest / clear modes, cooldown countdowns;
  - friend list with "Trộm";
  - the Năng Lượng / Điểm Hành Động bars, the bag "Nhận toàn bộ", the log and clip tabs.
  - Opened from the minimap red function column ("Trang viên"). Minerals use their `icon_code` through `iconPath`.
- **Auto task** `ui/autoTaskPanel.ts`: 8 boxes per `AutoTaskBox` (name, Độ combo, countdown, Bắt đầu / Dừng / Hoàn
  thành ngay / Nhận thưởng, "Đang đợi"). Opened from "Ủy thác"'s neighbour in the red column and from the activity
  strip if its id is in the data.
- **STH** `ui/sth/sthPanel.ts`:
  - the 103-cell board drawn from the `pos` coordinates on a DOM/canvas layer; the token walk animation; dice buttons
    (normal / lucky with a 1–6 picker), the buy dialog, auto play, locks with the unlock quote;
  - friend help and the two rank tabs;
  - activity strip id 59 is added to `ACTIVITY_PORTED_IDS`.
- **Quest manager** `ui/questManager.ts`:
  - tabs Đã nhận / Có thể nhận / Liên hoàn;
  - "Có thể nhận" comes from an H5 helper `listTakeableQuests()` (the server filters with `canAccept`), since H5 has no
    client quest table;
  - "Liên hoàn" shows the loop state + `getLoopQuestStartTime`.
  - Opened from the HUD "Nhiệm vụ" button. Keep `questPanel.ts` for the NPC dialog.
- **Call board** `ui/callBoardPanel.ts`: 10 rows with colour, exp, take; refresh buttons per `ITEM_CALLBOARD`.
- **"Tìm" routing** in `QuestController.find`: `mapRoute` → walk → gate → repeat. It is cancelled by any manual move.
- **Line cap.** Keep `GameScene.ts` (432 lines) from growing: each feature gets a controller owned by an existing one
  (`ActivityController`, `QuestController`, `CharacterController`).

## 7. Phases

### Phase A — Life-skill core and gathering (fish, herb, pick)
| Touch point | Change |
|---|---|
| shared `lifeSkill.ts`, `gathering.ts`, `protocol.ts` | types and constants of §4 |
| server `character.schema.ts` | `vigor`, 5 dex fields (defaults) |
| server `modules/lifeskill/*` | learn by book, upgrade, vigor ticker, state pushes |
| server `modules/gathering/*` (fish, herb, pick, tasks, rpc) | §2.2 |
| server `modules/scene` | `SceneNpcProvider` hook for runtime NPCs; `onNpcOff` / `onNpcOn` broadcasts |
| server `modules/npc/npc.rpc.ts` | `clickNpc` dispatch for types 21 / 23 / 24-sub-1 before the dialog |
| server `modules/inventory/use-item.service.ts` | books 2400 / 2408–2411, fish tools 2391–2398 (BuffService timed buffs) |
| server auth / login payload | `vigor`, `maxVigor`, dex, `interfaceData.glid` |
| client `ui/gatherBar.ts`, tooltips, character panel tab "Kỹ năng sống" | §6 |

Checklist:
- [ ] Books learn the skill and are consumed. A second use keeps the book.
- [ ] `skillLearnByClient` upgrades with every gate and the silver fallback.
- [ ] A fishing round takes rod time, charges 2/+2 at the end and rolls `succ_rate`. A miss still costs. The next round
  auto-starts.
- [ ] Herb nodes appear on the 20 maps, deplete and regrow elsewhere. Herb level N gives the item-level-N pair.
- [ ] Picks work only inside 06/18 h. The stock is per node.
- [ ] Cancel costs nothing. Scene change or battle ends the task.
- [ ] Vigor refills 10 % per online hour and fully on a new day.

### Phase B — Mining and cooking / medicine
| Touch point | Change |
|---|---|
| server `modules/gathering/product.service.ts` | `onProductReady` / `onProductCancel`, MP rounds, plan `5-N` pool |
| server `modules/inventory/equipment.service.ts` | `onGloveEquip(1\|2, id)` on equip / unequip of type 1200 |
| server `modules/cooking/*` | `newCook`, `newMedicine`, recipe books (516) in `useItem`, `getLifeRecipes` helper |
| client `ui/productPanel.ts`, `ui/lifeSkillPanel.ts`, `game/LifeSkillController.ts` | §6 |

Checklist:
- [ ] Mining refuses without a glove ("eg"). It charges 30 MP per round and rolls `succ_rate`. "eb" on a full bag.
- [ ] The glove swap pushes `onGloveEquip`.
- [ ] A cook consumes n1..n3, gives the product (+ the byproduct), binds if any input was bound and gives +20 cookDex.
- [ ] Recipe books match by the alias / exact / prefix / product order.

### Phase C — NPC script menus and farm plots
| Touch point | Change |
|---|---|
| shared `farm.ts`, `questExtra.ts` (`NpcListEntry`, `OnListPush`) | |
| server `modules/npc/npc-menu.registry.ts`, `npcScript` RPC | generic menus + the "Nhiệm vụ" prepend |
| server `modules/farm/*` | plots, stages, harvest, share, ripen / uproot / booster, `queryPlant` |
| server `modules/scene` | plot visuals via `SceneNpcProvider` |
| client `ui/npcDialog.ts` (`showList`), `game/FarmController.ts`, confirms | §6 |

Checklist:
- [ ] Planting: 25 vigor, the skill level and one plot per character (with the location text).
- [ ] Stage reloads at 1/3 and at ripe. Wither at 2/3. The owner gets the ripe notice.
- [ ] Harvest gives +20 plantDex. A friend's share follows the 10 % / one-sharer rule.
- [ ] Ripen 9 gold, uproot 1 gold, booster ×2 once. Every refusal text matches §2.5.

### Phase D — Magic Estate
| Touch point | Change |
|---|---|
| shared `estate.ts` | |
| server `modules/estate/*` (15 RPCs) | §2.6; actpoint regen on the activity ticker; potions 2021 / 2074 / 2077 in `useItem` |
| client `ui/estate/*`, `game/EstateController.ts`, minimap button | §6 |

Checklist:
- [ ] Plant (silver fallback + 100 actpoint), harvest to the farm bag, cooldown, clear.
- [ ] `addFarmNum` cost table and cap. `farmLvUp` thresholds.
- [ ] Steal: level result, 10 movePnt, logs on both sides, the stolen items in the bag.
- [ ] Farm bag → bag with the room check. The log, save and delete clip.
- [ ] Actpoint +10 % per online hour; potions restore it.

### Phase E — Secret treasure hunt and auto task
| Touch point | Change |
|---|---|
| shared `sth.ts`, `autoTask.ts` | |
| server `modules/sth/*` (20 RPCs), NPC 2351 menu, `BattleEndHooks` | §2.8 |
| server `modules/autotask/*` (6 RPCs), `DungeonGate` stub | §2.7 |
| server `useItem` | bags 5290–5302 (decision 13) |
| client `ui/sth/*`, `ui/autoTaskPanel.ts`, strip id 59 | §6 |

Checklist:
- [ ] STH: roll, walk, cell resolution for every type, chests and score, teleport and spring, traps and locks with gold
  unlock, battles (win / defeat lock), auto play and instant finish, dice daily reset and buys, friend help, weekly
  ranks and the rank-bag claim.
- [ ] Auto task: start (free run / book, silver), queue, offline progress, cancel partial, quick-finish quote and
  charge, award. The gate refuses until M10 (or per Q5).
- [ ] *(E3, optional, only if the user wants it here)* treasure maps 41/42 → identify, dig spot, outcomes table
  (`treasure-map.md`). Without dungeon map 51 it uses the "Mật Đạo → item outcome" fallback.

### Phase F — Quest leftovers
| Touch point | Change |
|---|---|
| shared `questExtra.ts`, `QuestType` | |
| server `quest.rules.ts` (types), `quest-daily.ts`, rewards for types 3 / 9, the guild gate for 11 | §2.9, decision 15 |
| server `callboard.*`, `quest-extra.rpc.ts` (`takeBuildQuest`, `checkLuckyTime`, `getLoopQuestStartTime`), `listTakeableQuests` | |
| server `npc-heal.service.ts` (`npcFuncOther`), `locator.rpc.ts` (`useRadar`, `useSeek`, `useTrack`) | |
| server gathering: herb-quest substitution, bulk turn-in 1793 / 1794 / 1796 / 1797 | §2.2 |
| client `ui/questManager.ts`, `ui/callBoardPanel.ts`, `QuestController.find` routing, the heal dialog | §6 |

Checklist:
- [ ] Daily quests reappear the next UTC+7 day. Class quests pay the formula by finished count.
- [ ] The call board: 10 slots, colour weights, 4 refreshes a day, item refresh (consumed only with candidates), take
  by `sIndex`, colour reward and bonus.
- [ ] Guild quests via `takeBuildQuest` reply `{flag, qn}`.
- [ ] The quest manager tabs work. "Tìm" crosses maps through gates.
- [ ] The healer cost formula. Radar / seek / track.

## 8. Non-goals
- Temp bag routing (M11.3) and quest bag.
- Fishing contest (Thi Câu Cá, instance schools on map 102), Đèn Thần, field events and the wish tree beyond M8's lotto.
- Glove / rod durability loss, "sức sống", bait items 2395 / 2396 / 2399.
- Autopilot gathering scripts.
- `onGetMakeLimitTimes` (M13.6), `canQuest` (M10.5) and `treasureTake` (M13).
- Real battle replays for estate clips. Estate pet guard (`FAZENDAPANEL_S[12]`). `useItemGold2` buy-and-drink.
- Dungeon content for auto task (M10).
- STH achievements 6401–6408. Sharing STH friend help across processes.
- The treasure-map Mật Thất room (map 51 NPCs) unless E3 is approved.
- Admin dashboard. Top-up (gold stays GM-granted).

## 9. Verification
1. **Unit tests** (`node:test`, pure rules):
   - life-skill ladder / upgrade gates and vigor refill (hour, day, above-cap);
   - gather requirement order, fish plan pick (qid filter), herb items per level, round time with tools (5 s floor),
     node stock / respawn;
   - mining plan pick, product error mapping;
   - cooking ingredient resolution, bind rule, recipe-book name match (the seven Go cases);
   - farm durations / yield ×5 / wither / share and the ripen / uproot / booster rules;
   - estate costs, levels, steal result, max actpoint / movePnt, bag room;
   - auto-task advance / queue / cancel partial / quick gold / reward;
   - STH roll / teleport / spring / locks / unlock gold / score / ISO week / rank claim;
   - daily re-take keys, class reward, callboard colour weights / rewards / level fit;
   - `mapRoute` BFS; heal cost.
2. **Gates.** `pnpm --filter @mc/shared build`, `pnpm -r lint`, `pnpm -r test`. Record the baseline counts first.
3. **Scripted ws e2e per phase** (`*_e2e.mjs`, as in M8) on your own test characters, with `gmGrant` / mongosh for
   level, gold, items, vigor.
4. **Browser check per phase:**
   - **A**: learn Câu Cá, fish at Đàn Cá Cấp 1 (bar, fish, vigor drop), herb on map 2, cancel.
   - **B**: mine with a glove, cook Xúp Bí Ngô.
   - **C**: plant on map 57, wait (or set `readyAt` via mongosh), harvest, ripen, uproot.
   - **D**: estate plant / harvest / steal with a second character.
   - **E**: a full STH run to cell 103; auto task refused by the gate (or a run with Q5's gate).
   - **F**: callboard take / finish, a daily quest re-take after a day-key shift (clock injection in tests, not prod),
     cross-map Tìm.
5. **Docs.**
   - New `docs/memory/life-skills.md` (A–B), `farm.md` (C–D), `sth.md`, `auto-task.md` (E).
   - Update `quest.md` (F), `npc-dialog.md` (menus, heal), `inventory.md` (`useItem` hooks), `activities.md` (ticker
     hooks).
   - Add the index lines in `PROJECT_KNOWLEDGE_BASE.md`.

## 10. Risks and open questions
- **Q1. Sizing.** M15 is large (≈ 80 RPCs). Approve the phase order A → F, or start with F (quest leftovers), which
  players see first?
- **Q2. `skillLearnByClient`.** Should phase A own the life branch now, or wait for M9.3?
- **Q3. Farm booster.** `doDoubleHarvest` is free in Go. Keep it free, or charge gold or an item? Flash `CallBack.as`
  did not decompile, so the client's prompt text is unknown.
- **Q4. Estate grow time.** Go makes a mineral harvestable immediately and uses `time` (60 min) only as the replant
  cooldown. The Flash strings `FAZENDAPANEL_S[17]` "Thời gian sinh trưởng" and `[22]` "Thời gian trồng lần sau" suggest
  both. Keep Go, or lock the harvest until planted + `time`?
- **Q5. Auto task before M10.** Ship it locked behind the dungeon gate, ship it with a level-only gate (pre-2026-10-29
  Go behaviour), or postpone the auto task until M10?
- **Q6. STH and treasure-map bags.** Are scaled exp / silver for the unopenable bags (5290–5302) acceptable, or should
  they stay inert items until a gift-bag system exists?
- **Q7. Treasure maps (E3).** In this milestone or with M10? The Mật Đạo outcome needs map 51 NPCs.
- **Risks:**
  - **Timers.** Server-driven round timers per session must be cleaned up on every exit path. Leaks show as rounds
    paid after disconnect. Cover them with an e2e disconnect test.
  - **Runtime NPC ids.** They (980000+) must not collide with future providers (the Go wedding-pickup clash). Reserve
    ranges in one shared constant.
  - **Exp cost.** `exp_skill` against H5's cumulative exp: do not de-level; if the pool is short, refuse.
  - **STH board art.** Drawing the board without the Flash board art (no extracted SWF) needs a plain layout. The token
    path comes from `pos`.
  - **Daily re-take.** It needs `quest_history.finishedAt`. Check that the field exists; if missing, add it with an
    idempotent `server/tools/backfill-quest-history-time.ts` (old rows count as "before today").
  - **Unverified.** `MSGCODE_S[20]` text (assumed "not enough vigor"); `use_item_num` on recipe rows (unused by Go);
    the mining plan keys of all 46 type-24 NPCs (check the counts at implementation time).
