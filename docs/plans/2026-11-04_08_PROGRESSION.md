# Progression panels (M7): foundation, titles, achievements, stat-feature systems, magic weapon — Implementation Plan

**Date**: 2026-11-04 · **Status**: Approved (2026-11-04; the user pre-approved M5–M8 plans and asked for autonomous execution with one commit per milestone)
**Goal**: long-term character progression:
- titles (permanent and timed, shown over the head, granting buffs);
- achievements (tracked from game events, claimable rewards, achievement points in rankings);
- the stat-feature panels: train soul (Luyện Hồn), awakening (Thức Tỉnh), war sprite (Chiến Hồn), magic crystal (Pháp Tinh), heiyaoshi (Hắc Diệu Thạch), zodiac stars (Tinh Cung);
- the magic weapon (Thần Khí).

All of them feed the existing stat pipeline. Today none exist. The special currencies they consume (spirituality, starPnt, warSprite, ...) are absent.

Delivered in **five phases**, each implemented, lint/test-verified and browser-checked before the next:
- **A**: foundation and titles.
- **B**: achievements.
- **C**: train soul, awakening, war sprite, magic crystal.
- **D**: heiyaoshi and zodiac stars.
- **E**: magic weapon.

Research base (the implementer reads both):
- `docs/research/2026-11-04_13_PROGRESSION_CLIENT_RESEARCH.md`: Flash contracts per system (RPC args, reply shapes, panel UI, strings, `CharProperty` keys such as `spirituality`), decompile gaps (CallBack, HeiYaoShiPanel), corrections to the Go notes, open questions §18.
- `docs/research/2026-11-04_14_PROGRESSION_SERVER_RESEARCH.md`: Go rules per system with live / dead / stub status, data tables, the feature-prop dictionary, invented constants, stale legacy docs §15, recommended order, open questions §17.
- `docs/memory/character-stats.md`, `forge.md`, `guild.md` (guild-skill bonus provider), `ranking.md`.

## 1. Decisions (H5)
1. **Foundation**:
   - **Providers**: a `StatBonusProvider` registry (a Nest multi-provider token) replaces ad-hoc wiring in `CharacterStatsService`. Gear, buffs and guild skills are migrated to it with no behaviour change; the existing tests must stay green.
   - **Currencies**: a per-character `currencies: Record<string, number>` map with conditional `$inc` helpers (spirituality 241, starPnt, warSprite, battleSprite, mysteryCrystal, npPnt, ...). Names are taken from the research. Login sends them, and `CharProperty.spirituality` is added.
   - **Feature store**: a `character_features` collection `(characterId, featureKey)` → state document.
   - **BUFF_PROP fix**: feature and buff prop ids 59/60 map to `finalPraDef` / `finalPraMagDef` (Go dictionary).
     The implementer checks the shared dictionary against the research's feature-prop table and records every change. Pet and guild-skill buff stats stay green.
   - **Fractional flats** (hit 0.09 ...) accumulate as floats and are truncated once at the end (Go rounded each to 0).
   - **Dev command** `/grant <currency|item> <id> <n>` through an H5 `gmGrant` RPC, so the panels can be tested: there is almost no currency income in the data. It sits next to `gmAddBuff`/`gmGoMap`.
2. **Titles**:
   - `gtl()` → `{ct, cts}`; `setTitle(id | -1)` → `{f, t, bd?}`; `setActTitle(id | -1)` → `{f, t?}`.
   - A title grants the buff from `data_tbl_title.b`. That resolves for 448 of 472 titles; Go read the NULL `buff_id`, so no title had stats.
     The buff is long-buff row key 0 (`upLongBuff(bd)` / `delBuff(0)`).
   - The map gets an `onTitleUpdate` broadcast, and `Entity.setTitles` draws `t` above the name and `actT` one line below.
   - Owned titles are persisted. Sources: achievement rewards (phase B) and `gmGrant`.
   - `ct` filters out special (`s`) titles that the character doesn't own.
