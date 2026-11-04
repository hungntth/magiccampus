# M7 Progression panels: legacy server research

Date 2026-11-04. Scope: stat-feature foundation, titles, achievements, magic weapon (Than Khi), magic crystal, zodiac stars,
star instance, astrology, heiyaoshi, war sprite, monster heart, and the lighter systems (mystery treasure, soul gem, train soul,
awaken, medal, explorer medal, stone seal, PRS, prabuff, fairy). Legacy root `D:\mcgame\internal` (abbreviated `go:`), data from
Mongo `data_tbl_*` (verified by `mongosh`), client from `D:\mcgame\docs\client` (abbreviated `as:`).
H5 reference: `server/src/modules/stats/character-stats.service.ts`, `character/character-stats.ts`, `docs/memory/{character-stats,forge,guild}.md`.
Legacy `docs/memory/*.md` were read first and then verified against code; the stale ones are listed in section 15.

## 0. Headline findings (read these first)

1. **The Go stat pipeline merges every feature into one `EquipmentStatBonuses` bag with gear and buffs, then applies it once.**
   The H5 pipeline (`mergeBonuses(gear, buffs)` then `assembleStats`) has the same shape, so features are just more `Bonuses`
   providers. Order inside the bag is irrelevant except attribute props (20-23) go through the formula first.
2. **Several Go feature bonuses are dead code (they never apply): medal, PRS, astrology (`starsNow`), monster heart, stone seal,
   soul gem, mystery treasure, fairy.** The bonus readers look for keys the writers never produce (section 1.4). H5 must define the
   bonus rule from data/client, not copy "Go does it".
3. **Go has bugs/divergences from the client in live bonus paths**: awakening applies only the current level's row (client sums rows
   1..L), title buffs (`data_tbl_title.b`) are never applied (Go reads an always-NULL `buff_id` column), fractional flat values
   (hit/dodge/critical 0.05-0.09) are truncated to 0 by `math.Round`.
4. **Achievements never progress in Go.** `achievement.Service.OnLogin` is a no-op and nothing calls `UpsertProgress`/`MarkCompleted`
   (go:application/achievement/service.go:141-143). Only the snapshot + claim exist. Also `achieveReqLog` is keyed by achievement id in
   Go but the client reads it by requirement id (section 3.4).
5. **Two real handlers are shadowed by legacy stubs (last-write-wins): `stoneSealGetData` and `initPRSPanel`**
   (`activity/backlog_panels.go:210,219` registered at main.go:768, after stoneSeal at 605 and prs at 610).
6. **Star instance is half-wired**: `clickWarMap` spends a daily attempt but never starts a battle, so `OnBattleEnd` (starPnt reward) is unreachable
   (go:presentation/rtmp/handlers/starinstance/click.go; `BattleTypeStarInstance`/`WarMapSid` are only read in combat/battle.go:361-387,
   never set). The legacy memory file claims otherwise (stale).
7. **Magic weapon is an equipment layer** (items kind 8, positions 15-20, same item table); its stats come from instance `mainPropNum1/2`
   written by `mWeaponUpgrade` from `data_tbl_artifact` rows. `MainGrowMultiplier`/`SubGrowPercent` are dead code; sub-weapon succinct
   lines (`flag.succ0..2`) are stored but never aggregated into stats; `magicWeaponStage` is unreachable for normal items (section 4.6).
8. **Almost every progression currency has no acquisition path in the local data**: `data_tbl_creature_loot` has only type 29 (items),
   `data_tbl_item_award` has 0 rows, so type-550 gift boxes and award-type-35 currency drops give nothing. Costs are data-backed, income is not.
   H5 needs a dev/GM grant path or a shop entry to make these panels testable.
9. **Soul train `require_num` semantics are ambiguous**: Go treats `data_tbl_soul.require_num` as cumulative exp thresholds (1.55M, 1.60M, ...),
   the client progress bar uses it as the next-level target against `trainSoulExp`, which reads as a per-level bar. Unverified (section 12.3).
10. Dictionary bug in H5: `BUFF_PROP[59]/[60]` map to `finalReduceHurt1/2`, but Go maps common prop 59/60 to `finalPraDef/finalPraMagDef`
    (go:domain/character/detail_props.go:32-33,36-37; legacy ids 15/16 are the finalReduceHurt keys). Fix before wiring war sprite/prabuff/heiyaoshi.

## 1. Stat-feature foundation

### 1.1 Summary
Systems that change stats but are not equipment persist as JSON blobs keyed by `feature_key`, and a single aggregator folds them into the
character bonus bag. There is no per-feature table except titles/achievements/mounts.

### 1.2 Entry points
No RPC. Pieces:
- Catalog table `data.data_tbl_stat_feature` (17 rows in Mongo, columns `feature_key,name,target_scope,config_table,state_table,state_key,
  panel_key,primary_callback,bonus_strategy,bonus_ready,note`). It is documentation only; no Go code reads it for behaviour. `bonus_ready=0` rows:
  stone_seal, monster_heart, active_pet, contract_pet, stars (but stars IS applied in code, the flag is stale).
- Aggregator: go:application/statfeature/character.go:20 `AggregateCharacterStatBonuses(ctx, charID)`.
- Repo contract: go:domain/statfeature/statfeature.go (feature key consts 12-40; `Repository` list/upsert by `(charID, featureKey)`).
- Login snapshot: go:application/statfeature/service.go:33 `BuildCharacterLoginState` and :94 `GetCharacterLoginBlobs` -> auth login payload.

### 1.3 Rules
1. State row = `(character_id, feature_key)` unique, `state` JSONB (supabase/migrations/20260414060219_add_stat_feature_foundation.sql:55-80). Pets have the
   twin `pet_stat_features` (:67).
2. Awakening level and soul level/exp live in `character_progression` columns, not feature rows (go:domain/statfeature/statfeature.go:46-54);
   awakening point pool/dict are in feature `awakening`.
3. Aggregation order inside `AggregateCharacterStatBonuses` (character.go:36-51): awakening(level row), soul(level row), mount, magic_array(starsNow),
   prabuff, stars, explorer_medal, war_sprite, medal, prs, heiyaoshi, pm_daily_buff, magic_crystal. Order does not matter, all are additive.
4. Merge into gear: go:application/item/equip_stats.go:25-63. Order: equipped gear (base, gems, active set, maker set) -> `charBonusProvider`
   (statfeature) -> `extraBonusProviders` (buff service, dress). `mergeEquipmentStatBonuses` just adds maps (:65-81).
5. Application: go:domain/character/equip_stats.go:364 `ApplyEquipmentBonuses`: (a) flat attribute props (PropStrength..PropSpirit) added to the
   attributes then `RecalculateStats()` (:381, formula re-run); (b) every other flat; (c) `Float` bucket (rates / final*); (d) percent
   `applyPct(base,pct)=base+base*pct/100` integer division (:571) on MaxHP/MP/SP/Attack/MAttack/Def/MDef/Speed only; (e) `FinalAdds` for raw props 13,14,31,34,61.
   H5 `assembleStats` matches (a)(b)(d); it has no separate Float bucket (rates are summed into `rates`).
6. Prop id normalisation for feature/buff props: go:application/statfeature/helpers.go:326 `applyCharacterPropBonus`: id -> semantic via
   `CommonFeaturePropToStat` (domain/character/equip_stats.go:177), then `NormalizeRatePropValue` (:350: for rate props, `0<v<1` becomes `v*100`),
   then `UsesFloatBonus` -> Float, else `AddFlat(int(round(v)))`. Equipment props use a different dictionary (`EquipmentPropToStat` :113; 21 = Stamina, 24/25 percent).
   Consequence: flat stats with fractional values (hit 0.09, critical 0.05) round to 0.
7. Percent path for percent-flag buffs: helpers.go:347 `applyPercentCharacterPropBonus`: percent on the 8 scalable stats, flat for critical/defy, Float otherwise.
8. `onInitViewProp` = the character property object (`BuildViewPropertiesWithEquipment`: finalHp/Mp/Sp, finalAttack/MAttack/Defence/MDefence/Hit/Critical/
   Dodge/Speed, finalStrength..Energy, attLastPoint, lastPoint, spirituality, ee/en/ef). Sent at scene enter (go:presentation/rtmp/handlers/scene/movement.go:598)
   and after item changes (change_bind/element/soul, maker, heiyaoshi, monster heart). `onUPP` is the same plus character DTO (`SendStatRefreshUPP`,
   go:presentation/rtmp/utils/stat_refresh.go:18-46). `spirituality` rides in the property object (currency 241).

