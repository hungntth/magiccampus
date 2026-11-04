# Feature Gap Roadmap (H5 port vs legacy `D:\mcgame`)

Status: **draft, awaiting approval**. This is a roadmap, not an implementation plan: each milestone below gets its own
research + `docs/plans/<date>_<NN>_<FEATURE>.md` through the `feature-pipeline` skill before any code is written.

## 1. How this was measured

- Legacy surface: every `dispatcher.Register*("name", …)` under `D:\mcgame\internal\presentation\rtmp\handlers\<feature>\`
  (about 600 unique RPC names in 50+ feature folders), plus `D:\mcgame\docs\PROJECT_KNOWLEDGE_BASE.md`.
- H5 surface: every `@Rpc('name')` under `server/src` (29 RPCs), every `callback(...)`/`broadcast(...)` push name, and the
  `## Deferred` sections in `docs/memory/*.md`.
- Some legacy folders have no `dispatcher.Register` calls of their own (`awaken`, `fairy`, `lotto`, `medal`, `mount`,
  `petstone`, `pettalent`, `prabuff`, `prs`, `soul`, `starinstance`, `stoneseal`). Their RPCs are registered from other
  files, so the RPC list for each one is collected in its own research step.
- The legacy `stub` handler folder holds 132 names that the Go server only acknowledged (mail, auction, sworn brothers,
  bloody battle, world boss, anti-addiction, …). They are not real features in the reference either and are listed last.

## 2. What the H5 port already has

| Area | RPCs / pushes | Memory |
|---|---|---|
| Auth + character select/create | `login` `register` `logout` `sendCharList` `getClassList` `newChar` `chooseCharactor` `backToCharSelect` `icl` | — |
| Scene enter, other players, movement | `sceneLogin` `createChars` `udcp` `udcr` `checkNetDelay`; `onScenePlayerEntered/Left`, `onCR` | movement.md |
| Map portals | `createSceneItems` `sceneChange` `getMapList` `gmGoMap`; `onSceneEnter` | portal.md |
| NPCs + dialog | `createNpcs` `clickNpc` `npcFuncClick`; `npcFuncInit`, `onSetNpcState` | npc-dialog.md |
| Quests (newbie/main chain, talk-type) | `initQuestManager` `takeQuest` `finishQuest` `cancelQuest`; `onAddChaQuest`, `onUPP`, `onPlayerLevelUp` | quest.md |
| Bag + NPC shop buy/sell | `getInitSlot` `buyAmountItemClient` `sellItem`; `onOpenShop`, `onAddItem`, `onAddMoney` | inventory.md, shop.md |
| Chat (map channel) | `say`; `onChat` | chat.md |
| Main HUD (visual shell) | — | main-hud.md |

**Biggest gap**: the game has **no combat yet**. There are no monsters, battles, skills, equipment stats or HP/MP
loop. Most other systems (kill quests, drops, pets, PvP, dungeons, bosses, arenas) depend on combat.

## 3. Partially done features (items listed under Deferred)

| Feature | Missing pieces |
|---|---|
| Bag | item use (`useItem` family), drop, split (`moveItemNum`), sort (`bagSort`), drag/move (`moveItem`), temp/quest/pet bags, bank (`moveItemToPage`, `closeBank`), stack limits, random equipment properties, no transaction around sell |
| Shop | repair (`repair` / `repairAll`), `shopClosePanel`, `changeMoneyType`, system/VIP/limited shops (`buySystemItemClient`, `buyVipShopItem`, `getShopConfig`, `getLimitShopConfig`), credit/guild/mall shops, rich tooltips |
| Quests | item/pet/equipment rewards and grant items, kill/collect/pet objectives, quest manager window, loop quests (`takeLoop` `cancelLoop` `loopRepaire`), daily/class/guild quests (`takeCBQuest` `takeBuildQuest` `initCB`), choose-one rewards, cross-map "Tìm" pathing, `canQuest` |
| NPC | function panels other than shop (bank, healing, …), `npcScript` / `npcFuncOther`, combat and minigame NPCs, gathering (`queryGather` `queryHerb` `queryFishPool` …) |
| Portals | loading fade, minimap gate icons, dungeon gate guards, followers, decor scene items, ticker leak after socket drop |
| HUD | activity icon strip, target radial menu, potion buttons, skill bar (`skillSetUserBar`), line change (`getLineInfo` `changeLine`), emoji, VIP button, every panel behind the menu buttons |
| Chat | whisper (`wisper` `p2pWisper`), team/guild/world channels, `createChatPanel` / `getChatPanel`, GM chat (`chatGM`) |
| Auth | `onConnectAuth`, secondary password (`setDeletePass`), character delete, force login / kick, `saveGuideLog` (tutorial), `showChaInfo` / `uif` / `us` |

