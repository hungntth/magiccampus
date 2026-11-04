# Feature Gap Roadmap 2 (after M1–M8)

Status: **draft, awaiting approval**. Follows `2026-11-04_01_FEATURE_GAP_ROADMAP.md` (M1–M8, all done). This is a
roadmap, not an implementation plan: each milestone gets its own research + plan through the `feature-pipeline` skill.

## 1. How this was measured (2026-11-04)

- Legacy surface: every `Register*("name")` under `E:\mcgame\internal\presentation\rtmp\handlers\<folder>\`: 1087
  (folder, RPC) pairs. H5 surface: every `@Rpc('name')` under `server/src`: **264**. Legacy names with no H5 match:
  **734 unique** (130 of them in `stub`, which Go only acknowledged).
- RPC counts miss features driven through NPC menus (`npcFuncClick`): the **dungeons** (`application/dungeon/`, 8
  dungeons, gate guards, chests) have no RPCs of their own and are entirely missing in H5.
- `## Deferred` sections of `docs/memory/*.md` and `notReady()` buttons in `client/src/ui/` (38 call sites) were added.
- The legacy memory docs (`E:\mcgame\docs\memory\*.md`) show several features the first roadmap filed as "stub only" are
  real in Go now: mail, auction, world boss, temp bag. They move into the milestones below.

## 2. Coverage per legacy folder (H5 / legacy RPCs)

Done or near: guild 34/34, dailysignin 8/8, mount 7/7, star 6/6, warsprite 6/6, magiccrystal 5/5, heiyaoshi 4/4,
awaken 4/4, magicweapon 13/19, group 10/25, scene 10/19, auth 9/17, shop 12/21, quest 7/14, trade 5/8.

Partial: item 45/136, pet 15/37, combat 7/26, activity 14/60, npc 4/16, social 3/11, chat 3/8, pk 1/7, ranking 1/5.

Zero: dress 27, annivgames 26, secrettreasurehunt 20, petarena 18, summergame 17, farm 16, crosscontention 15, maze 15,
prs 14, threepvp 14, fairy 12, soul 11, mysterytreasure 11, marriage 10, mentor 10, starinstance 10, floppass 9,
pettalent 9, xcds 9, rune 8, petstone 8, monsterheart 8, findback 8, txkc 8, mail 7, auction 7, stoneseal 7, trials 7,
welfare 7, worldboss 7, quiz 7, hmtxl 6, autotask 6, brotherhood 6, medal 5, cardgame 5, smallgame 5, kythach 5,
anniversary 5, astrology 4, exchange 4, nineboss 3, dragonball 3, dailyanswer 3, petcontract 3, pethandbook 2,
dongxuan 2, mysteryexchange 2, rebirth 1, giftcode 1 — plus all dungeons (NPC-menu driven).

## 3. Milestones

Size: S ≈ 1 plan, M ≈ 2–3 plans, L ≈ 4+ plans. Order = proposed priority (core loop first, then content, then events).

### M9 Core loop completion — M

What the player hits every minute and still sees as "Chức năng chưa mở".

| # | Item | Legacy RPCs / source | Legacy memory |
|---|---|---|---|
| 9.1 | Auto battle (plan already drafted) | `skillSetBattle` `uif` `us` | `docs/plans/2026-11-04_10_AUTO_BATTLE.md` |
| 9.2 | Skill hotbar (30 slots, keys 1-0) | `skillSetUserBar` `uif st/sid` | hotbar-userbar |
| 9.3 | Skill learning/upgrade + training skills (Luyện) | `skillLearnByClient` `addTrainingSkill` | training-skills, class-rank-promotion |
| 9.4 | Paid relive, blood bag, potion reserve buttons on portraits | `bbGoldRelive` `bbNormalRelive` `reliveUseItem` `useBloodBag` `buyBloodBag` | blood-bag, recovery-targeting |
| 9.5 | Visible monsters/bosses on map | `createBoss` `clickBoss` `hitNpc` `setNpcState` `toMovable` | npc-quest-system |
| 9.6 | Final defence values, character detail | `getFinalPraDef` `finalPraMagDef` (+Pet) | unified-stat-formula |
| 9.7 | Settings panel, world map (Earth), help, emoji popup | `us`, client-only | — |
| 9.8 | Battle spectate/replay | `watchBattle` `startWatch` `quitWatch` `getBattleReplay` `getRecentBattles` `battleReplayEnd` | battle-spectate |