### 1.4 Dead-bonus table (verified by grep of writers vs readers)
| Feature | Bonus reader looks for | Writer produces | Result |
|---|---|---|---|
| medal | `id/templateId/template_id/medalId` (character.go:224) | `exp, bag, petBuff, charBuff, checkFlag` (medal/state.go:7-8) | never applies |
| prs | `treeId/tree_id/showId/show_id` (character.go:243-251) | `tid, useSid, actArr...` (prs/state.go:69-152) | never applies |
| magic_array (astrology) | `starsNow` map type->level (character.go:129) | `starsCollected` array (astrology/state.go:38-67) | never applies |
| monster_heart, stone_seal, fairy, soul gem, mystery treasure | no reader | state only | no stats |
| explorer_medal | `info` "level|score", level row absolute (explorer medal state; client shows current-level row, as:ExplorerMedalPanel.as:2231-2260) | same | applies (OK) |

### 1.5 State and restart
All persisted in Postgres JSONB; no in-memory state except the MW pending previews (section 4). Restart-safe.

### 1.6 Port notes (H5)
- Add a provider registry so `CharacterStatsService.compute()` stays model-only (its comment forbids feature service imports to avoid DI cycles):
  ```ts
  // server/src/modules/stats/stat-provider.ts
  export interface StatBonusProvider { readonly key: string; bonuses(characterId: number, doc: Character): Promise<Bonuses>; }
  export const STAT_PROVIDERS = Symbol('STAT_PROVIDERS'); // multi-provider token, each feature module contributes one
  // compute(): const extra = await Promise.all(providers.map(p => p.bonuses(id, doc))); extra.forEach(b => mergeBonuses(bonuses, b));
  ```
  Providers must read only schemas/gamedata (like `GuildSkillBonusService`), never the feature RPC services.
- Add `PROP_FEATURE` dictionary = `BUFF_PROP` (Go `CommonFeaturePropToStat`) with fixes: 59 -> `finalPraDef`, 60 -> `finalPraMagDef` (and keep
  `DETAIL_KEYS` aligned), 62 `finalEnhPhyHurt`, 63 `finalEnhMagicHurt`, 71 `finalCriticalDamage`, 72 `finalBreakReborn`, 5/7 etc. as in Go. Add
  `normalizeRate(propId, v)` (`0<v<1` -> `v*100`) for rate props on the feature path only (equipment path does not normalise in Go).
- Decide explicitly how to treat fractional flat values: Go truncates (loses them). Recommended: keep float in `flat` and `trunc` once in `assembleStats` (cheap improvement, document the divergence).
- Persistence: embedded per-feature collection `character_stat_features {characterId, featureKey, state: Mixed}` unique index, same as Go (cheap to
  port blobs 1:1), but use typed schemas for the ones with queries (titles, achievements). Currencies: add `currencies: Record<string, number>` on `Character`
  keyed by Go `ClientKey` (`mysteryCrystal, warSprite, battleSprite, heiyaoshiPoint, heiyaoshiPoint2, magiccystalrec, magiccystalpre, magiccystallimit,
  spirituality, starPnt, npPnt, elementPnt, yijieElement, stoneSealPoint, realSoul*`); spend with a conditional `$inc` (`filter {'currencies.x': {$gte: cost}}`)
  to be atomic. Push deltas via `onUPP {<clientKey>: newTotal}` (Go pattern, e.g. go:presentation/rtmp/handlers/heiyaoshi/actions.go:182).

## 2. Titles

### 2.1 Summary
Players own titles (`character_titles`), one active normal title and one active "special" title. Titles carry a stat buff via `data_tbl_title.b`
(buff id). The server returns the buff in the `setTitle` reply so the client shows it as a long-buff icon; Go never applies the stats.

### 2.2 Entry points
| RPC | Handler | Service |
|---|---|---|
| `gtl` | go:presentation/rtmp/handlers/title/handler.go:28 -> list.go | `GetTitleList` application/title/service.go:63 |
| `setTitle(titleId)` | handler.go:29 -> activation.go:17 | `SetActiveTitle` service.go:122 |
| `setActTitle(titleId)` | handler.go:30 -> activation.go:51 | `SetActiveSpecialTitle` service.go:165 |
Registration unique (no collision). Rate limits mirror the client config (not behavioural).

### 2.3 Rules
1. `gtl` reply `{ct, cts}`: `ct = "|a|b|"` (edge pipes, all owned titles including special), `cts = "a|b|"` (trailing pipe only, titles with `s in (1,2)`)
   (service.go:63-88; SQL `get_character_titles` has NO `s` filter, `get_character_special_titles` filters `s in (1,2)`:
   supabase/migrations/20260414081430_add_medium_repo_db_functions.sql:275-300). Order `obtained_at desc`. Expired rows (`expires_at`) are hidden; nothing sets `expires_at`.
2. `setTitle(id>0)`: must own the title else `{f:false}` (service.go:128-140). `id<=0` (client sends -1) deactivates. Reply `{f:true, t:id, bd:<buff payload|nil>}`.
   SQL `set_active_title` clears `is_active` on all non-special titles, then sets the chosen one (migrations ...medium_repo_db_functions.sql:506-530).
   `setActTitle` is the same restricted to `s in (1,2)` titles (:468-500). Note `set_active_title` deactivates only non-special titles but activates by id regardless of `s`.
3. `bd` (service.go:206-243): `{id,bid,type,kind,icon_code,effect_num,percent_flag,prop1..6,prop_num1..6}` of buff `title.buff_id`. **`data_tbl_title.buff_id` is NULL for all 472 rows**
   (Mongo), so `bd` is always nil in Go and the client calls `delBuff(0)` (as:TitleSelectPanel.as:484-496). The real buff link is column `b`: **448 of 472 titles have `b` resolving to a
   `data_tbl_buff` row** (24 have `b=0`), mostly buff type 4 (404 rows; 23 type 0, 7 type 1) e.g. "HP + 5%" (buff 2822), "Tang 3% gioi han HP, MP" (buff 546), `percent_flag` 0/1. The client itself looks titles up by buff id
   (`getTitleByBuffId` compares `title.b`, as:Core.as:985-995) and shows `titleData.b` via `BuffParser.parseBuff2` in the info box (TitleSelectPanel.as:517-523).
4. Scene broadcast after set: `onTitleUpdate {cid,tid}` / `onActTitleUpdate {cid,tid}` to the map (activation.go:44,77,119-132) so others see the nameplate.
5. Login: cData `t` (string of active title), `actT`, `ct`, `cts` (go:presentation/rtmp/handlers/auth/login_cdata_blobs.go:170-176).
6. Earning: only `GrantTitle` (service.go:91) called from (a) item award effect type title (go:application/item/effect_award.go:404) and (b) achievement claim
   (claim.go:93, rewards.go:124). Push after grant: regular `onAddTitle {f:1,t,ct}`, special `onAddActTitle cts` (go:presentation/rtmp/utils/title_callbacks.go:9-24), then `onAchieveTitle name` for achievements.
7. `data_tbl_title` columns (as:TitleSelectPanel.as + data): `id, n` name, `i` description (`\\n` line breaks), `a` "0xRRGGBB|prefix|suffix" display, `b` buff id, `k` kind (1 forever, 2 activity, 3 VIP
   as:GamePredef.as:2043-2045), `l` order, `s` special flag (-1 normal, 0 neither, 1 special; active-title tab uses `s in (1,2)`), `t` unknown (source/achievement index, unverified).
   Counts: k1 215, k2 251, k3 6; `s`: -1 302, 0 16, 1 154.

### 2.4 State
`player.character_titles(id, character_id, title_id, is_active bool, obtained_at, expires_at)`. Proposed Mongo `character_titles {characterId, titleId, active, obtainedAt, expiresAt?}`
unique `(characterId,titleId)`; "active normal" = at most one doc with `active && !special`, "active special" likewise (partial unique via update-many-then-set, serialise per character).

### 2.5 Push sequence
setTitle ok: reply `{f:true,t,bd}`; then scene `onTitleUpdate`. Not owned: reply `{f:false}` only. No `onUPP` in Go (stats not applied); H5 should push the stat refresh `onUPP`
after set (stat changes) and `initLongBuff`-style `upLongBuff(bd)` is client-driven by `bd`.

### 2.6 Port notes
```ts
// titles.service.ts
async setTitle(session, titleId: number, special: boolean) {
  const tpl = titleId > 0 ? gameData.getTitle(titleId) : undefined;            // data_tbl_title
  if (titleId > 0 && !(await owns(session.characterId, titleId))) return { f: false };
  await this.activate(session.characterId, titleId, special);                   // clear same group then set
  const buff = tpl && tpl.b > 0 ? gameData.getBuff(tpl.b) : undefined;         // use `b`, not buff_id
  await stats.refreshPush(session);                                             // title bonus provider reads active titles
  scenes.broadcast(mapId, special ? 'onActTitleUpdate' : 'onTitleUpdate', { cid, tid: titleId });
  return { f: true, t: titleId, bd: buff ? toLongBuffPayload(buff) : null };
}
// stat provider: active normal + active special title -> buffBonuses([getBuff(b)])  (percent_flag respected)
```
Reuse `buffBonuses()` and the existing LongBuff mapping (`buff-mapping.ts`). Decision needed: should the title buff stack with the special title buff (Go has no rule; the client keeps
one long-buff row id 0, so the last set wins in the buff bar). Recommend both apply to stats.