## 4. Missing features, grouped by dependency tier

Size: S ≈ 1 plan, M ≈ 2–3 plans, L ≈ 4+ plans. Legacy memory docs are under `D:\mcgame\docs\memory\`.

### Tier 0: Character foundation (needed by everything below)

| # | Feature | Legacy RPCs | Legacy memory | Size |
|---|---|---|---|---|
| 0.1 | Stats & attributes: base/aptitude/final layers, HP/MP, point allocation | `getCharAttributes` `getCharDetailData` `changeProperty` `getFinalPraDef` `finalPraMagDef` `lvUp` | unified-stat-formula, aptitude-stats, exp-leveling | M |
| 0.2 | Equipment: equip/unequip, durability, stat contribution, tooltip | `equipOn` `equipOff` `isEquSid` `checkEquipEdit` `setDressHide` | item-inventory, equipment-tooltip | M |
| 0.3 | Item use: potions, scrolls, transport, packages | `useItem` `useMultiItem` `useItemGold` `useTransport` `fullHpRecoverByItem` `fullMpRecoverByItem` … | item-inventory, recovery-targeting | M |
| 0.4 | Buffs | `delBuffClient`; pushes `initLongBuff` `upLongBuff` `delBuff` | buff-system | S |

### Tier 1: Combat (the core loop)

| # | Feature | Legacy RPCs | Legacy memory | Size |
|---|---|---|---|---|
| 1.1 | Monsters in scene + encounters (bosses/NPC fights) | `createBoss` `clickBoss` `hitNpc` `setNpcState` `toSafe` `toMovable` | npc-quest-system, battle-combat | M |
| 1.2 | Turn-based battle: commands, damage formula, animation, end of battle | `battleUpdateCmd` `battlePlayEnd` `cbom` `battleFieldGetInfo` | battle-combat | L |
| 1.3 | Skills: learn, battle skill set, skill bar | `skillLearnByClient` `initLearnedSkill` `skillSetBattle` `skillSetUserBar` | battle-combat, class-rank-promotion | M |
| 1.4 | Death & relive | `freeRelive` `reliveSwitch` `reliveUseItem` `useBloodBag` `bbGoldRelive` `bbNormalRelive` | battle-combat | S |
| 1.5 | Loot, EXP and gold from battle; kill/collect quest objectives | (battle result pushes), quest kill counters | quest-battle-rules, exp-leveling | M |
| 1.6 | Battle replay/watch | `watchBattle` `quitWatch` `getBattleReplay` `getRecentBattles` `battleReplayEnd` | battle-combat | S |

### Tier 2: Social & multiplayer

| # | Feature | Legacy RPCs | Size |
|---|---|---|---|
| 2.1 | Party/group (incl. group battle, follow through portals) | `groupInvite` `groupJoin` `groupLeave` `groupKick` `groupGiveLeader` `groupAFK` … (25) | M |
| 2.2 | Friends, blacklist, teacher/student | `addRelationByName` `delRelationship` `getFriendList` `getBlackList` `findTeacher` `findStudent` … (10) | M |
| 2.3 | Player trade | `newTrade` `tradeAddItem` `tradeRemoveItem` `tradeSetMoney` `tradeLock` `tradeConfirm` `stopTrade` | S |
| 2.4 | Chat channels + whisper | `wisper` `p2pWisper` `createChatPanel` `getChatPanel` | S |
| 2.5 | PvP duels / PK | `pkInvite` `pkInviteResp` `pkReady` `pkAction` `pkSurrender` `pkLeave` `PVPStartClient` | M |
| 2.6 | Rooms (team lobby) | `createRoom` `applyToRoom` `getRoomList` `roomChat` `setRoomConfig` … | S |

### Tier 3: Items & crafting depth

| # | Feature | Legacy RPCs | Size |
|---|---|---|---|
| 3.1 | Bank, temp bag, sorting, bag pages | `moveItemToPage` `closeBank` `bagSort` `tempBagSort` `openTempSlot` `getTBag` | S |
| 3.2 | Crafting: make, cook, medicine, material mixing | `newMake` `newCook` `newMedicine` `getMakeColor` `materialMixOne/All` `onGetMakeLimitTimes` | M |
| 3.3 | Equipment upgrades: stars, sockets, jewels, soul, bind, prefix, element, level, disassemble | `starOne/All` `holeDig` `jewelSet/Del/Update*` `changeSoul` `changeBind` `changePrefix` `changeElement` `changeLevel` `equResolve` + `sure*` | L |
| 3.4 | Runes | `runeSet` `runeRemove` `runeMove` `runeUpLvl` `runeResolve` `exchangeRune` `getRuneBagData` `arrangeRuneBag` | M |
| 3.5 | Fashion / dress / wings | `activeDress` `setFakeDress` `transformRecipe` `*ExtractRecipe` … (19) | M |
| 3.6 | Misc item actions | `changeName` `changeCharSex` `useRadar` `useSeek` `useTrack` `useRedBag` `useSnowBall` … | S |

### Tier 4: Pets

| # | Feature | Legacy RPCs | Legacy memory | Size |
|---|---|---|---|---|
| 4.1 | Pet core: catch/contract, manage panel, fight, follow, feed, rename | `contractPet` `activePet` `initViewPetMngP` `petJoin` `startPetFollow` `petEat` `changePetName` … | pet-system | L |
| 4.2 | Pet growth: stars, evolution, feather, skills, equipment, slots | `petStar` `toPetEnvolution` `toPetFeather` `petBook` `petOpenSkill` `petEquipOn/Off` `petOpenSlot` … | pet-system | L |
| 4.3 | Mounts / flying | `beginMounting` `beginFlying` `stopFlying` (+ `mount` folder) | stat-feature-foundation | M |
| 4.4 | Pet guard, pet stones, pet talent | `getPetGuardData` `upGuardSid` `movePetToPetGuardSid` (+ `petstone`, `pettalent`) | pet-guard | M |
| 4.5 | Pet arena + pet PVE tower | `petArenaFight` `getPetArenaRank` … (18), `initPPVEPanel` `savePPVEConf` `challengeNextFloor` | pet_ppve | L |

### Tier 5: Guild & world systems

| # | Feature | Legacy RPCs | Legacy memory | Size |
|---|---|---|---|---|
| 5.1 | Guild core: create, join/apply, members, ranks, notice, bank | `addGuild` `initGuildList` `getGuildMemberList` `confirmGuildApply` `kickGuildMember` … (32) | guild-system | L |
| 5.2 | Guild buildings & skills | `constructBuild` `finishUpgrade` `execBuildFunc` `developSkill` `contribMoney` `contribMaterial` | guild-system, TBL_BUILDING | M |
| 5.3 | Marriage | `marriageRequest` `marriageReqFeedback` `initMarriage` `marriageSeeking` `getCoupleRank` | marriage-system | M |
| 5.4 | Farm & mining | `getFarmByCid` `queryPlant` `harvestMine` `steelMine` `getFriendFarm` … (15), `uproot` `ripenImmediately` | — | M |
| 5.5 | Rankings | `getRankList` `rankGet` | — | S |

### Tier 6: Progression panels (stat-feature systems)

All share the legacy "stat feature" model (`character_stat_features`, `feature_key` JSONB). Build the shared
foundation once (6.0), then each panel is roughly S–M.

| # | Feature | Legacy RPCs | Legacy memory |
|---|---|---|---|
| 6.0 | Stat-feature foundation | — | stat-feature-foundation |
| 6.1 | Titles | `gtl` `setTitle` `setActTitle` | title-system |
| 6.2 | Achievements | `getAchieveAward` | achievement-system |
| 6.3 | Magic weapon (Thần Khí) | 17 RPCs (`mWeaponUpgrade` `magicWeaponStage` `succinctMW` …) | magic-weapon |
| 6.4 | Magic crystal (Pháp Tinh) | `initMagicCrystalData` `MagicCrystalUp` … (5) | magic-crystal |
| 6.5 | Star / zodiac / astrology / star instance | `beginStarLvUp` … (6), `getAstrologicData` `pickStar` `refreshStars` | star-system, astrology-system, star-instance-system |
| 6.6 | Hắc Diệu Thạch | 4 RPCs | heiyaoshi |
| 6.7 | War sprite (Chiến Hồn) | 6 RPCs | warsprite |
| 6.8 | Monster heart (Ma Vật Tâm) | 3 RPCs | monster-heart |
| 6.9 | Mystery treasure (Mật Bảo) + mystery exchange | 11 + 2 RPCs | mystery-treasure |
| 6.10 | Soul training, awaken, soul, medal, stone seal, prabuff, fairy | `trainSoul`, `levelUpEMedal` `initEMPanel`, others TBD | stat-feature-foundation |

### Tier 7: Activities, events & monetization

| # | Feature | Legacy RPCs | Size |
|---|---|---|---|
| 7.1 | Daily sign-in | `getSignInData` `signinNow` `dailySignInAct*` (8) | S |
| 7.2 | Daily diary / activity points | `getCharDiaryData` `getDailyActAward` `getDailyPanelAwardState` | S |
| 7.3 | Online/offline rewards | `getTodayOnlineTime` `getOfflineExp` `getPetOfflineExp` `getTodayAward` `checkDoubleExpTime` | S |
| 7.4 | Festivals & gift codes | `getCurrentFeast` `takeNewGift` `takeSPGift` `searchGameGift` | S |
| 7.5 | VIP (PM rights) | `initPmData` `buyPm` `doPmOperation` `getVipShopConfig` `buyVipShopItem` | M |
| 7.6 | Daily bosses, scheduled bosses, boss loot | `bossDailyGetData` `bossDailyBattle` `bossDailyFinishByCard` (+ `scheduleboss`, `bossloot`) | M |
| 7.7 | Consume/recharge reward events, rank events | `getConsumeAwardList` `getStageConsumeAwardList` `getPointAward` `XCDSGetRank` `getGuildWarRank` … | M |
| 7.8 | Tutorial guide | `saveGuideLog` (TBL_GUIDE) | S |
| 7.9 | Quiz/maze, lotto | TBL_ANSWER, `mazeRecover`, `lotto` folder | S |

### Tier 8: Features the legacy server only stubbed

Mail (`getMail` `addMail`), auction (`auctionSearch` `closeAuction`), sworn brothers (`becomeBrother` …), bloody
battle (`enterBloodyBattle` …), world-boss map (`wbAutoBattle` `wbLeaveMap` …), treasure hunt, DotA mode,
anti-addiction (`submitAddict`), character restore/delete. The reference has no game logic for these. Only port
one if the user asks, and then the rules come from the Flash client alone.

## 5. Proposed order of milestones

| Milestone | Contents | Result the player can see |
|---|---|---|
| **M1 Character core** | 0.1 stats, 0.2 equipment, 0.3 item use (potions), 0.4 buffs, bag leftovers (3.1, drop/split/sort) | Character panel with real stats; can equip gear and drink potions |
| **M2 Combat** | 1.1 monsters, 1.2 battle, 1.3 skills, 1.4 relive, 1.5 loot + kill/collect quests + quest item rewards | Fight monsters, level up, finish the newbie chain past the talk quests |
| **M3 Multiplayer** | 2.1 party (+ group battle), 2.4 chat channels, 2.2 friends, 2.3 trade, line change | Play together |
| **M4 Pets** | 4.1, 4.2, 4.3 mounts | Catch and raise pets, fight with them |
| **M5 Economy depth** | 3.2 crafting, 3.3 equipment upgrades, shop leftovers (repair, system/VIP shops), 3.4 runes | Gear progression |
| **M6 Guild & PvP** | 5.1, 5.2, 2.5 PK, 5.5 rankings | End-game social loop |
| **M7 Progression panels** | 6.0 foundation, then 6.1–6.10 in whatever order the user picks | Long-term stat sinks |
| **M8 Activities** | 7.1–7.9, 4.4/4.5 pet arena + PVE, 5.3 marriage, 5.4 farm, 3.5 fashion | Daily retention content |

M1 → M2 is the critical path. M3 can start once M2's battle model is settled, since group battle needs it. M4–M8
are mostly independent of each other after M2.

## 6. Per-milestone process

1. `feature-pipeline` skill: Flash client research (`flash-client-researcher`) + Go server research
   (`legacy-server-researcher`), reading the matching `D:\mcgame\docs\memory\*.md` first.
2. Plan doc `docs/plans/<date>_<NN>_<FEATURE>.md` with shared types in `packages/shared/src/protocol.ts` first.
3. Implementation (`mc-plan-implementer`), `pnpm -r lint` + `pnpm -r test`, browser check.
4. Update or create `docs/memory/<feature>.md` and link it in `docs/PROJECT_KNOWLEDGE_BASE.md`.
5. New RPCs stay unquieted until the user confirms the feature works.

## 7. Open questions for the user

- Order after M2: pets (M4) before multiplayer (M3)? Single-player testing gets more out of pets first.
- Monetization (VIP, recharge events, gold shops): port it faithfully, or skip/stub it for now?
- Cross-server battle and multiple lines (`changeLine`, cross-server-battle.md): in scope, or single process only?
- Tier 8 stubs: drop entirely?

## 8. Status (2026-11-04)

All milestones M1–M8 are implemented and committed on `main`; each milestone has its plan (`docs/plans/2026-11-04_02..09_*.md`, with per-phase
implementation notes) and memory docs (index: `docs/PROJECT_KNOWLEDGE_BASE.md`). Deferred items are listed in each plan's non-goals and in the memory
docs' "Deferred" sections (growth systems for pets, mounted sprite rendering, life skills, marriage, arenas, events without data, ...).
Open follow-ups: quiet the new RPCs once the user confirms each feature; gate the dev commands (`/go`, `/buff`, `/grant`) before any public use;
split `GameScene.ts` (~430 lines) and `quest.service.ts` (~356 lines).