3. **Achievements**:
   - Progress is tracked by H5 event hooks for the requirement types that map to existing systems: level reached, quests finished, kills, pets owned/caught, items crafted/upgraded, guild joined, money held, ... (the research's inferred type map).
     The implementer lists each supported kind/type with its hook and records the unsupported ones.
   - `achieveReqLog` is keyed by **requirement id** (client). Thresholds with `num = 0` are parsed from the description text where a number is present; otherwise the requirement is unsupported and recorded.
   - Login snapshot: `achieveLog`, `achieveReqLog`, `takeAchieveAwardLog`, `achPoint`. Finished = a ms timestamp > 999999.
   - `getAchieveAward(aid)` is fire-and-forget; its result comes as pushes (names per the client research, or H5 names recorded).
     Rewards are items, currencies and titles. For `is_award = 2` the title name comes from `desc` ("Danh Hiệu X"), not from the achievement name.
   - `achPoint` feeds `rankGet('achPoint')`.
   - Live progress pushes `AchievementPanel.updateView(type, id, obj)` (the push name per the research).
4. **Stat-feature systems (phases C–D)** follow the data-backed rules in the server research. Specific fixes:
   - Awakening sums rows 1..L (client), not only the current row (Go bug).
   - Train-soul exp semantics: the implementer resolves `require_num` from the client display (cumulative vs per-level) and records it.
   - Zodiac: 12×12 levels; begin needs Lv 80 and unbound gold; real-time timers (30 s .. 797k s) persisted as end timestamps, so a restart keeps them; finish / cancel / speedUp per the research; stat = `add_value × addition`.
   - Heiyaoshi: 5 tables. Stage-2 multipliers are Go-invented (prop 1 ×2, ×1.5, prop 34 ×0.5); they are kept and marked Go-invented.
   - Magic crystal: 16 slots from the client-transcribed catalog. After each mutating RPC the server pushes `onInitMagicCrystalData` (the client has null responders).
5. **Magic weapon** (phase E):
   - An equipment layer: kind 8 at positions 15–20 (equip slots already exist); stats from the instance `mainPropNum1/2`.
   - `mWeaponUpgrade` costs spirituality and reads `data_tbl_artifact`. *(H5)*: its `rate` and `item_num` columns are used (Go ignored them), and the choice is recorded.
   - Also: `showMWInfo`, `getMWSkills`, repair, resolve, trans, and reset-prop single-phase (client).
   - Stage and succinct are deferred (unreachable in Go, the preview state is unclear).
6. **Deferred** (no data, no income or unreachable): astrology, star instance, monster heart, mystery treasure, soul gem, stone seal, PRS, fairy, prabuff, medals (EMedal and explorer), magic-weapon stage/succinct.

## 2. Contract
Shared types per system in `packages/shared/src/progression/*.ts` (or flat files), re-exported. RPC and push names follow the Flash client; where a push name is hidden by the aborted CallBack, the Go name is used and recorded.

## 3. Design
- Server modules: `modules/progression/` (foundation: providers, currencies, feature store, `gmGrant`), `modules/title/`, `modules/achievement/` (event bus hooks via a small `AchievementEvents` service that other modules call), `modules/feature/` (one service plus pure rules file per system), `modules/magicweapon/`.
  - Pure rules with tests; files < 300 lines.
- Client: the title panel (from the character panel or HUD), the achievement panel (HUD button), the feature panels as character-panel tabs or HUD entries per the client research (Thần khí tab Lv 50, Tinh Cung tab Lv 80, ...), title rendering over heads.
  - Keep `GameScene.ts` / `BattleController.ts` from growing.
- New RPCs are un-quieted and `forbidInBattle` where they change state.

## 4. Non-goals
See decision 6. Also: activity-bar entry flags (M8), payment for currencies (no real top-up; `gmGrant` is the source for now).

## 5. Verification
1. Unit tests per system:
   - provider registry parity (existing stats unchanged); dictionary fix; currencies `$inc` guards;
   - title buff; achievement hooks, threshold parsing and the claim;
   - each feature's costs and stat formula (awakening sum, zodiac timers with an injected clock, war-sprite aggregation, heiyaoshi stage-2, crystal slots);
   - magic-weapon upgrade with the artifact rates.
2. `pnpm --filter @mc/shared build`, `pnpm -r lint`, `pnpm -r test` (record the baseline first; last known shared 75, swf 4, server 425).
3. Browser per phase with `/grant`: set and clear titles (others see them, stats change); earn and claim an achievement (the reward arrives, achPoint rises in rankings); level each feature once (stats change in the character panel); zodiac timer finish and speed-up; magic-weapon upgrade.
4. Docs: new `docs/memory/progression.md` (foundation, currencies, gmGrant), `title-achievement.md`, `stat-features.md`, `magic-weapon.md` (+ index lines); update `character-stats.md`.

## Implementation notes (phase A)
Done 2026-11-04: foundation + titles. Phases B-E untouched. Verified: shared build, lint green, tests shared 80 (+5), server 444 (+19), swf 4; scripted ws e2e (two players + observer) and a browser run on a fresh account.

**Foundation**
- `StatBonusProvider` registry: `server/src/modules/stats/stat-provider.ts` (`STAT_BONUS_PROVIDERS` token = a factory array in `StatsModule`, since Nest has no native multi-provider). Gear, buffs and guild skills are separate providers (`core-providers.ts`); `TitleBonusProvider` is new. `CharacterStatsService.compute` only calls `collectBonuses`. To add a provider: class + `PROVIDER_CLASSES` in `stats.module.ts`. Providers read models and `GameDataService` only.
- Parity: bonuses are additive, so the split gives the same result as the old single `buffBonuses(buffs + guild skills)` (test `stat-provider.test.ts`). All existing stat, pet and guild-skill tests stayed green unchanged.
- Dictionary check (`stat-dictionary.test.ts` pins the whole table against Go `CommonFeaturePropToStat`): the ONLY change is 59/60 -> `finalPraDef` / `finalPraMagDef` (were `finalReduceHurt1/2`; those are legacy ids 15/16 and stay unreachable from buffs). Effect: `fighters.ts` already reads `finalPraDef/MagDef`, which no buff fed before. Go ids 32 (DebuffHit) and 58 (DebuffResist) have no H5 rate key and stay unmapped. The rate normalisation (`0 < v < 1` -> `v * 100`, feature path only) from the research was NOT added: it is not in decision 1 and would change pet / guild-skill numbers; do it with the first feature that needs it (war sprite / heiyaoshi).
- Fractional flats: `addProp` already accumulated floats; `assembleStats` now truncates the (base + flat sum) once with a 1e-9 epsilon before percents (`truncOnce`). Integer behaviour is unchanged.
- Currencies: `Character.currencies` (`Record<string, number>`), shared `CURRENCY_IDS` / `CurrencyKey` / `resolveCurrency` (keys or Go ids), `CurrencyService` (`credit` = capped pipeline update, `spend` = conditional `$inc`, returns null when short, `push` = `onUPP {currencies}`), pure guards in `currency-rules.ts`. Login: `PlayerData.currencies`; `CharProperty.spirituality` (optional, set in `CharacterStatsService.compute`). The push carries the full small map because the client merges `onUPP` with `Object.assign`.
- Feature store: `character_features {characterId, featureKey, state}` unique index, `FeatureStoreService` (get / put / patch with dotted `state.<field>` / list / remove). No consumer yet (phase C).
- `gmGrant(kind, id, n)` in `modules/progression/grant.rpc.ts` (not quiet, forbidInBattle); chat `/grant <currency|item|title> <id> <n>`. Item = `data_tbl_item` ids only (equipment not supported yet; phase E can extend). Title: `n` = seconds, absent / 0 = permanent. Like `/buff`, it is open to every player (dev command).

**Titles** (`modules/title/`)
- Owned titles: `character_titles` (unique per character + title, optional `expiresAt` for timed grants: hidden from `gtl`, cannot be set, active id cleared at login). Active ids: `Character.titleId` / `actTitleId` (so `toSceneCharacter` stays synchronous).
- `gtl` -> `{ct, cts, titles?}` (`titles` = H5 display data: name, style, description, buff text, expiry). `ct` = every owned title (as in Go, owned special titles appear in both lists; unowned special titles never appear), `cts` = owned titles with `s` in 1, 2. `setTitle(id | -1)` -> `{f, t, bd?}` (`t = -1` when cleared, `f:false` when not owned or expired); `setActTitle(id | -1)` -> `{f, t?}` (only special titles).
- Buff: `data_tbl_title.b` -> `data_tbl_buff`. Row key 0 shows the NORMAL title's buff (server pushes `upLongBuff(bd)` / `delBuff(0)` besides the reply; `sceneLogin` adds row 0 to `initLongBuff`). Stats use BOTH active titles' buffs (research recommendation); the special title's buff is not shown in the buff bar.
- Pushes: `onTitleUpdate` / `onActTitleUpdate` map broadcast `{cid, tid, view?}` (Go shape plus the H5 `view`), `onAddTitle {f:1, t, ct, view}` and `onAddActTitle cts` on grants, `onUPP` stat refresh (with HP/MP clamp) after a change.
- Scene payloads: `SceneCharacter.t / actT / tv / atv`; login `PlayerData.t / actT / ct / cts / tv / atv` (via `addLoginExtra`, which also validates expiry).
- Client: `ui/titlePanel.ts(+css)` (260x385, two tabs, Flash strings), `game/TitleController.ts` (owned by `CharacterController`; header button "Danh hiệu" on the character panel), nameplates through `Entity.setTitles` (title above the name, active title one line below). `GameScene.ts` stays at 429 lines (two call sites added, destroy loop compacted).
- Deviations: ct semantics interpreted as above (the plan text is ambiguous); the active title of another player is not re-validated for expiry in scene payloads (only at login / gtl / set).
- Not done / for later: custom titles (209 / 211 `actTN`), `onAchieveTitle`, brother title suffix, timed buff countdown.

## Implementation notes (phase B)
Done 2026-11-04: achievements. Phases C-E untouched. Verified: shared build, lint green, tests shared 82 (+2), server 456 (+12), swf 4; scripted ws e2e (snapshot, title-count progress, claims, battle money progress, rankGet) and a browser run (backfill at login, panel, live progress toast, claim of an item reward).

**Server** (`modules/achievement/`, two Nest modules so feature modules can import the hook without a cycle)
- `AchievementEventsModule` exports `AchievementEvents` (`record(characterId, kind, {value|amount|creatureIds})`, fire-and-forget, never throws, serialised per character, returns at once for kinds with no tracked requirement). `AchievementModule` = login snapshot + claim + RPCs (imports TitleModule, InventoryModule, CharacterModule).
- State: `character_achievements`, one doc per character (`_id` = character id): `achieveLog{aid: ms}`, `achieveReqLog{reqId: {done, progress}}` (keyed by REQUIREMENT id, the client contract), `takeLog{aid: 1}`, `achPoint` (sum of `award`), `lastLoginDay`. Dotted `$set` / `$inc`.
- Pure engine: `achievement-parse.ts` (threshold parsing incl. "1 triệu", requirement classification, reward text), `achievement-rules.ts` (index, `applyEvent`, claim gate, snapshot, catalog). Thresholds: `num` if > 0, else the first number in the description; no number = unsupported (kill-by-name defaults to 1).
- Only enabled (`enable = 1`) achievements with exactly ONE supported requirement are tracked: 42 of 566 (level 5, silver 3, gold 1, titlesOwned 3, loginDays 6, petsOwned 1, petCaught 2, friends 2, guildJoined 1, creatureKill 14, questsFinished 4). Multi-requirement ones (30) would need requirement names that are NULL in the seed, so they are unsupported.
- **Supported kind -> requirement type + description form -> hook**
  - `level` (abs): type 4 "Cấp độ người chơi đạt cấp N" / "Nhân vật đạt cấp độ N" -> quest finish, battle settle, `lvUp`, login backfill.
  - `silver` (abs): type 4 "Lượng ngân phiếu ... đạt N" -> money + moneyBind (the ranking `money` rule) -> quest finish, battle settle, login. `gold`: type 4 "Lương kim phiếu ... đạt N" -> gold + goldBind (quest finish, login). Assumption: ngân phiếu = silver, kim phiếu = gold.
  - `questsFinished` (inc): type 1 "Hoàn thành N nhiệm vụ" -> `QuestService.finishLocked`.
  - `creatureKill` (inc): type 0 "Đánh bại|Tiêu diệt <name>" (no " trong "), creature templates with that exact name -> `BattleSettleService.creditQuestsAndLoot` (every surviving winner).
  - `petsOwned` (abs, distinct creature templates): type 2 name "Số lượng pet" -> `PetService.award`, login. `petCaught` (inc): type 3 "Bắt N pet thành công" -> `PetCatchService.contract`.
  - `titlesOwned` (abs): type 7 "Số lượng danh hiệu" -> `TitleService.grant`, login.
  - `loginDays` (inc): type 8 -> once per local calendar day at login.
  - `guildJoined` (abs 0/1): type 21 "Gia nhập thành công 1 bang hội" -> guild create, `confirmGuildApply`, login. `friends` (abs): type 22 "Thêm ít nhất N người bạn" / "Số lượng bạn đạt đến N" -> `addRelationByName` (friends only), login.
- **Unsupported (recorded; shown greyed "Chưa hỗ trợ")**: type 0 craft / quality / instance-bound kills (no H5 craft-quality event), type 6 wear equipment (94), type 43 zodiac (74), type 2 pet quality / race / skills (31), type 5 skills / training / life skills, type 33 stat thresholds (a stats event could feed these later), type 1 specific quests and 200-round loops, 16 guild / loop quests, 21 guild contribution (3), 24 donate, 25-29 arenas, 34 marriage, 40-42 farm / pet arena, 44, 49, 53-61 events, pet slots (type 4 "Mở N ô pet": opened-vs-total is ambiguous), other type 4 (PK / popularity / fame points). Forge hooks (craft, star, gem upgrades): no requirement maps to them without quality / colour data, so none were added. Full histogram of reasons: `buildIndex(...).unsupported`.
- Login (`chooseCharactor` via `addLoginExtra`): counts the login day, backfills the absolute kinds (level, silver, gold, petsOwned, titlesOwned, guildJoined, friends), returns `achPnt`, `achieveLog`, `achieveReqLog`, `takeAchieveAwardLog`. Backfilled completions are also pushed (harmless: the client is not ready yet).
- Pushes (names are not in the decompiled CallBack; Go names used): `onUpdateAchieve(1, aid, {done})` (finished) and `onUpdateAchieve(2, reqId, {progress, done})`; claim: `onAddItem` + `onAddCharactorSlot`, `onAddTitle` (+ `onAddActTitle`), `onAchieveTitle name`, then `updateAchieveAwardLog {aid, num: 1}` (Go sends it first); refusals `onRedMsg`.
- `getAchieveAward(aid)` (not quiet, forbidInBattle, reply null): gate (`isAward > 0`, finished, not claimed; both `is_award` 1 and 2 are single-claim) -> resolve reward -> bag room (`canFitAll`) -> conditional `takeLog.<aid>` mark (spend) -> grant (mark undone if the grant throws). Reward text comes from `desc` (reward_* columns are NULL): `Danh hiệu X` -> title by exact name (also for is_award 1, e.g. "Nhận danh hiệu: ..."), `Nhận [vật phẩm]: A*N , B*M`, `nhận N X`, `Phần thưởng <item>` -> item by exact name in `data_tbl_item_template`. Names without a template (most "Ấn Chương" medals, fashion bags, titles 6226 / 6248) are skipped with a message; a reward with nothing resolvable is refused without marking the claim. Some `desc` rows end with a literal backslash-r (seed artefact): stripped.
- H5 RPC `getAchieveList()` -> `AchieveCatalog` (enabled rows with requirement rows, resolved targets, `tracked` flag): the client has no static tables.
- `rankGet('achPoint')` is live (`RANK_LIVE_CATEGORIES`, `RankChar.achPoint`; zero-point characters are not listed).
- `GameDataService`: `achievementRows` / `achievementRequireRows`, `titleIdByName`, `creatureIdsByName`, `itemIdByName` (+ `gamedata/name-index.ts`).

**Client**: `ui/achievementPanel.ts` (+css) (overview: points, last three, per-kind counts; one tab per kind, 6 rows per page, `done/num` bars, claim button), `game/AchievementController.ts` (owned by `CharacterController`; catalog on first open; handles `onUpdateAchieve`, `updateAchieveAwardLog`, `onAchieveTitle`; toast when an achievement is finished). HUD achievement button + R key through `HudActions.onAchieve` (`GameScene.ts` stays at 429 lines: added to an existing line).

**Deviations / open**: AND-of-requirements and show_type 1 checklists are not supported; the `check` column is ignored; `updateAchieveAwardLog` is sent after (not before) the grant; the kill hook counts only the survivors who get quest credit; `achPoint` is stored (not derived on read) so the ranking can sort on it; no other-player achievement view (`showChaInfo achLog`) yet. `getAchieveAward` / `getAchieveList` are NOT quiet: add `quiet: true` only after the user confirms.

## Implementation notes (phase C)
Done 2026-11-04: train soul, awakening, war sprite, magic crystal. Phases D-E untouched. Verified: shared build, lint green, tests shared 86 (+4), server 484 (+28), swf 4; server boots with 191 RPC methods (+18, none quiet); scripted ws e2e (all four systems, refusals, stat changes) and a browser run on a fresh account (each system levelled once, character panel stats changed).

**Server** (`modules/feature/`, one `FeatureModule` imported by `app.module.ts`; imports Character / GameData / Inventory / Progression / Stats modules)
- Pure rules + tests per system: `soul-rules`, `awaken-rules`, `warsprite-rules`, `crystal-rules` (+ `feature-state.ts` parsers), services `soul|awaken|warsprite|crystal.service.ts`, RPCs `soul.rpc.ts` (train soul + awakening) and `warsprite.rpc.ts` (war sprite + crystal). Mutations run under `withCharLock`, spend first and refund when the state write fails.
- State = `character_features` docs: `train_soul {lvl, exp}`, `awakening {level, point, pointUsed, pointDict, awakenAdd}`, `war_sprite {wObj, bObj}` (lazy chain roots), `magic_crystal {crystals: {"0".."15"}}`. Login (`addLoginExtra`): `trainSoulLvl/Exp`, `awakenLevel/Add(0)/Point/PointUsed/PointDict`.
- Stats: four providers in `stats/feature-providers.ts` (token registry, one per system, model-only reads; `StatsModule` now also registers the `CharacterFeature` schema). After every mutation: `onUPP` currencies (and money / gold where spent) + stat refresh with HP/MP clamp.
- Static data: `gamedata/feature-data.ts` + `GameDataService.soulRow / awakenRow / awakenSkillRow(s) / warSpriteRow` (tables were already imported).
- RPCs (Flash names, all registered WITHOUT quiet; mutators `forbidInBattle`; refusals = `onSystemMidMsgOrNote` + FORBIDDEN): `trainSoul`, `awakening(autoBuy)`, `ensureBuyAwaken`, `addAwakenPoint(skillId)`, `reduceAwakenPoint(skillId)`, `getSpWarData`, `getWSPBuffList`, `addWarSprite`, `addWarSpriteGold`, `addBattleSprite`, `addBattleSpriteGold`, `initMagicCrystalData`, `MagicCrystalActive`, `MagicCrystalUp`, `MagicCrystalAddPower(index, amount, pointType)`, `MagicCrystalRecovery`. H5 reads: `getTrainSoulInfo`, `getAwakenInfo`. Pushes: `updateWSPPanel {wObj, bObj, view}` (Go name), `onInitMagicCrystalData` after each crystal mutation and on init.

**Decisions / invented constants (marked)**
- Train soul `require_num` = per-level exp need, exp RESETS on level up (client bar `trainSoulExp / require_num[lvl+1]`, help text 1 crystal = 1 exp). Go kept it cumulative and charged 4700 crystals for +10000 exp: dropped. H5-invented step: one call converts `min(held, 10000, need - exp)` crystals 1:1 (`TRAIN_SOUL.STEP`). Level 50 gate enforced (help text; Go did not). Stat = current level row only. Pet effect of the soul (help text point 3) not done.
- Awakening: stat = SUM of rows 1..L (client; Go bug fixed). Go-invented kept and marked in `AWAKEN`: pity +1% per miss (reset on hit), auto-buy 10 unbound gold per missing item. Auto-buy does not grant items: gold replaces the missing ones, the bag part is taken. Silver is charged on the selected money type (Go: unbound only). Order silver -> gold -> items, refunds on a later failure. `awakening` gate: level >= row `req_level` (80..140). Talent points follow Go validation (cost, max, spent points); the talents do not change stats (Go neither); the UI shows only the player's class talents (`req_class`).
- War sprite scaling follows the CLIENT display, not Go's second normalisation: 13/14/31/61 `raw/10000`, 59/60/62/63 `raw/100`, others raw (`wspStatValue`); Go additionally ran `0<v<1 -> v*100` on rates (research §1.3 rule 6), NOT added (same reason as phase A). Props 5 / 7 (mirror lines of 4 / 6, hidden in the panel) are applied as magic attack / defence. Aggregation `war + war*battle/10000`. Stones: `warSprite` (kind 1) / `battleSprite` (kind 2); gold = unbound `gold`; cost read on the current row.
- Magic crystal catalog moved to `@mc/shared` `statFeatures.ts` (functions over three compact tables); verified cell by cell against Go `catalog.go` (16 slots x 10 levels, one-off script). Stat = `V * min(l+s, max) / max`; slot types 32 / 58 (13th / 14th pools) have no H5 rate key and grant nothing; the Sunday 24:00 wipe of `s` is not implemented (Go neither). Recovery refunds `l` / `s` after the pool is persisted.
- Achievement hooks: no requirement type maps to these systems (type 33 stat thresholds are unsupported in phase B), so none were added.
- Dictionary: no change (59 / 60 fixed in phase A cover war sprite).

**Client**: `ui/feature/` (`featureWindow.ts|css` shell with the 4 tabs, `soulTab`, `awakenTab`, `warSpriteTab`, `crystalTab`, `dom.ts`) + `game/FeatureController.ts` (owned by `CharacterController`; entry = character panel header button "Tu luyện"). The awakening needGold reply asks a confirm, then `ensureBuyAwaken`; war-sprite gold upgrades confirm first; `GameScene.ts` untouched.

**Open / for later**: weekly crystal wipe, soul pet bonus, awakening skill effects, entry via the activity bar (M8), quiet logging after the user confirms the features work. Income of the currencies still comes only from `/grant`.

## Implementation notes (phase D)
Done 2026-11-04: heiyaoshi and zodiac stars. Phase E untouched. Verified: shared build, lint green, tests shared 93 (+7), server 511 (+27), swf 4; server boots with 202 RPC methods (+11, none quiet); scripted ws e2e (all RPCs, refusals, stat changes) and a browser run (lit points, gold fallback, begin / countdown / speed-up / cancel, character panel stats changed).

**Server** (`modules/feature/`, same `FeatureModule`; it now also imports `AchievementEventsModule`)
- Static data: `gamedata/heiyaoshi-data.ts` (5 tables -> per-figure point graph, stage-1 triangles, completion bonuses) and `gamedata/star-data.ts` (`data_tbl_stars_template` by id and by (type, level)); `GameDataService.heiyaoshiTables() / starTemplate(id) / starTemplateAt(type, level)`.
- Pure rules + tests: `heiyaoshi-rules.ts` (seed starters, adjacency / figure checks, triangle + line completion, cascading `reconcile`, `computeBuff`, stat mapping), `zodiac-rules.ts` (begin / finish / cancel / speed-up with an injected `now`, addition roll, stat, exchange check, wire / view builders). Services `heiyaoshi.service.ts`, `zodiac.service.ts` (mutations under `withCharLock`, spend first, refund when the write fails), RPC files `heiyaoshi.rpc.ts`, `zodiac.rpc.ts`.
- State (`character_features`): `heiyaoshi {lastActFigure, actPoint[], actArea[], actLine[]}` (the Buff is derived on read, never stored), `zodiac_stars {stars: {"1".."12": {level, addition, finishDate}}}`; `finishDate` is an END timestamp in ms (restart-safe). Login: `PlayerData.starsData` (Flash map `{tid, level, addition, finishDate}`); heiyaoshi currencies already ride `currencies`.
- Stats: providers `HeiyaoshiBonusProvider` ('heiyaoshi') and `ZodiacBonusProvider` ('zodiacStars') in `stats/feature-providers.ts`.
- RPCs (Flash / Go names, none quiet, mutators `forbidInBattle`, refusals = `onSystemMidMsgOrNote` + FORBIDDEN): `initHeiyaoshiPanelData`, `lightHeiyaoshiPoint(figure, pointId)`, `activateHeiyaoshiPoint(typeNum, pointId)`, `resetHeiyaoshi(targetCharId)`; `beginStarLvUp(nextTplId)`, `finishStarLvUp(type)`, `cancelStarLvUp(type)`, `speedUpStarLvUp(type, useAll, num, itemId)` -> `{d, n}`, `addStarAddition(type, num, itemId)` (reply null, push `onAddStarAddition {t, f, n, d}`), `pmStarExchage(slotId, targetTid, num, tempFlag)` -> `{flag, finalNum, finalNme, slotId}`. H5 read: `getStarsData` -> `{stars, now, total, view}` (the server clock, because `finishDate` is server time and the client has no time sync). Pushes: heiyaoshi `gotoLightHeiyaoshiPoint` -> `Area(areas, Buff)` -> `Line(lines, lastActFigure)` -> `AllJihuo(state)` -> wallet / stat `onUPP`; `goldBuyHeiyaoshi(goldCost, pointId)`.

**Decisions**
- `activateHeiyaoshiPoint` typeNum (open question): `2` = unbound gold on the CURRENT figure, anything else = stones (Go; matches the client gold-unlock gate). `lightHeiyaoshiPoint` pays stones and validates the figure; when stones are short and the point has a gold price it pushes `goldBuyHeiyaoshi` and replies `goldFallback` (the client then asks and calls `activateHeiyaoshiPoint(2, id)`). The gold path now requires a real gold price (Go charged 0 gold when the column was 0: free points).
- Stage-2 multipliers (prop 1 x2, 13/31/59/60/62/63 x1.5, 34 x0.5) kept and marked Go-invented in `stage2Multiplier`, but applied ONLY to the stage-2 TRIANGLE values (the data has triangles for figures 1..10 only). **Deviation**: the completion bonus of figure 11..20 is read from its own `data_tbl_heiyaoshi_full_buff` rows (and the client `ALL_HEIYAOSHI` has the same 20 figures: figure 11 = 900/300/240/480/480) instead of Go's stage-1 rows times the multipliers, which contradicts the data.
- Heiyaoshi stat scaling (no client display exists): flat raw for 1/4/5/6/7/11/13 (13 = critical, fractional, truncated once at the end), percent points as stored for 14/31/34/61, fractions x100 for 59/60/62/63 (Go `applyHeiyaoshiPropBonus`). The 0<v<1 -> x100 rate normalisation from the research was NOT added.
- `resetHeiyaoshi`: H5 has no GM levels, so it is a dev command that only resets the caller's own board (0 or own id); no refund.
- Zodiac: begin needs player level 80 and the row's `req_level`, `sum(levels) >= req_star_level`, one running level-up (a finished-but-unclaimed one is completed first, Go), unbound gold `req_money` charged before the timer is written. Finish needs `now >= finishDate`; cancel clears the timer with no refund; speed-up consumes ONE shard of that star (template 3315 + type, 3316..3327) and moves the end to `now - 1` (refused when idle or already due; client args `useAll / num / itemId` ignored, as in Go). Addition: Hoa Tinh Tú (3315) x num, silver charged on the SELECTED money type before the items (Go: unbound silver), one Bernoulli roll, +0.05 up to 5.0 (rounded to 2 decimals). Stat = `add_value x addition` of the current level; debuff-rate stars (types 8, 11) grant nothing (no H5 rate key, same gap as phase A). A level-up whose timer elapsed only counts after `finishStarLvUp` (the client sends it when the countdown ends and at login, like Flash).
- Exchange: Go swapped ANY item stack for a speed shard 1:1 (an exploit); H5 only swaps star shards (3316..3327) for a different shard, the result is bound (client text "đổi xong sẽ thành khóa"); failures reply `{flag: false}` plus a toast.
- Achievements: phase B listed type 43 (zodiac, 74 rows) as unsupported. Re-checked: those are the star INSTANCE trials ("Khiêu chiến thành công Cung ..."), multi-requirement with no number, so they still have no source (instance deferred); no requirement type maps to star levelling. Type 57 (11 single-requirement achievements, requirement ids 699..709) is new: ids 699..708 ("Hỏa Trận" .. "Thánh Trận") map to heiyaoshi figures 1..10 IN ORDER (assumption, the naming panel is not decompiled) through the new abs kind `heiyaoshiFigures` (value = completed figures, recorded on panel open and on every figure completion; no login backfill); 709 "Quán Quân Giải Mã" is astrology and stays unsupported.

**Client**: two more tabs in the "Tu luyện" window ("Hắc Diệu Thạch", "Tinh Cung"): `ui/feature/heiyaoshiTab.ts` (list UI of the current figure: points with price / state, triangles with bonuses, completion bonus, totals; click a reachable point), `ui/feature/starTab.ts` (12 stars, effect, next level requirements, countdown, begin / cancel / speed up / addition with rate and silver preview) and `game/FeatureStarController.ts` (loads, runs actions, 1 s ticker updates `[data-star-end]` labels and sends `finishStarLvUp` when a timer ends). `GameScene.ts` untouched. Entry stays the character panel "Tu luyện" button (the Tinh Cung character-panel tab and the activity-bar entry are not done).

**Not done / for later**: the Hắc Diệu Thạch panel art (point coordinates are not in the data: list UI instead), star effect panel ("Hiệu ứng quan sát"), exchange UI (RPC works, tested by script), star instance (shard income: only `/grant item 3316..3327`), astrology, quiet logging after the user confirms. New RPCs are NOT quiet.

## Implementation notes (phase E)
Done 2026-11-04: magic weapon (Thần Khí). Verified: shared build, lint green, tests shared 97 (+4), server 532 (+21), swf 4; server boots with 216 RPC methods (+14, none quiet); scripted ws e2e (every RPC, refusals, stat changes) and a browser run (equip, upgrade with successes and failures, repair, reset prop, reset skill, transfer, resolve, activate; character panel stats changed).

**Server** (`modules/magicweapon/`, `MagicWeaponModule` in `app.module.ts`; imports Inventory / Progression / Character / Stats / GameData modules)
- Pure rules + tests: `mw-rules.ts` (effective lines, upgrade gate + roll, reset roll / gate, transfer gate, resolve refund, skill map / pick, sub-line flag parse / activate gate / roll; injectable RNG). Services: `magicweapon.service.ts` (upgrade, getSpiritRequire, `getMWPanel`), `mw-repair.service.ts`, `mw-ops.service.ts` (resolve, trans, reset prop, reset skill, activate, reads), `mw-items.service.ts` (load / stones / pushes). Shared: `packages/shared/src/magicWeapon.ts` (constants, `MW_STONE_TID`, reply types, `mwColorByLevel`, `mwRepairStones`, `MW_PRO_RANGE`); `EquipProperties.flag` added.
- Static data: `gamedata/artifact-data.ts` (`GameDataService.artifactRow(tid, level)`, `artifactSpiritTotal`, `mwSkills()` = skills with `use_env = 5`); `artifact_skill` added to the template projection.
- RPCs (Flash names, none quiet; mutators `forbidInBattle`; refusals = `onSystemMidMsgOrNote` + the legacy failure shape): `mWeaponUpgrade(equipId)`, `getSpiritRequire(equipId)`, `magicWeaponRepair(equipId, stoneId)`, `magicWeaponAutoRepair(equipId, stoneSid)` (null), `magicWeaponAllRepair(equipIds[], stoneSids[])` (null), `magicWeaponResolve(equipId, pw, type)`, `MWTrans(fromId, toId, stoneId, pw)`, `queryMWResetPropMax`, `magicWeaponResetProp(equipId, stoneId)`, `getMWSkills`, `magicWeaponResetSkill(equipId, stoneId, pos)`, `showMWInfo`, `activateMWPro(equipId, index)`. H5 read: `getMWPanel(equipId)` (all numbers for the tabs). Pushes: stone stacks (`onAddCharactorSlot` / `onDelCharactorSlot`), the item, `onUPP` wallet + stat refresh (includes `property.spirituality`), `updateMWResetView`, `onAddItem` (resolve). Stone arguments are only validated: stones are taken from any stack of the template (items are found by TEMPLATE: legacy item types 510 / 511 / 514 / 519 / 522 are templates 2330 Thâm Lam Tinh, 2331 Thâm Hồng Tinh, 2356 Hoán Thần Thạch, 3228 Tinh Hồn Thạch, 4758 Pha Lê Thần Giới).
- Dev grant: `gmGrant('equip', templateId, n 1..10, bound 0|1)` (chat `/grant equip <id> [n] [1]`); a fresh MAIN weapon starts at `floor(0.9 x template)` lines (the client stage panel's starting ratio, see below).

**Stats**: gear provider unchanged in shape. `equipBonusesOf` skips the star multiplier for kind 8 (the weapon keeps its upgrade level in `star`; the ladder values are written into the lines) and the gear provider never reads `t1..t10` of a magic weapon as gems (they are skill ids; skill ids collide with gem template ids). Main weapon = lines (instance, template fallback) + `bind_prop_num` 7 per line (existing legacy rule). **Sub weapons**: templates have no stat lines and their `flag` lines (`succ0..2`) are display only, as in Go (its aggregator never read them): verified, nothing applies; recorded as a decision (applying them needs the rate scale for hit / dodge / critical lines).

**`data_tbl_artifact` semantics derived (H5 decision)**: row `(tid, level)` describes REACHING that level. `prop_num1/2` = the two main lines at that level, `spirit_num` = spirituality cost of the attempt, `rate` = success chance in percent (100 at +1 down to 30), `item_num` = Pha Lê Thần Giới (template 4758, the stone the client stage panel pairs with this table) consumed per attempt. Evidence: client stage panel (`EquiptFuncPanel.as:8523-8605, 12296-12340`) reads `rate%`, `itemNum`, `spiritNum` of the NEXT row and needs spirituality plus that many stage stones. `mWeaponUpgrade`: gates in order (main only, bound -> failType 3, `star + 1 >= 16` needs player Lv 100, top -> failType 2, spirituality, crystals); spirituality is spent first, then the crystals (refunded if they cannot be taken), both on EVERY attempt; the roll `rng * 100 < rate` decides; a failure keeps the level (reply `succ:false, failType:1, msg, rolled:true`); a success sets `star`, `colorCode` (2 from +1, 3 from +6, 4 from +11, 5 from +16, Go), `mainPropNum1/2` and the line props. Deviations from Go: rate and item_num used; lines never decrease on upgrade (`max(current, row)`), because row +1 is 0.9 x template and ratios stay below 1.0 until +15 (Go overwrote and dipped). The ladder only starts to add stats once its row beats the weapon: that is why a fresh grant starts at 0.9 x template.

**Other rules recorded**
- Repair: `ceil(sum(missing durability) / 500)` Thâm Lam Tinh (client cost line; Go: 1 per piece, identical with the 500 durability of every template). `magicWeaponRepair` replies `{succ, num: stones left}`; refuses when nothing is damaged.
- Resolve: unworn pieces only; main refunds `floor(40% x sum of spirit_num rows 1..star)` spirituality; both give 1 Thâm Lam Tinh (unbound); the password is ignored (no secondary password); `type` arg ignored (no gift-bag items).
- Transfer: both main, source unworn, target strictly lower `mainPropNum1`, 1 Hoán Thần Thạch; copies the two line props and values, target becomes bound, source deleted. The client help text mentions an extra spirituality cost (no number anywhere): not charged (Go neither).
- Reset prop: SINGLE phase (no `applyMWResetProp`): main, bound, level >= 5, spirituality >= 40000 (a requirement, not spent), 5 Tinh Hồn Thạch spent; both lines roll uniformly in `[template, 2 x template]` and are committed at once; `updateMWResetView {itemId, mainPropNum1, mainPropNum2}` is pushed; the roll can be lower than the current value. `queryMWResetPropMax` = 2 x template.
- Skills: only main weapons; `getMWSkills` = `{pos: sid}` from `t1..t10`, and an unset position 1 shows the template's base skill (first integer of `artifact_skill`; "7-2" style entries skipped) so a fresh weapon has a skill to reset (Go never filled the t-keys). `magicWeaponResetSkill(pos)`: position must hold a skill, picks uniformly among the other `use_env = 5` skills, 1 Thâm Hồng Tinh, writes `t<pos>`; reply gets an H5 `name`. Equipping does NOT grant the skills to the battle skill list (no `onMWeaponSkillUpdate`, `addMagicWeaponSkill` not implemented): deferred.
- `activateMWPro(equipId, index)`: sub weapon, player Lv 50, lines 0..2 in order, 20 gold of the selected gold type, one uniform roll over `MW_PRO_RANGE` (Go ranges); stored in `properties.flag` JSON; reply `{index, flag}` or `{f: true, index}`. `showMWInfo` = `{flag}`. Lines are display only (see Stats).
- DEFERRED: `magicWeaponStage` (Vòng 8: the real stage ladder is the same 50 rows and the Go rule is unreachable; `stageAdd` flag and `MC_BIRTH_CONFIG` rates ignored), `succinctMW` / `onSureSuccinctMW` / `succinctMWByVip` (preview state; lock polarity unverified), `addMagicWeaponSkill` / battle skills, `showEquipChangeAlert` saveType 31, Vòng tier label (`q` in tooltips). Achievements: no requirement type maps to magic weapons (type 6 wear equipment is unsupported, see phase B): no hook added.

**Client**: character panel tabs "Trang bị" / "Thần khí" (slots 15-20, Lv 50 gate with the Flash text, "Sửa" = `magicWeaponAllRepair` of the worn pieces, "Chức năng" opens the window); `game/MagicWeaponController.ts` (owned by `CharacterController`, refreshed on every bag change) and `ui/mw/` (`mwTabs.ts`, `mwTabs2.ts`, `mwPicker.ts`, `mwTypes.ts`, `mw.css`) reusing the "Tu luyện" window shell (`FeatureWindow` now takes title / tabs / class options). Seven tabs: Thăng cấp (bind button when unbound, cost / rate / crystal lines), Phân giải, Sửa chữa, Kỹ năng, Chuyển TT, Tái lập TT, Tẩy luyện (lines + activate; succinct deferred). `GameScene.ts` untouched. `characterPanel.css`: panel height 342 -> 364 for the tab row.

**For the user**: new RPCs are NOT quiet; add `quiet: true` only after you confirm the feature works. Income of spirituality, Pha Lê Thần Giới and the stones is still `/grant` only.