## 3. Achievements

### 3.1 Summary
Panel with 604 achievements in 6 kinds; login snapshot, claim of a reward, achievement points. Go implements snapshot + claim only; progress tracking is entirely missing.

### 3.2 Entry points
| RPC | Handler | Notes |
|---|---|---|
| `getAchieveAward(aid)` | go:presentation/rtmp/handlers/achievement/handler.go:44 -> claim.go:18 | only RPC |
Snapshot in login: `achieveLog`, `achieveReqLog`, `takeAchieveAwardLog`, cData `achPnt` (go:presentation/rtmp/handlers/auth/login_payload.go:314,390-391,414).

### 3.3 Rules
1. `getAchieveAward`: template must exist and `is_award > 0` else `{flag:false}` (claim.go:35). `ClaimReward` requires progress row completed and not claimed
   (application/achievement/service.go:101-139), then `MarkClaimed`. Errors push `onRedMsg "Khong the nhan phan thuong thanh tuu."` and return `{flag:false}`.
2. Push order on success: `updateAchieveAwardLog {aid, num:1}` (claim.go:53) -> if `is_award==2` title grant callbacks (claim.go:58-107) -> `grantStructuredReward` (reward_type 1 money,
   2 gold, 3 item, 4 title: handlers/achievement/rewards.go; **all `reward_type/id/qty` columns are NULL** so it never fires) -> reply `{flag:true, aid}`.
   `updateAchieveAwardLog` and `onAchieveTitle` do not exist in the decompiled client (grep of as:docs/client finds neither): **unverified** what the real push is; the client reads
   `takeAchieveAwardLog` from the login snapshot and `Core.takeAchieveAwardLog` (as:AchievementDetail.as:972,1192).
3. `is_award`: NULL 546, 0: 7, **1: 38 (item reward described in `desc`, e.g. medal items "Phan thuong An Chuong ...")**, **2: 13 (title reward)** (Mongo). Go's title-by-name match
   (`FindUniqueTitleByName(achievement.name)`, claim.go:85) is wrong: achievement 1021 "Dang Cap Dai Gia" matches title 115 (k1) instead of the intended title 277 "Phu Hao" named in `desc`
   ("Phan thuong Danh Hieu Phu Hao"). Parsing `desc` after "Danh Hieu " resolves 9 of 13 (1021->277, 2013->257, 4013->275, 5050->279, 6030->276, 6078->278, 6092->273, 2017->256);
   6066 and 6226/6245/6248/6428 have no title row.
4. Snapshot (service.go:53-98): per progress row: `achieveLog[aid]=completedAtMs` (>=1000000 else 1000000) when completed; `takeAchieveAwardLog[aid]=1` when claimed; `achieveReqLog[aid]={done,progress}`;
   `achPnt = sum(data_tbl_achievement.award)` over completed. **Bug**: the client reads `achieveReqLog[requirementId]` (as:AchievementPanel.as:817-820 `_charAchieveReqLog[_local_9.id]`,
   1402 `isDoneAchieveReq(reqId)`), Go keys by achievement id. Also `achieveLog[aid] > _MAX_ACH_CHECK_VERSION` (as:AchievementPanel.as:982) means completed; value is the timestamp shown by `new Date(achieveLog[aid])` (:749).
5. Go has the hook infrastructure but achievement uses none: event bus listeners (go:application/events/bus.go:15-60): monster killed, item acquired, item used, level up, battle ended, quest finished,
   gear strengthened, login. `achievement.Service` registers on the bus (service.go:50) but implements only `OnLogin` (no-op, :141).
   **No code anywhere writes `player.character_achievements`** besides the repo functions (`upsert_character_achievement`, `mark_character_achievement_completed/claimed`).

### 3.4 Data tables
- `data_tbl_achievement` (604): `id, name, description, detail, desc, award (points), check (-1: 307, 1: 284, 0: 13; meaning unverified), color, enable (566 enabled), is_award, kind 1-6, position, repeat_type (all 0), type` + NULL `reward_*` columns.
  kind = panel tab (1 growth 175, 2 pet 78, 3 social 60, 4 PvP 52, 5 challenge 205, 6 life 34). `type` 101-109, 201-204, 301-305, 401-404, 501-507, 601-607 (sub-category).
  Points total over enabled rows 16958.
- `data_tbl_achievement_require` (739): `id, aid, name, num, show_type (0 none,1 checklist of `name`s,2 progress bars `done/num`), type (0-61)`. 602 achievements have requirements, 33 have several.
  **588 of 739 rows have `num=0`**: the threshold is only in the description text ("Cap do dat cap 10", "Phong ngu vat ly dat 40000"); only 151 rows carry a numeric target.
- Requirement `type` semantics inferred from descriptions (examples, count of rows): 4 reach level N (36); 5 main skill level (29); 0 craft/obtain equipment (95); 6 wear dress (94); 43 clear a Cung / zodiac trial (74, 'Khieu chien thanh cong 1 Cung'); 2 number of distinct pets (56);
  3 catch a pet (2); 7 number of titles (19); 8 login days (6); 1 daily check-in quest (36); 16 guild loop quest (12); 21 join guild (4); 22 add friend (2); 23 take apprentice (2); 24 donate to guild (3); 25/26 gladiator arena; 27-29 Achilles arena;
  33 physical defence 40000 (10); 34 marriage (9); 40/41 farm level / consecutive days; 42 pet arena win (17); 44 own fairy Poli guarding (17); 53 solomon parts (20); 54 hidden treasures (12); 57 activate a Heiyaoshi formation (11); 58 activate music-goddess form (15);
  full mapping of all 62 types needs a one-off script; none is machine-readable.
- Local `item/award` contents are empty so the 38 item rewards have no data (only the `desc` text).

### 3.5 State
Go table `player.character_achievements(character_id, achievement_id, progress, target, is_completed, is_claimed, completed_at, claimed_at)`. Proposed Mongo `character_achievements`
`{characterId, achievementId, progress, target, completed, claimed, completedAt, claimedAt}` unique `(characterId, achievementId)`; total points can be summed on read (or cached on the character).

### 3.6 Port notes
- Recommended minimal trigger set (each needs a hook already available or cheap in H5): level reached (type 4/1001-1004 thresholds parsed from description), main-skill level (5), quests (1,16), titles count (7),
  login days (8), pet count/catch (2,3), equip/dress count (0,6), PvP arena (25,26,42), guild (21,24), friends (22). Everything else stays unreachable until its feature exists.
- Hook design: an `AchievementTriggers` service with `onEvent(characterId, {kind:'level'|'skill'|'quest'|'petCount'|..., value})` that looks up an in-memory map `requirementType -> [{aid, reqId, target}]`
  built at startup; targets for `num=0` rows need a hand-curated override table (`aid -> target`) or a regex over `description`.
  Completion: set `progress`, mark `completed`, push the panel update, grant `achPnt` (derive on read).
- Fix `achieveReqLog` keying: emit `{reqId: {done, progress}}` for each requirement row.
- Claim: reuse the two-step contract (reply `{flag}`), consume-then-credit: mark claimed with a conditional update (`claimed:false` -> true) BEFORE granting the title/item to prevent double claims;
  title from `desc` parsing as above.
- Deferred: item rewards (`is_award=1`) until the medal/item-award pipeline exists.

## 4. Magic weapon (Than Khi)

### 4.1 Summary
Six extra equip positions (15 main, 16-20 sub) hosting items with template `kind=8`, `type=800` (main, class-bound via `req_class`) or `801` (sub). Level 50 unlocks the panel. All instance data lives in
`character_items.properties` + `star_level` (= upgradeNum) + `is_bound`. Stats are just the item's `mainProp1/2` / `mainPropNum1/2` through the normal equip aggregation.

### 4.2 Entry points (all registered once; go:presentation/rtmp/handlers/magicweapon/handler.go:53-69)
| RPC | Handler | Service (application/magicweapon) |
|---|---|---|
| `getSpiritRequire(itemId)` | upgrade.go | `GetSpiritRequire` upgrade.go:16 |
| `mWeaponUpgrade(itemId)` | upgrade.go:38 | `UpgradeMagicWeapon` upgrade.go:38 |
| `magicWeaponRepair(equipId, stoneId)` / `magicWeaponAllRepair([equipIds],[stoneIds])` | repair.go | repair.go:15,63 |
| `getMWSkills(itemId)` / `magicWeaponResetSkill(equipId, stoneId, pos 1-10)` | skill.go | skill.go:18,33 |
| `magicWeaponStage(equipId, crystalId)` | stage.go | stage.go:15 |
| `magicWeaponResetProp(equipId, stoneId)` / `applyMWResetProp` / `queryMWResetPropMax(itemId)` | resetprop.go | resetprop.go:16,32,103 |
| `magicWeaponResolve(itemId, pwHash, kind)` | resolve.go | resolve.go:14 |
| `MWTrans(srcId, tgtId, stoneId, pwHash)` | trans.go | trans.go:15 |
| `showMWInfo(itemId)`, `succinctMW(itemId,[lock x3],autoBuy)`, `onSureSuccinctMW(1|-1)`, `succinctMWByVip`, `activateMWPro(itemId, idx 0-2)` | succinct.go, activate.go | succinct.go:16-118, activate.go:15 |