### M10 Dungeons & instances — L

The largest content block; depends on M9 (bosses, relive, auto).

| # | Item | Source | Legacy memory |
|---|---|---|---|
| 10.1 | Dungeon framework: defs, entrance/floor NPC menus, gate guard, daily lock, chest, quick complete | `application/dungeon/{defs,service,state,victory,chest,quick_complete}.go`, `handlers/scene/gate_guard.go` | dungeon-phu-ban |
| 10.2 | Eight dungeons: Kho Báu, Lang Huyệt, Liệt Diệm, Lục Tiên, Mê Huyễn, Quỷ Hút Máu, Thám Hiểm, Thế Giới Số | `*_defs.go`, `*_run.go` | dungeon-* |
| 10.3 | Star instance + task sweep | starinstance (10) | star-instance-system |
| 10.4 | Trials (Vô Định Lôi), nine-floor boss, flop pass | trials (7), nineboss (3), floppass (9) | trials-vdrl, nine-boss, flop-pass |
| 10.5 | Maze + daily answer + quiz event | maze (15), dailyanswer (3), quiz (7) | maze, daily-answer, quiz-event |
| 10.6 | Training rooms: HMTXL, TXKC | hmtxl (6), txkc (8) | hmtxl-training-room, txkc-special-training |
| 10.7 | World boss event, schedule boss, boss loot | worldboss (7), `scheduleboss`, `bossloot` | world-boss, schedule-boss, boss-loot |

### M11 Mail, auction, bags — M

| # | Item | Source | Legacy memory |
|---|---|---|---|
| 11.1 | Mail (Thùng Thư) — also the delivery channel for event/system rewards | mail (7) | mail-system |
| 11.2 | Auction house | auction (7) | auction-system |
| 11.3 | Temp bag, MX temp bag, quest bag, bank sort | `getTBag` `tempToBag` `openTempSlot` `tempBagSort` `mxBagSort` `bankSort` … (~20 item RPCs) | temp-bag, bag-bank-tabs |
| 11.4 | Trade leftovers: per-item add/remove/money, pets | `tradeAddItem` `tradeRemoveItem` `tradeSetMoney` | trade-system |
| 11.5 | Shop leftovers: limit-time shop, exchange shop, credit/guild shops | `getLimitTimeShop` `buyLimitTimeItem` `exchangeItem` `buyItemClient` `openShopDirect` `shopClosePanel` | shop-system |

### M12 Pet depth — L

| # | Item | Source | Legacy memory |
|---|---|---|---|
| 12.1 | Growth: star, evolution, feather, join/senior join, eat, xd/xsd, skill upgrade, element | pet (22 missing) | pet-system, pet-evolution-contract |
| 12.2 | Contract (gacha) + handbook | petcontract (3), pethandbook (2) | pet-evolution-contract |
| 12.3 | Pet guard, pet stone, pet talent, pet soul gem | `getPetGuardData` …, petstone (8), pettalent (9) | pet-guard, pet-stone, pet-talent, pet-soul-gem |
| 12.4 | Pet equipment upgrades | `petEquLevelUp` `petEquModColor/Pre/Bind` `repairPetEqu*` `restrainPetEquip` `sublimePetEquip` | equipment-modifications |
| 12.5 | Pet arena + pet PVE tower | petarena (18), `initPPVEPanel` `savePPVEConf` `challengeNextFloor` `getPPVERank` | pet_ppve |

### M13 Appearance & gear depth — L

| # | Item | Source | Legacy memory |
|---|---|---|---|
| 13.1 | Avatar appearance: weapon/dress/wing/flyer on the sprite, `onSetRes`, flying | `beginFlying` `stopFlying` `fixFlyState`, `setDressHide` `setWingHide` | dress-system, mount-system |
| 13.2 | Dress (Thời trang) + recipes/extract/deco show | dress (27) | dress-system, dress-draw |
| 13.3 | Wings: star, hole, feather, color/prefix/bind, advance | ~18 item RPCs (`wingJoin` `addWingStar` `feather*` …) | wing-refine |
| 13.4 | Equipment restrain/sublime, chongzhu, qiling | `restrainEquip` `sublimeEquip` `updateChongZhu` `updateQiLingProp` … | equipment-sublimation, equipment-modifications |
| 13.5 | Runes, soul, medal, stone seal, monster heart | rune (8), soul (11), medal (5), stoneseal (7), monsterheart (8) | monster-heart, … |
| 13.6 | Mystery treasure + exchange, fairy, PRS, astrology, rebirth | mysterytreasure (11), mysteryexchange (2), fairy (12), prs (14), astrology (4), rebirth (1) | mystery-treasure, fairy-system, astrology-system, rebirth |