### 4.3 Rules (constants: go:domain/magicweapon/constants.go)
1. Item kind 8; main type 800, sub 801; positions 15-20; stones: repair 510, skill 511, trans 514, prop 519, stage-8 522, succinct 3740; `UpgradeNumPlayerLevel100=16`, `StageEightLevel=20`,
   `MWResetLevelLimit=5`, `ResetSpiritualityNeed=40000`, `ResetStoneNeed=5`, `ActivateGoldCost=20`, `UnlockPlayerLevel=50`.
2. **Upgrade** (upgrade.go:38-112): item must be MW template, `is_bound`; `nextLevel=star_level+1`; if `nextLevel>=16 && char.level<100` fail type1 "Cap nhan vat 100"; row = `data_tbl_artifact(tid, level=nextLevel)` else failType 2 (max, 50 rows per tid);
   cost = `row.spirit_num` of currency Spirituality (string column `spirituality`, currency 241) else fail type1; deduct, then `star_level=nextLevel`, `mainPropNum1/2 = row.prop_num1/2`, `colorCode = 5 (>=16) | 4 (>=11) | 3 (>=6) | 2 (>=1)`.
   **Go ignores `row.rate` and `row.item_num`** (every upgrade succeeds, no item consumed). Reply `{succ, level, color, require(next spirit_num)}` or `{succ:false, failType, msg}`.
   Order is spend-then-credit with a separate char save then item save (not atomic).
3. `getSpiritRequire` -> `{value: row(nextLevel).spirit_num | 0}`.
4. **Repair**: needs `needsRepair`, consumes 1 stone 510 per item, `durability=max`. Reply `{succ, num: stoneRemaining}`; push `onAddCharactorSlot(item)` (+ stat refresh when equipped). All-repair consumes one stone per repaired item, pushes `onAddCharactorSlot` each, one stat refresh, returns null.
5. **Skills** (only main weapon): skill ids = template `artifact_skill` (pipe list, first = base; others like "7-2" are not ints and are skipped by `Atoi`) + `t1..t10` instance keys. Equip grants (`GrantSkillUnchecked`) and unequip/resolve/trans revoke only skills with `use_env=5`
   (142 rows in `data_tbl_skill`). `getMWSkills` -> `{ "1": sid, ... }`. `ResetSkill(pos)`: pool = all `use_env=5` skills, pick uniformly excluding the current one, consume 1 stone 511, write `t<pos>`; if equipped revoke old/grant new. Reply `{succ,num,sid}`; pushes `onMWeaponSkillUpdate(skills, true)` then item update. Nothing in Go ever fills `t1..t10` at creation.
6. **Stage** (stage.go:15): main only, `star_level>=20`, `mainPropNum1 >= template.main_prop_num1*0.9`, vong (ratio buckets `[0.3..1.0]`, `ComputeStageVong`, formulas.go:60-90) `<8`, consumes 1 crystal (template 522), sets `mainPropNum1/2 = template*2.0`, `flag.flagStr="stage8"`.
   **Effectively unreachable**: artifact row ratio is 0.90 at level 1, >=1.0 from level 15, 1.08 at level 20 and 2.00 at level 50 (verified for all six main templates), so vong is already 8 at star_level>=20 and the call is refused.
   The client stage panel (as:EquiptFuncPanel.as:8523, 12296-12330) instead walks `TBL_ARTIFACT` rows with `rate%`, `item_num`, `spirit_num` after matching props to a row, so the real design seems to be the 50-row ladder; Go jumps straight to 2x. **Unverified which is the real server behaviour.**
7. **Reset prop (two phase)**: main, bound, `star_level>=5`, spirituality >= 40000 (not consumed), 5 stones 519 consumed at roll; roll `new = tpl + rand()*(tpl*2-tpl)` for both main props, stored only in `pendingReset[charID]` (in memory). Push `onMagicWeaponResetProp {type, itemId, newMainPropNum1, oldMainPropNum1, newMainPropNum2, oldMainPropNum2}`; reply `{succ,num}`.
   `applyMWResetProp` commits (no args), pushes item update + `updateMWResetView {itemId}` + stat refresh. `queryMWResetPropMax` -> `{succ, maxMainPropNum1, maxMainPropNum2}` = template*2. A later upgrade overwrites the rolled values with the row values.
8. **Resolve**: main refunds `floor(cumulativeSpirit(tid, star_level)*40/100)` spirituality and revokes skills; both give 1 stone 510 (`MaterialType 28`); needs secondary password. Reply `{succ,type:28,giid:510,stackNum:1,temp_quality:0}`; push `onDelCharactorSlot(oldSid)` + new stack.
9. **Trans**: both main, `tgt.mainPropNum1 < src.mainPropNum1`, 1 stone 514; copies mainPropNum1/2 (+mainProp1/2), `tgt.bound=true`, deletes src; password required; reply `{succ,msg,num}`.
10. **Sub weapon succinct** (3 lines `flag={succ0,succ1,succ2}` each `{propType, propVal}`): `succinctMW` consumes 1 stone 3740 per roll (ignores `autoBuy`), re-rolls the lines whose `lockArr[i]` is **true** (naming is inverted relative to "lock"; client semantic unverified), range per type from `ACTIVATE_MW_PRO`
    (formulas.go:92-104: 1 HP 1200-12000, 2 MP 50-500, 4 ATK 300-3000, 5 MATK 240-2400, 6 DEF 1000-10000, 7 MDEF 1000-10000, 8 hit 0.5-5, 9 dodge 0.5-5, 11 speed 120-1200, 13 crit 0.4-4, 27 resi-crit 0.4-4), uniform value and uniform type; pending preview in memory; reply `{newPro, lockArr}`;
    `onSureSuccinctMW(1)` commits `flag` (reply `{flag}`), `-1` discards. `succinctMWByVip` pushes `onSureSuccinctMW {flag}` instead of replying. `activateMWPro(idx)`: sub, char level>=50, slot idx-1 must exist (idx>0), slot idx empty, costs 20 gold (`selectedGoldType==4` gold else goldBind); push `onUPP {gold|goldBind}` + item update; reply `{index, flag:{propType,propVal}}`, failure `{f:true,index}`.
    **These lines are never read by the stat aggregator** (aggregate reads mainProp1/2, prop1/2 only: go:application/item/equip_stats.go:95-140).
11. Dead code: `MainGrowMultiplier`, `SubGrowPercent`, HP/Speed grow maps (formulas.go:5-58) have no callers.

### 4.4 Data tables
- `data_tbl_artifact` (300 = 6 main tids x 50 levels, tids 1348-1353): `id, tid, level, prop_num1 (HP), prop_num2 (speed), spirit_num (100000*level), item_num (10 up to 170), rate (100 down to 30)`.
  Sample tid 1350: L1 823/41, L20 985/49 (2,000,000 spirit), L50 1824/92 (5,000,000).
- `data_tbl_equipt_template` kind 8: 21 rows, 6 main (type 800, position 15, `main_prop1=1` HP, `main_prop2=11` speed, `main_prop_num1` 812-1618, `main_prop_num2` 46, `req_class` e.g. `|3|`, `artifact_skill` like `4861|7-2|7-3|7-4`, `bind_prop_num 7`) and 15 sub (type 801, positions 16-20, no stats, `artifact_skill` like `7-11`).
- Skills `data_tbl_skill.use_env=5`: 142 rows. Item templates: 510, 511, 514, 519, 522 (item template id 522 does not exist; the stage crystal is template 4758 "Pha Le Than Gioi" of **type** 522 and the client constant `STAGE_EIGHT_ITEMID=4758`, but Go compares `crystal.TemplateID != StoneStageEigh(522)`, so a real 4758 stack is refused: a second reason `magicWeaponStage` is dead), 3740.
- Currency: Spirituality 241 (go:domain/character/character.go:98), no acquisition path found in Go (only login/view, MW). 

### 4.5 State
Items: `character_items` (H5 `CharacterItem.properties`): `mainProp1/2, mainPropNum1/2, prop1/2, propNum1/2, bindMainPropNum1/2, t1..t10, flag (JSON string)`, `star` = upgradeNum, `bound`. Spirituality: `currencies.spirituality`.
In-memory: `pendingReset`, `pendingSuccinct` (lost on restart; stones already consumed). H5 should persist pendings on the item (`properties.pendingReset`) to avoid losing 5 stones.

### 4.6 Push sequence
Upgrade: item `onAddCharactorSlot` -> (if equipped) `onUPP` stat refresh -> reply. Reset prop: `onMagicWeaponResetProp` -> reply; apply: `onAddCharactorSlot` -> `updateMWResetView` -> `onUPP`. Skill reset: `onMWeaponSkillUpdate` (if equipped) -> `onAddCharactorSlot` -> `onUPP` -> reply. Resolve/Trans: `onDelCharactorSlot` -> `onAddCharactorSlot` -> `onUPP`.

### 4.7 Port notes
- Location: `server/src/modules/magicweapon/magicweapon.{service,rpc}.ts`, shared `packages/shared/src/magicweapon.ts` for RPC shapes; gamedata accessor `getArtifactRow(tid, level)`, `getArtifactCumulativeSpirit`.
- H5 inventory already equips positions 1-22 (positions above 22 refused), so main/sub MW equip with no change; make sure `equipBonusesOf` sees `bound`-based `bindMainPropNum` and falls back to the template when `mainPropNum1` is absent (as Go does).
```ts
async upgrade(charId, itemId) {
  const it = await ownedItem(charId, itemId); const tpl = template(it.templateId);
  if (tpl.kind !== 8 || !it.bound) return fail(1, 'Than khi phai khoa truoc khi nang cap');
  const next = it.star + 1;
  if (next >= 16 && char.level < 100) return fail(1, 'Can cap 100');
  const row = gameData.artifact(it.templateId, next); if (!row) return fail(2, 'Da dat cap toi da');
  if (!(await wallet.spend(charId, 'spirituality', row.spirit_num))) return fail(1, 'Diem than tu khong du');
  await items.update(it._id, { star: next, 'properties.mainPropNum1': row.prop_num1, 'properties.mainPropNum2': row.prop_num2, colorCode: colorByLevel(next) });
  await stats.gearChangeUpdates(charId) /* push */; return { succ: true, level: next, color, require: gameData.artifact(tpl.id, next + 1)?.spirit_num };
}
```
- Recommended scope: upgrade + getSpiritRequire + repair + skill list/reset + prop reset + resolve/trans (all deterministic or two-phase). Do succinct only if the sub-weapon panel is wanted (no stats). Do not port stage until the real rule is confirmed.

## 5. Magic crystal (Phap Tinh)

### 5.1 Summary
16 slots, each slot has activation, level 0-9, capacity `(lv+1)*100` filled with two point types; stats scale with fill. Tables are transcribed from the client (`GamePredef.MAGIC_CRYSTAL_UP/ACTIVE`), not game data.

### 5.2 Entry points (go:presentation/rtmp/handlers/magiccrystal/handler.go:26-30): `initMagicCrystalData`, `MagicCrystalActive(index)`, `MagicCrystalUp(index)`, `MagicCrystalAddPower(index, amount, pointType "1"|"2")`, `MagicCrystalRecovery(index)`. Service application/magiccrystal/service.go:78,107,147,192,256.

### 5.3 Rules
1. Currencies: dust `magiccystalrec` (73), `magiccystalpre` / permanent "LMC" (74), `magiccystallimit` / limit "SMC" (75) (go:domain/character/character.go:62-64).
2. Activate: slot inactive; costs `ActivateCost(slot)` dust (slots 0-6: 10, slot 7: 8 [type13], 8: 8, 9: 12, 10: 12, 11: 8, 12: 8, 13: 12, 14: 12, 15: 8; per-slot `ActivateCost` fields in catalog.go, 7 slots cost 10, 5 cost 8, 4 cost 12); sets `a=1, lv=0, max=100`.
3. Level up: active, `lv<9`, cost `LevelUpCost(slot,lv)` dust (per-level `Num` column of the catalog: e.g. slot 0 = 20,30,40,50,60,60,70,80,90,0), `max=(lv+1)*100`.
4. Add power: active, `1<=amount<=10000`, pointType 1 (pre) or 2 (limit), enough of that currency, `l+s+amount<=max`; deducts the currency and adds to `l` or `s`.
5. Recovery: active, `l+s>0`, costs 1 dust; refunds `l` to pre, `s` to limit, zeroes both.
6. Stat: for each active slot with `filled=l+s>0`: `bonus = V[slot][lv] * min(filled,max) / max`, stat type per slot `[1,2,4,5,6,7,11,13,31,14,61,8,9,32,58,72]` (go:application/statfeature/magic_crystal.go; catalog.go table), routed through `applyCharacterPropBonus` (so float rates are normalised, flat rounded).
   V examples: slot 0 (HP) 12000*(lv+1); slot 8 (resi-crit 31) 1.2*... 12 (percent points); slot 9 (defy 14) 0.5 per level.
7. Not implemented: weekly Sunday 24:00 wipe of `s` (client text `Language[19]`).
8. Errors are wrapped to the generic client message "operation failed" (handler helpers).

### 5.4 State
Feature `magic_crystal` `{crystals:[{index,a,max,l,s,lv} x16]}`; padded/truncated to 16 on load. Wire `onInitMagicCrystalData` is an object keyed `"0".."15"` of `{a,max,l,s,lv}`.
### 5.5 Push sequence
Mutations return null; push `onUPP {magiccystalrec|pre|limit: newTotal}` per changed currency; the client re-calls `initMagicCrystalData` on a 60-tick poll. No stat refresh push in Go (add `onUPP` stat refresh in H5 after Up/AddPower/Recovery).
### 5.6 Port notes
`server/src/modules/progression/magiccrystal.service.ts`; the catalog should be copied from `go:application/magiccrystal/catalog.go` (16 x 10 x {max,num,V}) into a TS const (`as:GamePredef.as:7057,8051` is the source of truth). Income for dust/pre/limit has no data path (section 0.8).

## 6. Zodiac stars (Cung Hoang Dao)

### 6.1 Summary: 12 star types x 12 levels, gold-paid timed upgrades, a per-type "addition" multiplier (1.0-5.0) bought with items; stats = `add_value * addition`.
### 6.2 Entry points (go:presentation/rtmp/handlers/star/handler.go:38-43): `beginStarLvUp(nextTemplateId)`, `finishStarLvUp(starType)`, `cancelStarLvUp(starType)`, `speedUpStarLvUp(starType, useItem, num, itemId)`, `addStarAddition(starType, quantity, itemId)`, `pmStarExchage(sid, giid, num, tempFlag)` (typo is the client name).
### 6.3 Rules
1. Begin (application/star/service.go:111-198): template = `data_tbl_stars_template[id]`; first lazily completes any slot with `finishDate<=now` (level++); only ONE star may be upgrading; `tpl.level == slot.level+1`; `char.level >= req_level` (80..135 step 5);
   `sum(levels) >= req_star_level` (0,6,12,...66); cost `req_money` **gold (unbound `char.Gold`)**; deduct gold then `finishDate = now + req_seconds` (seconds: 30, 3720, 18240, ... 796920); reply the full state map `{ "1": {tid,level,addition,finishDate}, ... "12": ...}`; failure replies `false`.
2. Finish: needs `finishDate>0` and `now>=finishDate`; `level++`, `finishDate=0`; then `onUPP` stat refresh; reply state.
3. Cancel: clears the timer, **no refund**, `tid` reset to the template of the current level.
4. Speed up (speedup.go:18): consumes ONE speed item of type 552 for that star (ids `3316..3327` = star type 1..12; by given `itemId` if >0 else by template), sets `finishDate=now-1`. Reply `{d: state, n: 1}`. (client args `useItem, num` ignored.)
5. Addition (addition.go:36): `addition>=5.0` -> error; tier = first i with `addition <= [1,2,3,4,5][i]`; `rate = min(BASIC_SUCCESS[tier]*qty + ADD_SUCCESS[tier], 1)` with `BASIC=[1,0.045,0.0225,0.01125,0.005625]`, `ADD=[0,0.015,0.0075,0.00375,0.001875]`; silver cost `round(BASIC_MONEY[starType]*20*rate*addition)` (BASIC_MONEY by type 1..12 = 300,4500,18000,1200,36000,18000,36000,36000,4500,1200,18000,9000) charged from `char.Money` BEFORE consuming `quantity` (<=9999) addition items (type 551, by instance id) (spend-then-consume);
   one Bernoulli roll; success `addition += 0.05` (cap 5.0). Push `onAddStarAddition {t, f: success, n: consumed, d: {tid,finishDate,addition}|null}` (+ `onUPP` on success). Reply null/false. MC_BIRTH event override ignored.