### M14 Social depth & PvP modes — M/L

| # | Item | Source | Legacy memory |
|---|---|---|---|
| 14.1 | Mentor (teacher/student), sworn brothers, intimacy items | mentor (10), brotherhood (6), `useIntimacyItem` | mentor-system, sworn-brotherhood |
| 14.2 | Marriage + wedding hall | marriage (10), `useWeddingBag` | marriage-system |
| 14.3 | Team rooms + group leftovers | `createRoom` `applyToRoom` `getRoomList` `roomChat` … , `groupListOfMap` `getGroupMemberPosistion` | group-party |
| 14.4 | Duel invite PK, 3v3 PvP | pk (6), threepvp (14) | pvp-apvp, threepvp |
| 14.5 | Chat leftovers: chat panel header, GM chat, chat ban | `createChatPanel` `getChatPanel` `chatGM` `banChatByPlayer` | chat-ban, gm-chat-commands |
| 14.6 | Cross-server contention / cross PK worship (needs decision §5) | crosscontention (15), `teamCrossPKMobai` | cross-contention, cross-server-battle |

### M15 Life skills & idle — M

| # | Item | Source | Legacy memory |
|---|---|---|---|
| 15.1 | Gathering: herbs, mining, fishing pool, products | npc `queryGather` `queryHerb` `queryFishPool` `onProductReady/Cancel` `quitGatheringClinet` | farm-life-skill |
| 15.2 | Cooking, medicine, make limits | `newCook` `newMedicine` `onGetMakeLimitTimes` | crafting-system, food-potion |
| 15.3 | Farm (own + friends, steal, replay) | farm (16), `uproot` `ripenImmediately` `doDoubleHarvest` | farm-life-skill |
| 15.4 | Auto task (offline delegation), secret treasure hunt | autotask (6), secrettreasurehunt (20) | auto-task, secret-treasure-hunt |
| 15.5 | Quest leftovers: daily/class/guild quests, `canQuest`, quest manager window, cross-map "Tìm" | `takeCBQuest` `initCB` `takeBuildQuest` `canQuest` | npc-quest-system |

### M16 Events & monetization — L (port per user priority)

| # | Item | Source |
|---|---|---|
| 16.1 | Login award, gift codes, festival gifts, show-time info | activity `getLoginAward` `takeNewGift` `takeSPGift` `searchGameGift` `getShowTimeInfo`, giftcode `uc` |
| 16.2 | Consume/recharge/stage awards, welfare, manage plan, findback leftovers, exchange points | activity (~15), welfare (7), findback (8), exchange (4) |
| 16.3 | Mini games: card game, small game, dragon ball lottery, luck draw, kỳ thạch, đông xuân | cardgame (5), smallgame (5), dragonball (3), `getLuckDrawData`, kythach (5), dongxuan (2) |
| 16.4 | Seasonal: anniversary + anniversary games, summer games, XCDS, Halloween | anniversary (5), annivgames (26), summergame (17), xcds (9) |
| 16.5 | Ranking leftovers: activity rank awards, section awards | `getRankList` `getActAwardInfo` `takeActRankAward` `takeSectionAward` |

### Tech debt (fold into the nearest milestone)

- Quiet every RPC the user has confirmed (`quiet: true`), ask per feature.
- Split `client/src/game/GameScene.ts` and `server/src/modules/quest/quest.service.ts` (over the ~300-line cap).
- Old `GameScene` ticker keeps ticking after a socket drop (`Entity.tick` TypeError, portal.md).
- Sell without transaction (inventory.md), unverified flows listed in each memory doc.

## 4. Proposed order

M9 → M10 is the critical path (M10 needs visible bosses, paid relive and auto battle). M11 (mail) should land before
M16, since events deliver rewards by mail. M12–M15 are independent of each other after M9.

## 5. Milestone plans (all Draft, 2026-11-04)