6. Exchange (exchange.go): consumes `num` of a source item, grants `num` of the target star-speed item; reply `{flag:true, finalNum, finalNme, slotId}`. Stub-ish (yield 1:1).
7. Stat (character.go:151-182): per type with `level>0`: template(type,level).`add_prop` mapped (`hp,attack,mAttack,defence,mDefence,speed,hit,dodge,critical,resiCritical,debuffSuccRate,debuffResiRate`) `+= add_value * addition` through `applyCharacterPropBonus`.
   Per-type props: 1 hp, 2 attack, 3 dodge, 4 defence, 5 critical, 6 resiCritical, 7 hit, 8 debuffSuccRate, 9 mAttack, 10 mDefence, 11 debuffResiRate, 12 speed. HP values 1000..12000 per level; type 1 L1: req 80, 300 gold, 30 s.
### 6.4 State: feature `stars` `{ "1".."12": {tid, level, addition(float, default 1.0), finishDate(ms)} }`; currency `starPnt` (240) only for star instance.
### 6.5 Port notes
`progression/zodiac.service.ts`; gamedata: `data_tbl_stars_template` by `(type, level)`; use `Date.now()` ms, compare server time only; per-character mutex (use `char-lock.ts`). Gold must be `gold` (unbound) per Go; H5 has `gold/goldBind` so the wallet helper must offer `spendGold(unboundOnly)`.
Predicted effort: small, fully data-backed; prerequisites: items 551/552 only for addition/speed-up (can be deferred, panel works with waiting).

## 7. Star instance (Tinh Gioi Thap Nhi Cung) - Go-invented, half wired
RPCs `getWarMap`, `clickWarMap(sid, level)`, `addWarMapTime(currentMax)` (go:starinstance/handler.go:45-47). State feature `star_instance` `{scores:{level:{sid:score}}, dailyMax:5, dailyUsed, resetCycle:YYYYMMDD}`.
Rules (application/starinstance/service.go): click validates sid/level in 1..12, every party member must own `stars[sid].level >= level` (else `{c:-2, d:{id,name}}`) and have daily attempts left (`{c:-3,...}`), then increments `dailyUsed` and returns `{c:1}` and pushes `updateWarMapStatus {snum:1}`;
`OnBattleEnd`: `starPnt += level*10` per win, `score = 100 - deaths*20 - clamp(sec/3,0,50)` (invented, not in data or client constants), extra attempt costs `(smax-4)*10` gold. Data: `data_tbl_war_map` (12 rows `id,name,pid '10-1',type`) only lists the 12 bosses.
**No battle is started anywhere**, so rewards never fire (headline 6). Defer; if wanted, it needs combat integration (party + creature group `pid`).

## 8. Astrology (12-Cung pick panel) - Go-invented from one capture
RPCs `getAstrologicData`, `refreshStars`, `pickStar(sid)` (go:astrology/handler.go:39-41). Constants: `MaxPickTimes 12`, `MaxRefreshTimes 10`, `NpPntPerPick 12` (currency `npPnt` 236), formulas hard-coded from one live capture `[3,4]->90`, `[10,5,2]->140` (application/astrology/formulas.go:5-12), `award_record` always `[]`,
refreshes free, no daily reset, no data table. Pushes: `onGetAstrologicData`, `onAstrologicStarsRefresh(left,[sid x3])`, `onAddMoney` (formula award then +12) before `onPickStar`. Grants **no stats** (headline 2). Defer.

## 9. Heiyaoshi (Hac Dieu Thach constellation)

### 9.1 Summary: 20 figures (stage 1 = figures 1-10 paying `heiyaoshiPoint` 233, stage 2 = 11-20 paying `heiyaoshiPoint2` 234); activate points of a graph; completed triangles (areas) and finished figures grant buffs. Data-backed topology.
### 9.2 Entry points (go:heiyaoshi/handler.go:41-44): `initHeiyaoshiPanelData`, `lightHeiyaoshiPoint(figureIdx, pointId)`, `activateHeiyaoshiPoint(typeNum, pointNum)` (gold confirm path, implemented), `resetHeiyaoshi(targetCharId)` (GM >= 5).
### 9.3 Rules (application/heiyaoshi/service.go:120-230, topology.go)
1. `figureIdx` must equal `state.lastActFigure` (default 1) else `ErrFigureMismatch`; currency pool derived server side. Starter points (`price<=0`) are auto-seeded into `actPoint` (the client hides their button).
2. Point must exist (`LookupPoint`), not already active, and (if it costs anything) be adjacent to an active point (`Around` links) else `ErrPointNotAdjacent`.
3. Cost: stone path deducts `point.price` of the figure's pool; gold path (`useGold`) deducts `point.gold` unbound gold. If stone is short and the point has a gold price, `lightHeiyaoshiPoint` pushes `goldBuyHeiyaoshi(goldCost, pointId)` and replies a `goldFallback` object instead of an error.
4. After the point: newly completed areas (all vertices of an area active) and lines (`AroundLine`) are marked; if every area of the figure is complete the figure is done: `lastActFigure = next`, `ActArea` reset, starters of the next figure seeded.
5. Buffs `computeBuffs` (topology.go:204-252): for each completed figure add the sum of its area attributes **plus** `data_tbl_heiyaoshi_full_buff` rows; for the in-progress figure add the attributes of `actArea`.
   Stage 2 figures reuse stage-1 topology (`sourceFig = fig-10`) with multipliers `stage2Multiplier`: prop 1 x2.0; props 13,31,59,60,62,63 x1.5; prop 34 x0.5; others x1.0 (topology.go:191-202) - **not found in data or client, likely invented/calibrated; unverified**.
6. Stat application (character.go:260-306): `Buff` map propId->value; props 14,31,34,61 are "percent-point" finals (`AddFinal`), 59,60,62,63 are fractions scaled x100 into the float bucket, others through `NormalizeCharacterPropType` flat/float.
7. Quirk: `Buff` is fully recomputed on every mutation and on panel load (`LoadPanel` repairs legacy state).
### 9.4 Data (Mongo): `data_tbl_heiyaoshi_point` (296: `figure, point_id, price, gold`), `_point_link` (2914: `figure, point_id, link_type 'around'|area|line..., ord, neighbor_id`), `_area` (125: `figure, area_id, l_res_num, a_res_num`), `_area_attribute` (191: `figure, area_id, prop_id, value`), `_full_buff` (106: `figure, prop_id, value`).
### 9.5 State: feature `heiyaoshi` `{lastActFigure, actPoint:[], actArea:{id:1}, actLine:{id:1}, AreaNum, LineNum, Buff:{prop:value}}`. Rebuilt from topology on load.
### 9.6 Push sequence (actions.go:41-72,150-182): `gotoLightHeiyaoshiPoint(pointId)` -> `gotoLightHeiyaoshiArea(areas, buff)` (if new areas) -> `gotoLightHeiyaoshiLine(lines, lastActFigure)` (if new lines) -> `gotoLightHeiyaoshiAllJihuo(state)` (if figure complete) -> `onUPP {wallet delta}` -> stat refresh `onUPP` -> `onInitViewProp`; reply `{figure, pointId, figureCompleted}` (success shape via `successResponse`). Errors push `onSystemSay` Vietnamese toasts.
### 9.7 Port notes: `progression/heiyaoshi.service.ts`; load the five tables into memory at startup (graph of ~300 nodes). Keep the Go validation order. Verify stage-2 multipliers against a live capture before shipping (or ship stage 1 only).

## 10. War sprite (Chien Hon Bao No)

### 10.1 Summary: 8 war sprite chains (kind 1, "level up", currency `warSprite` 229 "Dung Khi Thach") and 8 battle sprite chains (kind 2, "evolve", currency `battleSprite` 230 "Y Chi Thach"), each 11 levels. Fully data-backed.
### 10.2 Entry points (go:warsprite/handler.go:33-38): `getSpWarData`, `addWarSprite(idx 1-8)`, `addWarSpriteGold(idx)`, `addBattleSprite(idx)`, `addBattleSpriteGold(idx)`, `getWSPBuffList`.
### 10.3 Rules
1. State `{wObj:{1..8: tplId}, bObj:{1..8: tplId}}`, defaults roots `1100,1200..1800` and `2100..2800`; lazily initialised.
2. Upgrade (application/warsprite/service.go:75-137): row = current template; reject max (`next_id==0`); cost is on the CURRENT row: stones `cost_num` or gold `cost_gold` (unbound gold); set slot to `next_id`; persist char + state.
3. Aggregation (domain/warsprite `AggregateMultiplied`): for each type i and prop slot j, `total[p_t] += war.p_n + war.p_n * battle.p_n / 10000`.
   Stat scaling before applying (character.go:209-218): props 13,14,31,61 `/10000`; 59,60,62,63 `/100`; others raw. Props 5,7 are markers.
4. Row example id 1100: `kind 1, level 0, cost_gold 350, cost_num 350, next_id 1101, p_t1..p_t8 = 1,4,5,11,59,62,61,0, p_n* = 0`; 88 rows per kind.
### 10.4 Push sequence: `updateWSPPanel {wObj,bObj}` -> wallet `onUPP {warSprite|battleSprite|gold}` -> stat refresh `onUPP`; reply success shape `{kind,index,newId,usedGold,maxed}`; errors via toast. `getWSPBuffList` returns `{propType: total}`.
### 10.5 Port notes: `progression/warsprite.service.ts`; accessors `warSprite(id)` from `data_tbl_war_sprite`; provider `warSpriteBonuses` implements rule 3-4 (needs rate props: 13/14/31/61 as `finalCritical`.. mapping: 13 critical, 14 defy, 31 resi-crit, 61 resi-defy; 59/60 `finalPraDef/MagDef`, 62/63 `finalEnhPhy/MagicHurt` once H5 dictionary is fixed).

## 11. Monster heart (Ma Vat Tam) - state only
RPCs `initMonsterHeartData` (reply `{bag,data}`), `monsterHeartSet [bagItemId,holePos,box,type]`, `monsterHeartReMove [holePos,box]` (go:monsterheart/handler.go:45-47). State feature `monster_heart` `{bag:{ji,lon,mo,ren,shou,te,zhi:{itemId:{itemId,n}}}, data:{hadActCombine, hadActHole:{box:{hole:itemId|-1}}, heartBoxLev}}` (5 boxes x 7 holes).
Set/remove validate `BagContains(bagItemId)`, box/hole ranges; pushes `onInitViewProp` then `updateMonsterHeartPanel [{bag,data}]`. **No writer fills `bag`, no stat reader exists** (grep: only statfeature/service.go:66 login shape). Data `data_tbl_creatureh_heart` (1938 rows: `id,name,color,type,prop_type,propnum,heart_talent,exp,icon_code`) is only used for client display. Defer (needs creature drop of hearts + a defined combine bonus).

## 12. Lighter systems

### 12.1 Mystery treasure (Mat Bao)
Registered (go:mysterytreasure/handler.go:65-75): `onGetMysBookData`, `onGetMysMakeData`, `onGetMysBagData`, `onGetChipBagData`, `getMysTreBuffByKind`, `getMysTreBuffSimpleData`, `mysTreObjResolve`, `onGetMysAddTimes`, `addLimitMakeTimes`, `makeMysTre`, `onGetMakeLimitTimes`.
**Collision**: `onGetMakeLimitTimes` is also registered in `craft/handler.go:24` (craft registers first, mysterytreasure at main.go:649 wins; the craft file documents the removal intent but the registration is still present).
`getMysTreBuffByKind`/`getMysTreBuffSimpleData` return empty (no buff data) -> **no stats**. State feature `mystery_treasure` `{bag{slot:{mid,num}}, learnedRec, skiLvl, skiPt, scores}`; make consumes materials then produces. Data `data_tbl_mystre` (720: `id,name,kind,level,star,prop_type,prop_num,per,mys_sil`) and `data_tbl_mystre_recipe` (66: `st '16-1-1', n1..n6, q1..q6, t1..t6`). Stubs: exchange yield 1 crystal per unit. Defer (heavy item pipeline, no stat effect implemented).

### 12.2 Soul gem (Menh Hon, package `soul`) - not stats
RPCs `openBag, lockSoul, soulLevelUp, putInToExp, transformExp, preySoul, exchangeSoul, putSoulToBag, openPetSoulBag, moveSoul` (go:soul/handler.go:43-52). Data `data_tbl_pet_soul` (840: `id,name,color,level,exp,up_exp,price,prop_type,prop_val,chip,req_chip,type`). Equipped soul props are **not aggregated** into stats anywhere in Go (only soul service + chat colour use them).
`preySoul` pool is an assumption (group by `color` tier, uniform). Defer. Do not confuse with train soul.

### 12.3 Train soul (Luyen Hon, `trainSoul`) - live
`trainSoul` (go:soultrain/handler.go:47; service.go:67-108): cost **4700 mysteryCrystal (215)**, gain **+10000 soulExp**, level up while `exp >= data_tbl_soul[level+1].require_num`; max level 100 (client const `MAX_SOUL_LVL`, as:TrainSoulPanel.as:68). Reply `{soulLvl, soulExp}` (client reads `soulLvl/soulExp`, as:TrainSoulPanel.as:616-617).
Stat: the CURRENT level row only (go:statfeature/character.go:68-87): 10 prop/prop_num pairs (1 HP, 11 speed, 4, 5, 6, 7, 8 hit, 9 dodge, 13 critical, 31 resi-crit) e.g. L1 HP 231 ... L100 HP 60000; client also shows the current-level row (as:TrainSoulPanel.as:555-600) so absolute-per-level is consistent.
State: `character_progression.soul_level/soul_exp` (+ `soul_points`). **Open**: `require_num` rows rise only 50k per level (1.55M, 1.60M, ... 6.5M at L100) while a train gives 10k exp, i.e. L1 needs 155 trains = 728k crystals. The client progress bar `setProgress(trainSoulExp, requireNum(next))` suggests exp is progress inside the level (reset on level up) - Go keeps it cumulative. Pick one and calibrate against a live capture; recommend per-level reset only if the live capture shows exp dropping. Unverified.

### 12.4 Awakening (Giac Tinh)
RPCs `addAwakenPoint`, `reduceAwakenPoint`, `awakening(autoBuy)`, `ensureBuyAwaken` (go:awaken/handler.go:33-36). Level up gacha (application/awaken/gacha.go:73-143): target row `data_tbl_awakening[level+1]` (77 rows: `item_num, money, rate, points, req_level, prop1/2, prop_num1/2`); need `char.level>=req_level`; item **4913 "Hon Don Ma Tinh"** x `item_num` and silver `money`;
if short: without autoBuy reply `{needGold: missing*10}`; with autoBuy buy at **10 gold each** (invented price). Roll `rand*100 < row.rate + awakenAdd`; hit: `level++`, `point += row.points`, `awakenAdd=0`, reply `{success:true, awakenLevel, awakenPoint, awakenAdd:0}`; miss: `awakenAdd += 1` (pity step, invented), reply `{success:false, itemNum:remaining, awakenAdd}`. Cost consumed even on miss (money then items).
**Stat bug**: Go applies only row `[awakenLevel]` (character.go:56-66); the client sums rows 1..L (as:AwakenPanel.as:1585-1610) so the intended stat is cumulative. Skills: `data_tbl_awakening_skill` (36: `cost_points, max_level, req_points, skill_code_name, req_class`), `addAwakenPoint(code)` validates `point>=cost`, `pointDict[code]<max`, `pointUsed>=req_points`. Awaken skill effects are not applied to stats.
State `character_progression.awaken_level/points/points_used` + feature `awakening {point,pointUsed,pointDict,awakenAdd}`. Percent props: `AWAKEN_PERCENT_PROP` = 62, 63 only (client).

### 12.5 Medal (An Chuong) and explorer medal (EMedal)
Medal RPCs `getMedalInfo, moveMedal, arrangeMedalBag, upMedal, breakMedal` (go:medal/handler.go:35-39); state `{exp, bag{slot:{i,t,n}}, petBuff{t}, charBuff{t}, checkFlag}`, equip slots 1001-1005 pet / 2001-2005 char, engrave 1006/2006 (not bag entries). Data `data_tbl_medal` (573: `basic_tid, level, q, sid 1001-1006/2001-2006, prop_type, prop_val (client shows /100), exp, up_exp, clevel, join_tid`).
`upMedal` deducts `state.exp` by `up_exp`; `breakMedal` credits `exp*count`; `q>=4` -> literal `"ban"`. **No stat bonus (dead reader) and no source of medals except achievement item rewards (no data)**. Defer.
Explorer medal: registered in the activity handler (go:activity/handler.go:181-182) `initEMPanel`, `levelUpEMedal`; the client also calls `levelUpEMedalByGold(cid, type)` (50 or 500 gold, as:ExplorerMedalPanel.as:1478-1507) which **is not registered** in Go. State `{info:"level|score"}`; level-up needs `score >= data_tbl_explorer_medal[level+1].cost` (score never decreases and **has no source**); stat = current-level row (8 prop type/num pairs) - this one does apply. Data 100 rows (`cost, cost_gold, prop_type1-8, prop_num1-8`).