| Milestone | Plan | Phases |
|---|---|---|
| M9 Core loop | [2026-11-04_12_CORE_LOOP.md](2026-11-04_12_CORE_LOOP.md) (A = [auto battle](2026-11-04_10_AUTO_BATTLE.md)) | A–H |
| M10 Dungeons & instances | [2026-11-04_13_DUNGEONS.md](2026-11-04_13_DUNGEONS.md) | A–I |
| M11 Mail, auction, bags | [2026-11-04_14_MAIL_AUCTION_BAGS.md](2026-11-04_14_MAIL_AUCTION_BAGS.md) | A–E |
| M12 Pet depth | [2026-11-04_15_PET_DEPTH.md](2026-11-04_15_PET_DEPTH.md) | A–G |
| M13 Appearance & gear | [2026-11-04_16_APPEARANCE_GEAR.md](2026-11-04_16_APPEARANCE_GEAR.md) | A–G |
| M14 Social & PvP | [2026-11-04_17_SOCIAL_PVP.md](2026-11-04_17_SOCIAL_PVP.md) | A–H (+ deferred cross-server) |
| M15 Life skills & quests | [2026-11-04_18_LIFE_SKILLS_QUESTS.md](2026-11-04_18_LIFE_SKILLS_QUESTS.md) | A–F |
| M16 Events | [2026-11-04_19_EVENTS.md](2026-11-04_19_EVENTS.md) | A–F |

### Shared pieces planned in more than one milestone — owner = first to land

| Piece | Planned in | Owner |
|---|---|---|
| Seed importer fixes (`INSERT … AS alias`, `INSERT … SELECT FROM (VALUES …)`, UPDATE-only seeds; e.g. `data_tbl_buff_mehuyen` is missing from Mongo) | M10 A, M16 C | M10 A |
| Scripted NPC menus `onList` / `npcScript` / `npcFuncOther` | M10 A, M14 B, M15 C | M10 A |
| `data_tbl_item_award` gift-bag opener / reward roller | M10 A, M16 A | M10 A |
| `sendSystemMail` | M11 A (used by M10, M16) | M11 A |
| `interfaceData` / `modules/settings` (`uif`, `us`) | M9 A (auto battle) | M9 A |
| Skill learning `skillLearnByClient` (life-skill branch) | M9 B, M15 A | M9 B, M15 A extends |
| Soul gems (Mệnh Hồn) | M12 E, M13 E2 | M12 E |
| Equipment sublime/restrain core | M12 D (pet), M13 D | M12 D, M13 D reuses |
| Schedule/field bosses | M9 E (loop bosses only), M10 I | M10 I |

### Roadmap corrections found during research

- `onGetMakeLimitTimes` belongs to mystery treasure (M13.6), not cooking; `canQuest` belongs to the quiz (M10.5).
- `useRadar` / `useSeek` / `useTrack` / `treasureTake` are item utilities (M15 F), not treasure maps.
- The `pkInvite` family is never called by the Flash client (M14 H: refusing stubs); crosscontention was removed from the
  legacy game on 2026-10-31.
- `tradeAddItem` / `tradeRemoveItem` / `tradeSetMoney` are never called by the Flash client (left unregistered, M11 D).
- Chu Ma Điện and the secret treasure hunt: secret treasure hunt is in M15 E; Chu Ma Điện is deferred.

## 6. User decisions (2026-11-04)

- **Planning only for now**: no code until the user says so.
- **Skill damage** (M9): the damage base keeps reading `exp_skill` (current H5 rule); the Go description-ratio rule is
  not ported (CORE_LOOP decision 4).
- **Dungeon content** (M10): port the legacy owner's authored content as-is (line-ups, stats, rewards, schedules); the
  combat mechanics H5 lacks (summons, revives, splits, openers, skill pools, immunities, …) are planned as M10 Phase E2.
- **Pet owner level cap** (M12): adopt pet ≤ owner level + 5 and update the M4 exp paths.
- **Rules follow the original** everywhere: costs, rates and gates as in the legacy. Currencies or items that have no
  source in H5 yet stay unwired (test with GM `/grant`); their sources come with the milestone that owns them.

## 7. Open questions for the user

1. Order after M9: dungeons (M10) first, or pets/gear depth (M12/M13) first?
2. Monetization and seasonal events (M16): port all, port only what has seed data, or skip for now?
3. Cross-server features (14.6) and line change (`getLineInfo` `changeLine`): in scope, or single process only?
4. Admin dashboard / GM tools from the legacy (`dashboard.md`, `server-control.md`): wanted in H5?