### 12.6 Stone seal (An The) / PRS (Chan Hon Than Thu) / prabuff / fairy
- **Stone seal** (go:stoneseal/handler.go:31-37): 7 RPCs, state `stone_seal {stone:{equipSid:{lvl, data:{s1..s10}}}}`; costs transcribed from the client (bore dust `[50,60,77,102,136,180,234,299,375,463]`, succinct dust `[110,110,275,529,582]`); no stat effect (`bonus_ready=0`); the login `add` block is cosmetic. **`stoneSealGetData` is shadowed by `activity/backlog_panels.go:210` (returns `{}`)**.
- **PRS** (go:prs/handler.go): state `prs {tid, actArr, actLimitObj, useSid, useId, chipBag, excBag, isShow}`; tables `data_tbl_prs_tree` (`cost_stone, level, next_id, p_t1-8, p_n1-8`), `_prs_show` (`need_chip_id, need_num, limit_type/time, p_n/p_t, tab`), `_prs_chip`; **bonus reader dead**; **`initPRSPanel` is shadowed by `activity/backlog_panels.go:219`** (returns an empty bag).
- **Prabuff / Ma Phap Bi Tran** (go:prabuff/handler.go:32-33): 8 tracks {level 0-30, exp} (1 def, 2 petDef, 3 magicDef, 4 petMagicDef, 5 peoAttack, 6 petAttack, 7 peoSpeed, 8 petSpeed). `addPracticeExp(praType, isGold)`: costs 10 element (`elementPnt` 237 for types 1-4, `yijieElement` 220 for 5-8) or 7 gold (assumed), gain `addExp[level]` (table in application/prabuff/tables.go, 1..17) with a 10 % crit x2 (assumed), level up while `exp >= levelExp[level]` (table 253..97364). Character stats (tracks 1,3,5,7 only): def/magicDef -> `finalPraDef/MagDef += EFFECT[lvl]/100`; peoAttack -> +percent attack and mattack `round(ATK[lvl]/100)`; peoSpeed -> +percent speed (arrays in application/statfeature/prabuff_bonus.go:12-26, transcribed from `GamePredef.PLAYER_PARBUFF_LEVEL_*`, 31 entries).
  Reply `{praType, buff, exp, goldNum, elementNum, addExp, critMulit}`; push `updatePraView`. Rebirth-rank gate not implemented.
- **Fairy** (go:fairy/handler.go:38-49): 12 RPCs, state `fairy {fairyId: dto}`/`fairy_skin`; tables transcribed from the client (FAIRY_LEVEL_EXP[20], FAIRY_GROW_EXP[50]); template `data_tbl_fairy_tempalte` (17); one free fairy "Thien Su Poli" (tid 1) by NPC; **no stat bonus in Go**. Large surface, defer.

## 13. Currency map (Go ClientKey -> id), all `GameKV` currencies (domain/character/character.go:62-102, currency_keys.go)
`magiccystalrec` 73, `magiccystalpre` 74, `magiccystallimit` 75, `mysteryCrystal` 215, `runeExp` 217, `yijieElement` 220, `realSoulStone/Crystal/Water` 226-228, `warSprite` 229, `battleSprite` 230, `monsterHeart` 231, `heiyaoshiPoint` 233, `heiyaoshiPoint2` 234, `energyStone` 235,
`npPnt` 236, `elementPnt` 237, `pvePoint` 238, `stoneSealPoint` 239, `starPnt` 240, `spirituality` 241. Basic currency ids 0/1/2 collide with arena points elsewhere (`CurrencyArenaPoint=1` vs gold) - do not reuse numeric ids in H5, use string keys.
Acquisition in Go: loot award type 35 (item_id = currency id) and gift boxes (`combat/currency_drops.go`, `effect_award.go`), both empty in local data; `mysteryExchange` yields crystals (stub 1 per unit).

## 14. Registration and live-vs-stub table
| RPC group | Status | Evidence |
|---|---|---|
| gtl, setTitle, setActTitle | live, unique | title/handler.go:28-30 |
| getAchieveAward | live (claim only; progress never written) | achievement/handler.go:44 |
| MW 18 RPCs | live, unique; stage unreachable | magicweapon/handler.go:53-69 |
| magic crystal 5 | live | magiccrystal/handler.go:26-30 |
| star 6 | live | star/handler.go:38-43 |
| star instance 3 | live but battle never starts | starinstance/click.go |
| astrology 3 | live, Go-invented, no stats | astrology/handler.go:39-41 |
| heiyaoshi 4 | live (incl. activateHeiyaoshiPoint) | heiyaoshi/handler.go:41-44 |
| war sprite 6 | live | warsprite/handler.go:33-38 |
| monster heart 3 | live, state only | monsterheart/handler.go:45-47 |
| trainSoul | live | soultrain/handler.go:47 |
| awaken 4 | live | awaken/handler.go:33-36 |
| medal 5 | live, no stats | medal/handler.go:35-39 |
| initEMPanel, levelUpEMedal | live; `levelUpEMedalByGold` NOT registered | activity/handler.go:181-182 |
| stoneSeal 7 | `stoneSealGetData` shadowed by stub; rest live | backlog_panels.go:210 vs main.go:605,768 |
| prs | `initPRSPanel` shadowed by stub | backlog_panels.go:219 vs main.go:610,768 |
| prabuff 2 | live | prabuff/handler.go:32-33 |
| fairy 12 | live | fairy/handler.go:38-49 |
| mystery treasure 11 | live; `onGetMakeLimitTimes` also in craft (mysterytreasure wins) | craft/handler.go:24, mysterytreasure/handler.go:75 |
| soul gem 10 | live | soul/handler.go:43-52 |
Duplicate registration names found repo-wide (grep): `clickBoss, clickNpc, getTodayOnlineTime, initPRSPanel, onGetMakeLimitTimes, repairAll, stoneSealGetData`.

## 15. Stale legacy memory (do not trust)
`docs/memory/star-instance-system.md` (claims a working combat integration), `docs/memory/stat-feature-foundation.md` ("wired" rows for medal/PRS bonus; `activateHeiyaoshiPoint` "not implemented" in `heiyaoshi.md` is also stale), `title-system.md` (title buff `buff_id` never populated; real link is `b`), `achievement-system.md` (implies tracking), `magic-weapon.md` (formulas/stage described as live), `mystery-treasure.md` (handlers described as stubs that now exist), `astrology-system.md` (omits that it grants no stats).

## 16. Recommended implementation order for H5 (M7)
0. **Foundation**: provider registry in `StatsModule`, `currencies` map on `Character` with atomic spend/credit + `onUPP` delta push, `character_stat_features` store, dictionary fixes (59/60), rate normalisation on the feature path, dev/GM grant command for the currencies (needed because no data source exists).
1. **Titles** (data-backed, small; includes stat provider via `data_tbl_title.b`, `setTitle` `bd`, scene broadcast, `gtl`, login `t/actT/ct/cts`). Grant paths: GM command now, achievement claim later.
2. **Train soul + awakening** (pure data, only a currency/item cost; fix cumulative awakening bonus; pick soul exp semantics).
3. **War sprite**, **magic crystal**, **heiyaoshi**, **zodiac stars** (all data-backed or client-table-backed, deterministic, per-character state; high stat value; each late-game-gated: zodiac req level 80+, awakening req level 80+).
4. **Magic weapon** (needs item acquisition for kind-8 templates and spirituality income; upgrade/repair/skill/prop reset/resolve/trans only).
5. **Achievements** (cross-cutting hooks; start with level/skill/quest/title-count/login/pet-count triggers; fix `achieveReqLog` key; title rewards by `desc` parsing).
6. **Prabuff** (client tables already transcribed) and **medal/explorer medal** if the panels are wanted (medal needs a stat rule invented from the client display `prop_val/100`).
Defer: astrology (no data, no stats), star instance (needs combat integration and Go's rewards are invented), monster heart (no source, no stats), mystery treasure, soul gem, stone seal, PRS, fairy (large surfaces with no/unclear stat effect), MW stage/succinct (unclear semantics, no stats).

## 17. Unverified / open questions
1. Real server behaviour of title buff application (Go never applies; recommended: apply `b` buff of both active titles).
2. Real push names for achievement completion/claim (`updateAchieveAwardLog`/`onAchieveTitle` are not in the decompiled client; the panel method `AchievementPanel.updateView(type, aid, obj)` at as:AchievementPanel.as:633 is called from an unlocated callback).
3. Achievement `check` column meaning (-1/0/1), `kind` 5/6 triggers, thresholds for `num=0` rows (588), the full requirement-type map.
4. `artifact.rate`/`item_num` usage on upgrade/stage in the real server (Go ignores them), and whether levels 21-50 are meant for the stage-8 ladder.
5. Succinct `lockArr` polarity; sub-weapon succinct stat effect (none in Go).
6. Soul train exp semantics (cumulative vs per level), awaken pity step and auto-buy price, zodiac cancel refund, heiyaoshi stage-2 multipliers, prabuff costs/crit, medal stat rule and `prop_val` scale.
7. Whether `ct` should include special titles (SQL has no filter) and what `data_tbl_title.t` means.
8. Income for every currency in section 13 (no local data); `data_tbl_item_award` is empty so type-550 box contents are unknown.
9. H5 side not inspected: client code for these panels; this document covers the server only.
