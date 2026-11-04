# M8 Activities: legacy server research (daily, VIP/PM, bosses/events, loop quests, life systems)

Date: 2026-11-04. Scope: Go server `D:\mcgame` (read-only) + `data_tbl_*` in Mongo. H5 state checked in `D:\mc-game-new` (M1-M7 done).
Legacy paths are relative to `D:\mcgame\internal\` unless noted. Everything not re-read in code is marked **unverified**.
Legacy memory docs read first and re-verified against code: `quest-loop-system.md`, `pet_ppve.md`, `marriage-system.md`,
`buff-system.md`, `daily-signin.md`, `daily-act.md`, `activity-system.md`, `pm-vip-system.md`, `vip-shop.md`, `boss-daily.md`,
`boss-loot.md`, `schedule-boss.md`, `farm-life-skill.md`, `dress-system.md`.

## 0. Executive summary

- The **Go server is mostly a shell for M8.** Only four sub-systems have real rules: daily sign-in (8 RPCs), PM/VIP purchase + claim rights,
  loop quests (takeLoop/cancelLoop/loopRepaire), and the small feature stores (mount, lotto/wish-tree, prabuff, pet-arena Elo, farm/magic-estate,
  dress gacha). Everything else under `handlers/activity` is a hard-coded mock (`awards.go`, `panel.go`, `backlog_panels.go`, `icon_panels.go`).
- **Biggest finding for H5: loop-quest rounds carry no rewards in the data** (0 of 1,395 type-7 quests have `award_exp_re`, `money_num` or
  `data_tbl_quest_award` rows; Go pays nothing per round). Reward formulas must be invented in H5. The Go loop code has no reward scaling at all
  (`application/quest/loop_completion.go:131-230` calls `applyRewards`, which yields zero for these rows).
- **Reward item ids in the Go seeds are wrong in two places** (see A3/A5): `data_daily_act_award_rewards.item_id` 2003-2007 are quest/proof items;
  the real chests are `icon_giid` 3255-3259 ("Bao Ruong Nang No Trang..Cam"). Online-gift ids 1001/1002/2001/2002/2003 are also placeholders.
- Diary points: **only task 29 (daily login) is wired in Go** (`application/activity/daily_act_service.go:101-125`, the only `IncrementTask` caller).
  Vitality is therefore a design job for H5; 44 diary rows give the point values and hook candidates (A2).
- **The seed importer skips `data_tbl_schedule_boss`** (150 rows of lowercase `insert into`; `server/tools/import-seeds.ts:33` regex is
  case-sensitive and has no `i` flag). `data_tbl_boss_loot` has no seed file at all (dashboard-authored). `data_daily_signin_lucky_tiers` only has
  May 2026 rows (a November lookup returns nothing, so the lucky-day claim is dead without new rows).
- Registration collisions found (last-write-wins, `cmd/gameserver/main.go`): `getTodayOnlineTime` auth stub (`auth/handler.go:250`, line 437) is
  shadowed by the activity handler (`activity/handler.go:165`, line 768); `stoneSealGetData` and `initPRSPanel` real handlers (`stoneseal/handler.go:31`,
  `prs/handler.go:35`, registered 605/610) are **shadowed by backlog starter stubs** in `activity/backlog_panels.go:210,219` (registered at 768,
  last write wins) - a legacy bug worth knowing, H5 is unaffected; `clickBoss` scene (451) is shadowed by combat (539); stub handler (807) shadows
  nothing relevant (`getDailyOnlineAct`, `getActivityInfo` are only here).
- Client RPCs that **have no Go handler at all** (the call fails): `takeFeastGift`, `getLoginAward`, `getGameGift`, `getConsume`
  (`docs/client/view/view/compDragable/GameIntroPanel.as:6627,4584,7715,8363`; grep of `internal/` finds no registration).
- Recommended order: (1) activity bar + daily/diary + online time; (2) sign-in; (3) PM/VIP core; (4) loop quests; (5) daily boss; (6) lotto/prabuff/mount.
  Defer: marriage, pet arena, PPVE, dress gacha, magic estate, quiz/maze, nine boss, guild-war stubs, gift codes.

## 1. Summary table (live vs stub, H5 rating)

| System | Go status | State | H5 with existing data |
|---|---|---|---|
| Activity bar (`startedActList`, `data_tbl_activity` 84 rows) | live, DB-driven | none | **yes** (needs client hub) |
| Daily sign-in (8 RPCs) | live, real rules | PG `character_daily_signins` | **yes**, reward rows must be authored |
| Diary / vitality (`TBL_DIARY` 44) + chest claim | live shell, 1 producer | PG `character_daily_act` | **partial** (hooks for ~12 of 44) |
| Online gift (`onStartNewGift`/`takeNewGift`/`takeSPGift`) | live, hard-coded | memory (`sync.Map`) | **partial** (items are placeholders) |
| Online time `getTodayOnlineTime` | live, approximate | PG (`first_login_at`) | **yes** |
| Offline exp (`getOfflineExp`/`getPetOfflineExp`) | live, real formulas | char `LastActive` | **yes** (needs pet exp API) |
| Festivals `TBL_FEAST` (32), `takeFeastGift` | mock / missing | none | **partial** (data ok, claim design needed) |
| Gift codes / `searchGameGift` / `getGameGift` | mock / missing | dashboard-only tables | **no** (no client redeem RPC) |
| Tutorial `saveGuideLog` | live | char `GuideLog` map | **yes** (trivial) |
| PM/VIP (`initPmData`, `buyPm`, `doPmOperation`) | live | PG char columns | **yes** (6 of 35 rights have rules) |
| VIP shop (3 RPCs) | live, Go-invented | PG `shop.*` | **yes, later** (decision in B4) |
| Daily boss (3 RPCs) | live (battle + counters) | char `BossDaily` JSON | **partial** (rewards = battle exp only) |
| Schedule/world boss | live scheduler | PG `schedule_boss_state` | **partial** (seed not imported, no channels) |
| Boss loot | live engine, **empty table** | PG | **no data** |
| Nine boss, consume/recharge events, guild-war rank | mock payloads | none | **no** |
| Quiz (`TBL_ANSWER` 3627), maze (`TBL_MAZE` 15, `TBL_MEVENT_*`) | models only, no logic | none | **no** (new design) |
| Lotto / wish tree | live | feature JSON | **yes** (`TBL_PLAN`) |
| Prabuff (magic array) | live | feature JSON | **yes/partial** (costs unverified) |
| Loop quests | live, no rewards | PG `character_quest_loops` | **yes** (~90% of rounds fit H5 objectives) |
| Marriage | live panel, no effects | PG + Redis | **partial/defer** |
| Farm (plots) + magic estate | live | PG | **partial/defer** |
| Dress | live gacha | char JSON | **partial/defer** |
| Mount (5 RPCs + riding) | live | feature JSON | **yes** |
| Life skills cook/medicine/fish/herb | live | skills + char dex | **partial** (no H5 life skill) |
| Pet arena (18 RPCs) | live Elo, simulated | PG | **no/defer** |
| PPVE tower (6 RPCs) | floor advance = win | feature JSON | **no/defer** |

---

## A. Daily systems

### A1. Daily sign-in (8 RPCs) - rating: **yes**

**Entry points** (`presentation/rtmp/handlers/dailysignin/handler.go:39-46`, registered once, `main.go:777`; service `application/dailysignin/service.go`):

| RPC | Reply | Service |
|---|---|---|
| `initDailySignInActData` | inline `{time, conf, data}` (`init_data.go`) | `GetState` + `ListRewards` + `ListLuckyTiers` |
| `initDailySignInActConsumeLimit` | push `oninitDailySignInActConsumeLimit(total)`, reply nil | `GetState` |
| `dailySignInActDoSignin` | inline + push `setBtnsDailySignInAct` and `onDailySignInActDoSignin` (dual channel) | `DoSignin` service.go:269 |
| `dailySignInActGetAward` | inline Number (1 = ok) + normal item pushes | `GetAward` :312 |
| `dailySignInActRetroactive` | push `setBtnsDailySignInAct` + `onDailySignInActDoSignin`, `onUPP{gold}` | `Retroactive` :369 |
| `dailySignInUpActCrit` | push `updateDailySignInActCrit(Number)`, `onUPP{gold}` | `UpCrit` :422 |
| `getSignInData` / `signinNow` (legacy 5-day panel) | inline `{continueSigninTime, signinedToday, signedYesterday}` | projection of the same ledger |

**Rules** (service.go unless noted):
1. Config defaults (`DefaultConfig` :52): retroactive price 50, crit price 100, crit step 5, surprise day weekday 6 (Saturday), lucky day 4 (Thursday),
   level gate 50, `CloseOnKey` 1 (must be non-zero or the client hides the crit button, `DailySignInPanel.as:3750` per legacy memory).
2. Level gate 50 on every action except `GetState` (`requireLevel` :254) -> yellow `"Can dat cap 50 tro len de tham gia."` (message text from legacy memory, **unverified** in code).
3. Month ledger keyed `(character, year, month)`; `claimed_days_bitmap` bit `day-1`; day = server-local calendar (Asia/Ho_Chi_Minh,
   `docker/docker-compose.yml:535`). New month = new row, so crit and lucky flag reset automatically.
4. `DoSignin` :269: crit meter += 5 *before* the roll (clamped 100); roll `rand(100) < crit`; on hit reset meter to 0. Already signed today -> error (client gets state only).
5. Daily reward: weighted pick from `data_daily_signin_rewards` with `inc=1`; **surprise reward** (`inc=2`) only if weekday == 6 AND the streak from the
   event start day through today is complete (`IsStreakComplete` record.go:90); **crit reward** (`inc=4`) if the roll hit. Order: daily, surprise, crit.
6. `Retroactive` :369: pays 50 gold (GoldBind first, then Gold, `spendGold`), signs the **first** unclaimed day before today (`FirstUnclaimedBefore` record.go:105),
   also +5 crit and rolls crit; adds 50 to `consume_limit_total`.
7. `UpCrit` :422: 100 gold, +5 crit (error at 100), adds 100 to `consume_limit_total`, no roll.
8. `GetAward` (lucky day) :312: weekday must be 4, streak complete through today, tier row for `WeekOfMonth(today)` (`(d-1)/7+1`, record.go:23) must exist,
   `consume_limit_total >= point_threshold`, one claim per month; **grants `gold_amount` regular Gold** (not an item). `computeAwardDay` :184 only
   reports an `awardDay` to the client when all gates pass.
9. `consume_limit_total` only counts spend inside this feature (retroactive + crit), not global spend (`daily-signin.md` "Spend gate scope").
10. Legacy panel: `LegacyState` record.go:120: streak run ending today, wrapped into 1..5 (`((s-1)%5)+1`).

**Data** (Mongo): `data_daily_signin_rewards` 3 rows `{reward_id, inc, item_id, quantity, weight}`:
`(1, inc1, item 408 "Noi Don Huyen Thu", w1)`, `(2, inc2, 4015 "Huyet Linh Lung")`, `(3, inc4, 4080 "Tui Qua Den Dap Cong On")` - these look like
placeholders (an item template set "Tui Qua Bao Danh Ngay 1/3/5/7" = ids 4135/4136/4137/4138 exists and fits the day-N reward theme; **unverified** which the
original used). `data_daily_signin_lucky_tiers` 5 rows, year 2026 month 5 only: thresholds 499/999/1999/4999/9999, gold 500/1000/2000/5000/10000.
`data_tbl_activity` id 65 `dailySignInAct` enable=true flag=1 (the hub icon).

**State -> Mongo**: `character_signins` `{characterId, year, month, claimedDays: number (bitmap), critPercent, luckyClaimed, consumeTotal, updatedAt}`, unique
`(characterId, year, month)`; atomic `$bit/$inc` via `findOneAndUpdate`.

**Push sequence**: DoSignin: item pushes (`onAddItem`/`onAddCharactorSlot` per granted item, `grants.go`) -> `setBtnsDailySignInAct(SignInData)` ->
`onDailySignInActDoSignin`; reply inline. Retroactive/UpCrit: `onUPP{gold}` first when gold was debited (`daily-signin.md`), then the panel push. Errors: panel
keeps state (no explicit error push besides the level-gate message).

**TS pseudocode** (`server/src/modules/activity/signin.service.ts`, pure rules in `signin.rules.ts`):

```ts
async doSignin(cid) {
  requireLevel(cid, 50);
  const { y, m, d, weekday } = vnNow();                       // UTC+7
  const pre = await this.get(cid, y, m);
  const crit = Math.min(100, pre.critPercent + CRIT_STEP);
  const hit = rollPercent(crit);
  const rec = await this.setDay(cid, y, m, d, { critDelta: CRIT_STEP, resetCrit: hit }); // null when already set
  if (!rec) throw new RpcException('already signed');
  const out = [pickWeighted(rewards.filter(r => r.inc === 1))];
  if (weekday === SURPRISE_DAY && streakComplete(rec, d)) out.push(pickWeighted(rewards.filter(r => r.inc === 2)));
  if (hit) out.push(pickWeighted(rewards.filter(r => r.inc === 4)));
  return { rec, granted: out };
}
```

### A2. Diary / activity points (`TBL_DIARY`) - rating: **partial**

**Entry points** (`activity/handler.go:154-156`, `progress.go:15`, `daily_act.go:13`, `onboarding.go:39`):
`getCharDiaryData` -> `{<taskId>: count, ..., act, ad}` (map built in `daily_act_service.go:71-84`);
`getDailyActAward(tier 0..4)` -> `{f}`; `getDailyPanelAwardState` -> **hard-coded** `{gameintro:true, txkcBtn:false, txkcBtn2:false, fback:false, autot:false, vip:false}` (`onboarding.go:39-54`);
push `updateDiaryData({id (string), val, act, num})` (service :138-154).

**Rules**:
1. Day = server-local midnight, row per `(character, day)`, lazily created (`player.character_daily_act`, migration `20260510095051_daily_act_panel.sql`).
2. Producers: only `OnLogin` -> task `"29"`: `+1 count, +template.act points` on the first login of the day (service :101-125, event bus `LoginListener`).
   `IncrementTask` does **not** clamp to the table `max` (SQL :131-171) and never re-checks it.
3. Claim `getDailyActAward(tier)`: tier must exist in `data_daily_act_award_rewards`; `vitality >= threshold`; **one claim per day for all tiers** (`award_claimed` bool;
   the client mirrors it as `ad`, `DailyActPanel.as:1752,1293`); item grant failure rolls the claim back (service :156-221, SQL claim fn :65-107).
4. Online time `getTodayOnlineTime` -> `{t: minutes, f: 0}` (`rewards.go:120-142`). `t = online_seconds_offline + (now - first_login_at)`, i.e. wall time since the first login of the day,
   **not** time actually online; `online_seconds_offline` is never written (grep) and `f` is always 0 (`daily-act.md` "Online time"). The auth-package duplicate returns `0` and is shadowed.
5. Task 33 "30 minutes online" (max 12) has no producer.

**Data**: `data_tbl_diary` (44 rows): `id`, `act` (points per completion), `max` (daily cap, -1 = unlimited), `name`, `info`, `link_type` (-1 none, 1 = walk to NPC `nid`,
2 = open panel `nid`, 3 = event), `nid`, `pos` (display order). `data_daily_act_award_rewards` 5 rows (tier, threshold 30/60/120/210/360, `item_id`, quantity 1, `icon_giid` 3255..3259).
**The `item_id` column (2003..2007) is wrong**: names are Sach Phi Hanh / Chung Minh Khieu Chien / Bang Chung Qua Cua / chuyen gia chung nhan (quest/proof items);
`icon_giid` 3255-3259 = "Bao Ruong Nang No Trang/Luc/Lam/Tim/Cam" (type 550 boxes, `i1=0` so Go's `boxEffectHandler`, `application/item/effect_box.go:19`, cannot open them either; their
description says "random 2 items + Pha Le Ma Phap", content table **unverified**). Seed max possible points = sum of capped rows (about 700), thresholds up to 360.

**Hook points in H5** (event -> diary id, points `act`, cap `max`); the diary rows pair with loop ids by `nid` (= loop NPC):

| Diary id | Source | H5 hook | act / max |
|---|---|---|---|
| 29 daily login | enterGame (first of day) | where `AchievementEvents.recordLogin` runs | 1 / 1 |
| 33 online 30 min | session timer | gateway session ticker (new) | 1 / 12 |
| 34 create/join party | party create/join | `modules/party` | 1 / 1 |
| 19 Tri An | loop lid 4 round done | quest loop finish | 4 / 10 |
| 17 Tru Ma | loop lid 16 | quest loop finish | 4 / 10 |
| 20 Pet training | loop lid 5 | quest loop finish | 2 / 20 |
| 3 Tu hanh | loop lid 6 | quest loop finish | 2 / 20 |
| 4 Than tu | loop lid 7 | quest loop finish | 5 (text says 1) / 10 |
| 5 Guild quest | loop lid 2 | quest loop finish | 2 / 15 |
| 13-16 "N rounds of 200-loop" | loop lid 9 at ft 50/100/150/200 | quest loop finish | 45 / 1 each |
| 1 family quest, 2 callboard (type 9), 6/7/8 NPC quests | quest types not in H5 | later | 1,1,5,5,5 |
| 26 pet duel, 27/28 farm harvest, 30/31 event kills, 9-12/36 tower/maze, 21-25/35/41 dungeons, 37 handbook, 38, 42-48 misc panels | no H5 source | defer | - |

**Port notes**: add `character_daily` `{characterId, day:'YYYY-MM-DD'(UTC+7), tasks:{[id]:n}, vitality, claimed:boolean, claimedTier, onlineSeconds}`. `ActivityEvents.record(cid, taskId)` mirrors
`AchievementEvents.record` (fire-and-forget, per-character chain); it clamps `count <= max` and adds `act` only while below the cap (fix the Go gap). Push `updateDiaryData(id, val, act)`. Online time: accumulate
in the gateway (login/logout/heartbeat) instead of the `first_login_at` approximation. Reward items: author real chest rows (3255-3259) and a box-open effect, or grant currencies directly.

### A3. Online gift and double exp - rating: **partial**

- `onStartNewGift(waitMs, {plan:{ti:29, ii, n, b}, sp:false, warnType:196})` is pushed on enterScene (`scene/login.go:67-69` -> `rewards.go:42-74`) and after every claim.
- `takeNewGift` (`rewards.go:144-182`) claims step `StepIndex` if `elapsed >= Duration`; steps hard-coded in `handler.go:42-48`:
  `(60s, item 1001 x5) (300s, 1002 x5) (900s, 2001 x1) (1800s, 2002 x1) (3600s, 2003 x1)`, all bound. **These ids are placeholders** (1001 Dich Ech Xanh, 1002 Mieng Cat Thach Tuong, 2001 Hat Giong Cay, 2002 Long Dien Huong, 2003 Sach Phi Hanh).
  Reset: lazily when the server-local date changes (`getRewardState` :17-40). State is a `sync.Map`, so **restart resets the timer** (progress not persisted).
- `takeSPGift` (`rewards.go:184-205`) always grants item 2005 x1 bound, no check, no cooldown (**exploit**); `AdminDistributeSPGift` (:76) broadcasts a special gift; not registered as RPC.
- Success: `onAddItem`, `onAddCharactorSlot`, `onBlueMsg("Nhan thuong online thanh cong!")`, then the next `onStartNewGift`. Failure: silent `nil`.
- `checkDoubleExpTime` (`awards.go:173-214`): 18:00-22:00 server-local -> push `addDoubleExpBuff({bid:1001,id:0,type:0,timeLeft,desc})`, else `endDoubleExpBuff`.
  **Cosmetic only - no code multiplies exp** (grep `doubleexp` finds only this handler and an NPC menu label).
- H5: persist `onlineGift {day, step, startedAt}` per character, author real items (or use `TBL_PLAN`), same push names. Double exp needs a hook in battle exp (M2 `battle-settle`) if wanted.

### A4. Offline exp and pet offline exp - rating: **yes**

`getOfflineExp(mode, hours)` -> number code, `getPetOfflineExp(mode, hours)` (`activity/handler.go:168-169`, `offline_exp.go`, service `application/activity/offline_delegation.go`).
Available seconds: `login payload offlineTime = now - LastActive` (`auth/login_helpers.go:19-24`, `login_payload.go:392`), kept on the connection (`SetOfflineSeconds`) and decremented per claim; if 0 it recomputes from `LastActive` (`:208-232`).
Rules (`offline_delegation.go`): level >= 30 (`:89,:143`, else code -2). `seconds = min(round(hours*3600), available)`; `hours = seconds/3600`; remaining = available - seconds, written back as `LastActive = now - remaining`.
- Character exp/hour = `BASIC_GET_EXP[level]` x `[0.3, 1, 2, 3][mode]` (`:235-249`); costs: mode0 free; mode1 `ceil(BASIC_GET_MONEY[level]*0.2*hours)` silver (selected silver type, bound first by `SelectedMoneyType`; else code -3);
  mode2 `ceil(10*hours)` gold, mode3 `ceil(20*hours)` gold (goldBind/gold by `SelectedGoldType`, code -4) (`:265-297`).
- Pet exp/hour = `BASIC_GET_EXP[pet.level]` x `[2,3,5][mode]` (`:251-262`); cost gold `ceil([10,20,40][mode]*hours)` (`:299`). Needs following pet that is bound (-8), no pet (-5), `pet.level > char.level+5` (-6), max pet level (-9).
- Reply code: 1 for character, 2 for pet, negatives above; on success push `onUPP{expSkill}` (+ `onPlayerLevelUp` + `lvUp` on level-up) / `onAddMoney` + `onUPP{currency}` + `onUpdatePet(exp/level)` + `onRefreshPetProp`.
- Tables: `BASIC_GET_EXP`/`BASIC_GET_MONEY` (161 entries, level 0..160) copied from the Flash `GamePredef`: `application/activity/offline_tables.go` and `gamedata/predef/quest_reward.go:13-56` (same numbers; reuse for loop rewards too).
- H5: `Character.lastActive` already exists (`character.schema.ts:141`); the cap on offline time is **absent in Go** (consider a cap, e.g. 24 h, **design choice**).

### A5. Festivals (`TBL_FEAST`) and gifts - rating: **partial / no**

- `getCurrentFeast` returns `{id:0, enable:0}` always (`onboarding.go:26-37`). `takeFeastGift` has **no handler**. Client logic (`GameIntroPanel.as:3886-3916, 6625-7250`):
  response `{id, enable, data?}`; if `enable == 1` the slot shows item `aw` and the claim button enables; claim `takeFeastGift` replies truthy.
- Data `data_tbl_feast` 32 rows: `id, na (name), inf (text), aw (**item template id** of a gift bag: 192 "Tui Qua Nam Moi", 193 Tru Tich, 196 Nguyen Tieu, 724 Tien Hoa, 1177, 1313 ...), at (schedule)`.
  `at` = `"h1-h2|wd1-wd2|d1-d2|m1-m2"` (hours | weekday range 0-6 | day-of-month range | month range, months 0-based: `"0-23|0-6|1-1|0-0"` = 1 Jan all day). Parsing order is my reading of the samples; **unverified** vs the Flash `FeastUtil`. Lunar festivals are stored as fixed solar dates (Tet 28-29 of month 0..1 etc.), so they are approximate.
- Port: `getCurrentFeast` = find the row whose `at` matches `vnNow()`; `enable = !claimedToday`; `takeFeastGift` grants `aw` x1 bound and stores `feastClaimed:{id,day}`. Needs box-open for 550 items or direct reward rows.
- Gifts: `searchGameGift` returns a **JSON string of two fake gifts** (`awards.go:118-145`), `getGameGift(obj)` is missing, `giftcode_*` tables (migration `20260329103000_add_giftcode_schema.sql`) are used by the dashboard only (no redeem RPC in client or Go). **Gift codes: do not port.**
- `getTodayAward` -> `{dailyAward:0, dailyDisc:0, contiLoginDay:[1,0]}` mock; `getLoginAward`, `getConsume`, `getShopAward`, `getPointAward`, `getConsumeAward*`, `getStageConsumeAwardList` are mocks or missing (`awards.go`). Consume/recharge events: **no data tables exist** (not portable without design).

### A6. Tutorial (`TBL_GUIDE`, `saveGuideLog`) - rating: **yes**

`saveGuideLog(guideId)` (`auth/handler.go:253`, `auth/misc.go:150-171`) -> `characters.GuideLog[guideId] = true` (`application/character/service.go:266-282`), sent at login as `cData.guideFlag` JSON map `{"<id>": true}` (`login_cdata_blobs.go:114`, `character.go:789-800`). No server validation; no rewards.
Data `data_tbl_guide` (46 rows): `id, type/finish_type, level, find_npc_id, prompt_text, sc_npcid, sc_pid, ...` is **client-driven** (the SWF reads the table). H5: persist a `guideLog: Record<string, boolean>` on the character and echo it in the login payload; trivial.

---

## B. VIP / PM rights

### B1. Entry points and state

`initPmData`, `buyPm`, `doPmOperation` (`activity/handler.go:147,150,151`; `panel.go:64,126`; `pm_operation.go:37`). State on `player.characters`: `vip_type` (1-3), `vip_expires_at`, `pm_exp`, `pm_process_data` JSON, `pm_findback` bool; mirrored to `accounts.vip_level` (`application/activity/service.go:161-178`).
Pushes in login: `cData.vipInfo` JSON `{pmExp, activeTime, activeType, keepDay}` (`vip_login.go`), `pmLevel` in scene/chat/group payloads (`scene/service.go:354`, `chat/say.go:62`, ...), and at login `addOrMinusPmExp({type, pnt, pmLevel, nExp})` + `updateScenePmLevel({cid, pmLevel})` when daily exp lands (`auth/premium.go:46-90`, called `auth/login.go:116,147`).

### B2. Rules

1. Packages (`service.go:23-27`, `pmPackageDuration` :224): type 1 = **688 gold / 30 days**, type 2 = **1688 / 90 days**, type 3 = **2888 / 180 days**. Cost from `Gold` only.
2. `BuyPM` (:87-137): normalise expiry first; **reject downgrade while active** (`activeType < current VIPType`); renewal extends from the current expiry; `PMExp = max(PMExp + cost, PMExpThreshold[type])` (`pmExpAfterPackagePurchase` :235).
3. PM level (`domain/character/character.go:1606-1655`): thresholds `[0, 15000, 45000, 105000, 205000, 355000, 555000, 805000, 1105000]`; `level = max(levelFromPmExp, vipType)` clamped 1-9, **0 when expired**. Expiry clears `vip_type/expiry` (`NormalizeVIP` :1664) but keeps `pm_exp`.
4. Daily login PM exp (`pm_exp.go:14-81`): active VIP only, `+500/+1000/+2000` for type 1/2/3, once per day (marker `PMProcessData.dailyLoginPmExp.day = "month0|day|weekday"`).
5. `doPmOperation(index)` (`pm_operation.go:37-120`): right must exist, VIP active, `vip<level>` flag > 0, `type` in {2, 4} (else "claim limit" message). **Dry-run first, then reward, then persist** (consume-after-credit: the reward is applied before the counter is saved, `:85-106`; a crash between them double-pays).
6. Counting (`operation.go:48-205`): `count_config "cycle|window|max"`: cycle 1 = daily (day key `"month0|day|weekday"`), cycle 2 + window 7 = ISO week (Monday date), cycle 2 + window 30 = **calendar month** key (`"month0"`), else elapsed days `< window`. `time` = claims this cycle, error `AlreadyClaimed` when `time >= max`. Progress map `{day, type, time}` is returned as `flushProcesFlag`.
7. Reward mapping (`applyPMOperationReward` :137-263, only these exist):
   - right 1 (daily exp): `ExperienceForLevel(level+1) * value[pmLevel]` exp (value1..9 = 2,3,3,5,5,7,7,9,9) - that is 2-9 *levels'* worth of exp per day, probably not the original intent (**questionable**, see open questions).
   - right 2 (daily coupons): `GoldBind += value[pmLevel]` (10,15,20,20,25,25,30,35,40), key `goldBind` (the memory doc says moneyBind; code `pmOperationCouponKey = "goldBind"` :31 wins). Pushes `onAddMoney(cid,"goldBind",delta,total)`, `onUPP{goldBind}`.
   - right 3 (daily buff): permanent buff template by level `2504..2510, 3308, 3309` (`pmDailyBuffTemplate` :445), source `pm_daily`, pushes `upLongBuff` + `onUPP`. Text: +4..12% attack/defence/HP (`value1..9` = 4,4,6,6,8,8,10,10,12). Never expires/refreshes daily in code (re-add refreshes only).
   - right 7 (auto-dungeon book): item 3630 x `value[pmLevel]` bound (vip4+: 1..6).
   - right 10 (monthly VIP bag): item `3231 + min(level,7)` bound x1 (names: 3232 "Tui Qua VIP (1 Sao)" .. 3238 (7 Sao); 3231 itself is a potion, **off by one in code for level 1? level 1 -> 3232**).
   - right 13 (daily transform): daily pick from `TBL_CREATURE.show_able=1` distinct `res_code` sorted, `seed = year*1000 + yearDay + cid`, stored `pm13Transform {resCode, expiresAt = next midnight}`, push `onSetRes({id,res})` + scene broadcast.
   - rights 24 (findback, type 4): see 8.
   - everything else (type 2 rights 1x..): `onSystemSay("Phan thuong VIP nay hien chua ho tro")`, nothing persisted.
8. Findback (`pm_findback.go`): when right 24 is enabled for the level, a per-day audit of eligible daily type-2 rights is kept; on a new day, if any tracked right was not fully claimed yesterday, `pm_findback = true` once per day; a type-4 claim (`pmFindbackRightEnabledForLevel`) consumes it. Grants nothing in Go beyond the `flushProcesFlag` (the type 4 reward is not mapped - `applyPMOperationReward` returns nil, the **flag is simply consumed**).
9. `initPmData` response (`panel.go:191-204`): `{data:{pmExp, activeType, keepDay (float days), activeTime(ms)}, date, flag: pmLevel, processFlag (numeric keys only), findback}`; also pushes `onInitPmData`. `buyPm` pushes `onBuyPm` + `onAddPm` + `onAddMoney("gold", -cost, total)` + `onUPP{gold}` + `updateScenePmLevel` (`panel.go:175-186`). Failure: `onRedMsg("Mua that bai: <err>")`, nil.
10. Rate limit `doPmOperation` 1000 ms (`infrastructure/rtmp/dispatcher.go`).
11. Messages: expired/unknown `"Hom qua da nhan hoac qua han nhan"`, limit `"Ban da nhan thuong, vui long quay lai sau!"`, no bag `"Tui do da day hoac phan thuong khong kha dung"` (`pm_operation.go:24-29`).

### B3. How `pmLevel` affects other systems

Server-enforced: only VIP-shop access/discount (`application/shop/vip.go:239`, `vip_buy.go:38`), the PM claim rights above, and display fields (`pmLevel` in scene, chat, whisper, group payloads).
All 35 rights in `data_tbl_pm_right` are **client-evaluated gates** (the Flash reads `TBL_PM_RIGHT` + `pmLevel`); Go reads `GetPmRight` only in `pm_operation.go`/`pm_findback.go`. Rights with numeric tuning but no Go effect: 4 group exp, 5 extra bag slots (6..48), 6 pet fusion rate (+1..7%), 8/9 fusion rates, 20 card extra draws (15..55), 28 craft slots (+5..40), 29/31/34 daily counters (+0..3), 30 card points. H5 can ignore all of these until the owning feature exists; pass `pmLevel` in player/scene payloads.
Table columns: `id, type (1 panel text, 2 daily claim, 3 passive, 4 findback), count_config, desc/desc2 (text with {num}), sort_index, value1..9 (per PM level), vip1..9 (0/1 enabled)`.

### B4. VIP shop (3 RPCs) - decision

Go-invented economy on shop 99 ("Diamond shop", 71 slots, `data_tbl_shop_slot` sid=99 `st != 5`): shared 6-slot rotation every 4 h (FNV-seeded Fisher-Yates), per-level discount `[0,2,4,8,12,18,25,33,42,50]%`, personal refresh budget (1 free + 4 x 20 gold per day), gold-only purchases (`vip-shop.md`, previous research R21 in `2026-11-04_10_ECONOMY_SERVER_RESEARCH.md`). The slot rows carry `r` (357/167...) that Go ignores; likely the original weight.
**Recommendation: port after PM**, simplified: 6 slots per 4-hour UTC+7 bucket chosen deterministically by `r` weights (seeded by bucket epoch), per-level discount table as data, one personal refresh/day free then 20 gold, gold-only. It is a pure H5 design (no legacy ground truth); do not copy the pg schema, use a `vip_shop_state` collection `{characterId, epoch, slotIds, purchased[], refreshDay, refreshCount}`. Low priority.

### B5. TS port notes (`server/src/modules/activity/vip.service.ts`)

```ts
const PKG = {1:{gold:688,days:30},2:{gold:1688,days:90},3:{gold:2888,days:180}};
const PM_EXP = [0,15000,45000,105000,205000,355000,555000,805000,1105000];
pmLevel(c, now) { if (!c.vip?.type || c.vip.expiresAt <= now) return 0;
  const byExp = Math.max(1, PM_EXP.reduce((l,t,i)=> c.vip.pmExp >= t ? i+1 : l, 0));
  return Math.min(9, Math.max(byExp, c.vip.type)); }
async buy(cid, type) { // spend first (conditional $inc gold >= cost), then write vip
  if (active && type < cur.type) throw invalid; spendGold(cid, cost);
  base = active ? exp : now; exp2 = base + days; pmExp = max(pmExp + cost, PM_EXP[type-1]); }
async claim(cid, right) { const r = rights.get(right); gate(active, r['vip'+lv]>0, [2,4].includes(r.type));
  const [cycle, win, max] = parseCountConfig(r.count_config);
  // IMPORTANT (differs from Go): mark progress with a conditional update FIRST, then pay, to avoid double pay.
}
```

Rights worth implementing first: 2 (goldBind), 3 (buff via existing buff service), 10 (VIP bag), 7 (book, needs auto-dungeon), 1 (exp, fix the multiplier). Place `vip` data on `character_vip` (own collection) to keep `character` lean.

---

## C. Bosses and events

### C1. Daily boss ("So Tay Ma Thu", `BOSS_DAILY` activity id 49) - rating: **partial**

Entry: `bossDailyGetData`, `bossDailyBattle(bossId)`, `bossDailyFinishByCard(bossId)` (`activity/handler.go:143-145`, `boss_daily.go`; service `application/activity/boss_daily_service.go`).
Rules:
1. Cycle key `"month0|day|weekday"` (`BossDailyCycleDay`, `domain/activity/boss_daily.go:106`); reset on first access of a new day clears `n`, `dfd`, and zeroes per-boss `n` (keeps `t`) (`boss_daily.go:30-48`).
2. `total = 16` is **sent but never enforced**; `UsedCount` just increments (`boss_daily_service.go:173`). Real limits are per boss.
3. Config `BossDailyConfigs` (`domain/activity/boss_config.go:21-70`, 79 ids from the client constants): type 1 = N attempts/day (`Num` 2 or 4; 39 + 23 normal, 11+1 "super" with Num 2, 2567 Num 4); type 2 (2265-2268 super) = cooldown `Step` 259 200 000 ms (**72 h** since last fight); `WildList` (11 ids) are wild bosses. `S`, `X`, `Y`, `Award` columns are carried but unused server-side.
4. `ValidateBossDailyBattle` (:104-185): unknown boss -> invalid; type 1 `n >= Num` -> "no attempts remaining"; type 2 `last + Step > now` -> "cooldown not expired"; success increments counters, sets `dfd[boss] = bossId`. **State is committed after the battle started** (`boss_daily.go:106`): counts are consumed on start, win or lose.
5. `BossDailyBattle` (`boss_daily.go:54-148`): enemy list from `data_tbl_npc_creature` rows with `nid = bossId` (one `boss_flag=1` main + `boss_flag=2` minions, each with `cid, level, exp, exp_multi`; level preserved for boss flags), creature stats via `CalculateCreatureStats`; `StartPVEBattleWithMultipleEnemies(char, 0, channel, enemies, playerInFront)`. `battle.BossCtx{BossNID, Source:"daily", Tier}` is set when a `schedule_boss.daily_boss_id` mapping exists (drives `data_tbl_boss_loot`).
6. `BossDailyFinishByCard` only validates that `dfd[bossId]` is set and returns `{result:0}` (`boss_daily_service.go:204-238`): **no card item consumed, no reward** (the "finish by card" reward/skip is unimplemented).
7. Rewards = normal battle settlement: `exp` from the `npc_creature` row (e.g. boss 2204 minions exp 1200, lv 5; 2262 exp 22 800 lv 95; 2265 exp 37 200 lv 155), creature_loot, `boss_loot` (**empty table**), battle quest hooks.

Push sequence `bossDailyGetData`: reply payload + push `onOpenBossDailyPanel(payload)` `{total, t, data:{d, n, now, dfd, data:{<boss>:{n|t}}}}`. `bossDailyBattle`: battle created -> optional `onUpdatePet(petId,"currentHp",...)` -> `onSetCharState({cid, state:5})` -> `onBattleStart({battleFieldId, cList, guest:false, sneakFlag:0, bossFlag:false, airBattle:false})`. Errors: RpcException (client sees failure), no `onRedMsg`.
H5: `BattleManager` already supports a PVE battle with arbitrary NPC groups (M2); add `source:'daily'` to the battle context for loot/settle. State -> `character_boss_daily` `{characterId, day, used, perBoss:{id:{n,t}}, done:{id:id}}`. Reward design: none needed beyond exp; **enforce total 16** (decision).

### C2. Schedule/world boss, boss loot - rating: **partial / no data**

- `data_tbl_schedule_boss` (150 rows, columns `nid,name,map_id,level,kind (ground|flying|daily_only),tier (normal|mythic|special),channel_scope,description`): 48 ground (35 normal "Cac kenh" + 13 mythic "Kenh 1"), 23 flying, 79 daily_only. **Not in Mongo** (importer regex is case-sensitive; seed uses lowercase `insert into`) - fix the importer (`/INSERT INTO/gi`) and re-run.
- Cooldown `Cooldown(level, kind)` (`domain/scheduleboss/cooldown.go:9-19`): ground `8h + floor(level/30)*30min`, flying `4h + floor(level/10)*30min`. Scheduler tick 30 s fetches due rows, marks alive, broadcasts `onBossOn` to `(channel, map)`; kill hook marks dead and sets `next_spawn_at` (`schedule-boss.md`). Only `tier='normal'` respawns; per channel state `(nid, channel_id)`.
- H5 has no `onBossOn`/`onBossOff` handling and no channel concept (grep): defer, or single-channel in-memory spawner with Mongo `next_spawn_at` for restart safety. Needs client work on map NPC add/remove.
- `data_tbl_boss_loot`: schema in `boss-loot.md` (rate on 0-50000 scale, `qty_min/max`, `type` 30 currency / 31 exp / 35 wallet, `tier_filter`, `source_filter`, `qid`); **no seed rows in the repo** (`ls supabase/seeds` has no boss_loot). Nothing to port; drops fall back to `creature_loot`.
- Nine boss (`getNineBossRankByClient`, `awards`/`progress.go:40-98`), guild-war rank (`:100-121`): fake data. Activity id 13 "Kiep nan vo uu" is `enable:true` in `data_tbl_activity` with flag 130 but no gameplay.

### C3. Quiz, maze, events - rating: **no**

`data_tbl_answer` 3627 rows `{id, t (question), a,b,c,d, r (correct letter)}`, `data_tbl_maze` 15 `{name, description, rate, min, max, result_script}`, `data_tbl_mevent_type` 19 + `data_tbl_mevent_map` 103 (event positions `pos "x,y,type"`): Go has **models only** (`gamedata/models/{answer,maze,mevent_*}.go`) and no RPC. Activities 16 "Do vui co thuong" (type 3 state label), 27 "Me tran" exist in `data_tbl_activity`. Needs wholly new design; defer.

### C4. Lotto / wish tree - rating: **yes**

`getLottoData`, `lottoByClient(type, num)` + bag RPCs (`lotto/handler.go:42-56`, `application/lotto/draw.go`). Rules: types 1-3, counts 1/5/10, gold cost `{1:{20,90,160},2:{100,450,800},3:{200,900,1600}}` (**client constants**, `draw.go:46-50`); free: type 1 x1, 5 per day (`freeWishDailyMax`, server-local date); pool = `data_tbl_plan` rows with `t == type` (counts t1 154, t2 6375, t3 15 922, t4 2974) weighted by float `r`; each draw appends `{ti, ii, n, q, b}` to a holding bag (cap 500, state JSON), claimed with the generic get/getAll/throw/sort RPCs; spend gold first (`char.Gold`), then save bag. `getLottoData` returns `{lottoAward: [first 18 plan ids per type 1..4], highestAwardArr: []}`. `data_tbl_activity` 21/23 (`BtnLotteryAct`, `BtnLuckDrawAct`) are `enable:false`, so the entry is not on the bar by default. H5: `character_lotto` collection `{bag[], freeDay, freeN}`; reuse the inventory add-item path for claims.

### C5. Prabuff ("Ma Phap Bi Tran", magic array) - rating: **yes / partial**

`getMagicArrayData(praType)` -> `{praType, buff, exp, goldNum, elementNum}`, `addPracticeExp(praType, isGold)` -> push `updatePraView` (`prabuff/handler.go:31-33`, service `application/prabuff/service.go`, tables `tables.go`). 8 tracks, 30 levels: cumulative `levelExp[30]` (253, 753, ... 97 364) and per-action `addExp[30]` (1..17) copied from the Flash constants; crit 10% x2 exp (**invented**); cost 10 `elementPnt` (tracks 1-4) or `yijieElement`/7 gold (tracks 5-8) (client display values, **unverified**). Persisted as feature `pra_buff` JSON; stat effect of tracks 1,3,5,7 flows through the stat provider (progression research). H5 needs currencies `elementPnt`, `yijieElement` (check `Currencies`), a stat provider, and the `updatePraView` push.

### C6. Mount - rating: **yes**

`getMountList`, `checkHaveMount`, `addMountExp(mode)`, `addMountUpExp`, `renewMount(dressId)`, `beginMounting`/`stopMounting` (`mount/handler.go:38-42`, `mount/dress.go:141-170`; `beginMounting` routes to mount-dress when owned else falls back to the pet ride handler - the only registration, no collision).
Rules (`application/mount/progress.go`): feed item 3804 ("Duoc Thuy Nuoi Duong"), mode 1 = 1 item, else 10; each item gives 1-3 exp, 5% chance 10; level from `TBL_MOUNT` type 1 cumulative `exp` thresholds, capped by `mount_lev_limit` of the current `upLv` row; evolve item 3805 (`>= upLv 8`: 6273) x `item_num` (type 2 row), success = `row.exp + addRate` percent, on failure `addRate += row.add_rate`. State JSON `{lv, upLv, exp, addRate, dressData, useDress, getDate}`; templates `data_tbl_mount` 33 rows (type 1 levels, type 2 evolutions with `life_per/phy_attack_per...`), `data_tbl_mount_dress` 18 (`effective_time`, `gold`, `res_code`, `icon_code`, `*_per` stat percents). Pushes: `onAddMountExp({addExp, exp, lev | upLv, addRate})`, `onUpdateDressList(action, id, expiryMs)`, `onMountOn/onMountOff` scene broadcast. Mount stats feed the stat provider (progression research). Dependencies: item consume (M1), stat provider (M7), scene broadcast; `res_code` swap needs client renderer support for ride sprites (client research).

---

## D. Loop quests and life/social systems

### D1. Loop quests (`TBL_QUEST_LOOP`, type 7) - rating: **yes** (priority)

**Entry points** (`quest/handler.go`, `handlers/quest/loop.go`, service `application/quest/loop_service.go`, `loop_completion.go`): `takeLoop(lid, npcId)` -> push `onTakeLoop`; `cancelLoop(lid)` -> push `onCancelLoopQuest`; `loopRepaire(lid)` -> push `onAddChaQuest`; plus `getLoopQuestStartTime` (push `onGetLoopQuestStartTime {"51": today 00:00 ms}`), `initQuestManager` field `l`, and `npcFuncInit.loopInfo`. All three are fire-and-forget: the client sends no responder and every path pushes (even failures).
H5 stubs to replace: `server/src/modules/npc/npc.service.ts:31` (`loopInfo: {d:null, flag:false}`), `quest.rpc.ts:88-93` (`initQuestManager` has no `l`), `quest.rules.ts:10` (`SUPPORTED_QUEST_TYPES` excludes `QuestType.LOOP = 7`, protocol.ts:277).

**Data** (`data_tbl_quest_loop`, 11 rows): `id (lid), name, nid (hosting NPC), num (rounds per cycle), refresh (cooldown seconds), min_level, max_level, team (0 solo, 1 group-or-solo, 2 couple), script_get, script_give_up, info`.

| lid | name | nid (map) | rounds | refresh | levels | team | pool (`sub_type "7-<pool>"`) | enabled |
|---|---|---|---|---|---|---|---|---|
| 2 | Bang Hoi | 1069 (map 49) | 15 | 600 s | 30-160 | 0 (needs guild) | 7-2: 275 | yes |
| 4 | Tri An | 277 (map 9) | 10 | 600 | 30-160 | 0 | 7-4: 2 | yes |
| 5 | Ren Luyen Pet | 280 (map 9) | 20 | 600 | 50-160 | 0 | 7-5: 123 | yes |
| 6 | Tu Luyen | 434 (map 4) | 20 | 600 | 70-160 | 1 | 7-6: 6 | yes |
| 7 | Than Tu | 929 (map 30) | 10 | 600 | 50-160 | 1 | 7-7: 17 | yes |
| 9 | 200 Vong | 48 (map 30) | 200 | 259 200 (72 h) | 70-160 | 0 | 7-9: 924 | yes |
| 16 | Tru Ma | 3 (map 9) | 10 | 600 | 50-160 | 1 | 7-16: 3 | yes |
| 1, 3, 8, 10 | 60 Vong, Le Tinh Nhan, Vong Hon, Halloween | - | 60/10/10/10 | - | `min_level 200` | - | 7-10: 38 (1->10), 7-3: 6, 7-8: 1 | **disabled** (`min_level=200`) |

Child quests: 1,395 rows in `data_tbl_quest` with `type=7`, `start_npc=-1`, `finish_npc` = the hosting/turn-in NPC, `min_level/max_level` per round, `is_rebirth`, `req_class`. Objective mix (H5 `isSupported` rule: collect = kind 1 type 29 q<0; kill/pet = kind 2/3 type 12): **all 7-4/7-5/7-6/7-7/7-16 rounds fit; 827/924 of 7-9 and 253/275 of 7-2 fit** (the rest need equipment collect kind 1 type 19, 75+ rows in 7-9). 199 rounds of 7-9 and 39 of 7-5 have **no require rows** (they complete by talking to `finish_npc`).
Rewards: **none in data** (0/1,395 with exp, money or award rows). Go pays nothing per round; the client text promises exp/silver/guild points/chests (`script_get`/`script_give_up` are server scripts that were never ported; only lid 2/3/10 `script_get` holds JS pool-pick weights `getRandomIdx([20,40,0,40])` over sub-pools `"9-5-1".."9-5-4"` that do **not** exist as `sub_type` values here - Go replaces them with a uniform pick).

**Rules (Go)**:
1. `CanTakeLoop` (`loop_service.go:68-117`): loop exists; `min_level <= level <= max_level` (checks `>0`); lid 2 requires guild membership; no active instance for this lid; if an inactive row exists, `now >= take_date_ms + refresh*1000`. The cooldown anchor is **take time, not finish time**; `cancel` and cycle completion both keep it (`domain/quest/loop.go:46-48`). With refresh 600 s a full 10-round cycle usually exceeds the cooldown, so players can immediately retake; text says "wait until next day" for lids 2/4/5/6/16 (Go follows `refresh`, not the text).
2. `TakeLoop` (:120-147): pick a round, insert state `{active:true, ft:0, take_date_ms:now, active_quest_id}`, grant progress (`grantLoopChild` `loop_completion.go:107-129` deletes a stale row first). No silver/vigor cost is charged (the text says 5 vigor + silver for lid 1/9, cut as scope).
3. `pickNextChild` (`loop_completion.go:24-86`): candidates = type-7 quests of pool `lid` (`loopChildPool`: lid 1 -> pool 10, else pool == lid), filtered by level (`is_rebirth > 0` uses rebirth level), prefer "fightable" rounds (every kill creature has a `TBL_MAP_CREATURE` spawn), exclude the previous round when >= 2 remain, **uniform random** pick. No weights, no team logic.
4. `completeLoopChildQuest` (:131-230, called from `CompleteQuest` via `IsLoopChild`, `service.go:654`): requires the active state whose `active_quest_id == questId`; syncs/consumes collect items; applies rewards (empty); **deletes the progress row, never writes `quest_history`**; `ft += 1`; if `ft < num` pick next round (exclude current), save state, grant; if no round available deactivate early; if `ft == num` deactivate (cycle done, cooldown from take date). Result carries `rewards.loop = {id, ft}`, `loopNextQuest`, `loopNpcIDs` (loop nid + finish NPCs).
5. `CancelLoop` (:150-190): must have active state; deletes the active round progress, deactivates (keeps `take_date_ms`). Pushes `onCancelQuest {flag:true, qid:"<id>", qn}` + `onCancelLoopQuest {flag:true, id}` (+ `onBossOff` for paired boss rounds).
6. `RepairLoop` (:213-249): recreates the active round progress when missing, then pushes it again.
7. `GetLoopInfoForNpc` (:251-267): for NPCs hosting loops: `{flag:true, d:{"<lid>":{canTake}}}` (client reads only `canTake`).
8. Daily quests (type 6, 810 rows) are a separate re-take rule: completion writes `quest_history`, "completed" is derived from the history with a same-day cutoff, so type 6 retakes after local midnight (`application/quest/daily_quest.go`, `quest-loop-system.md`). Not part of loops; cheap to add after loops.
9. Type-1 (newbie) quests cannot be abandoned (`AbandonQuest`); `CancelQuest` pushes `onCancelQuest {flag:false,...}` on failure (already ported in H5? **unverified**).

**Trị An / Trừ Ma boss summon** (`application/quest/loop_boss.go:25-90`, `handlers/quest/loop_boss.go`): all 5 kill rounds target `createBoss`-only creatures; pairing table
`4671 -> npc 1143 item 2263 ("Lenh Truy Bat")`, `7667 -> npc 2167 item 4843 ("Mat Lenh Hai Tac")` (item-summon: round start grants the order item; using it registers an in-memory summon at `x+80,y` and pushes `onBossOn`; item never consumed, so reuse recovers after restart),
`7668 -> npc 1173 maps 10/38/31`, `7669 -> npc 2169 map 27`, `7670 -> npc 2168 map 27` (map-presence: boss appears while the round is active on those maps; sent via `createBoss` reply + immediate `onBossOn`). Teardown on finish/cancel: `onBossOff(npcId)` and delete the order item (`onDelCharactorSlot`). The matcher falls back to `LoopBossNpcQuest(npcId)` because the boss NPC rows have `sub_type='all'`. **H5 fit: partial** - needs `onBossOn/onBossOff` + createBoss reply in H5 scene (not present) and the NPC-click-to-battle bridge for non-quest NPCs; start with lids 5/6/7/9/2 (kill/collect rounds) and skip lid 4/16 boss rounds (filter `pickNextChild` to exclude the five quest ids until world-boss display exists).

**Push sequences**:
- `takeLoop` ok: `onTakeLoop {flag:true, d:{id, qid:id, takeDate, ft, finished:0}}` -> `onAddChaQuest(round)` -> (item grant pushes for start items) -> (`onBossOn` for map-mode rounds) -> `onSetNpcState` for [client npc, loop nid, finish npc]. Fail: `onTakeLoop {flag:false}`.
- finish round (`handlers/quest/lifecycle.go:332-345`): normal finish pushes (consumed items, money, exp...) -> `onFinishLoopQuest {id, ft}` -> `onBossOff` (if paired) -> `onAddChaQuest(next)` + start items + `onBossOn` -> `onSetNpcState` for `loopNpcIDs` -> `onUpdateAchieve` -> `onUpdateSafeBattleMid` -> reply `{flag:true, qid, qn}`.
- `cancelLoop`: see rule 5. `initQuestManager`: add `l: {"<lid>": {id, qid, takeDate, ft, finished:0}}` for active states only (rounds ride in `q`).

**State -> Mongo** (`character_quest_loops`): `{characterId, loopId, ft, takeDateMs, active, activeQuestId, updatedAt}`, unique `(characterId, loopId)`. Rounds reuse `character_quests` rows (delete on finish, no history).

**Reward design for H5** (nothing in data): reuse the class-quest formula already in Go (`gamedata/predef/quest_reward.go:56-71`):
`exp = round(BASIC_GET_EXP[level] * K[ft % 10] * 10 / 31.5)`, `money = round(BASIC_GET_MONEY[level] * K[ft % 10] * 3 / 31.5)` with `K = [0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4,1.5]` (levels 0..160 tables in `quest_reward.go:13-54`; H5 `LEVEL_EXP` only has 21 levels, so port the tables to `packages/shared`). Money type: silver (`moneyBind` for lids 2/5/6/7?). Final-round extras (rounds 5/10/15 chest for lid 2, round-3 crystal for lid 4, 200-loop milestones) are text-only in the info column: **author or skip**. Diary points ride on `ft` (A2).

**TS pseudocode** (`server/src/modules/quest/loop.service.ts`, pure parts in `loop.rules.ts`):

```ts
canTake(char, loop, state?, guildId?) {
  if (loop.minLevel > 0 && char.level < loop.minLevel) return false;
  if (loop.maxLevel > 0 && char.level > loop.maxLevel) return false;
  if (loop.id === 2 && !guildId) return false;
  if (state?.active) return false;
  if (state && Date.now() < state.takeDateMs + loop.refresh * 1000) return false;
  return true;
}
async take(cid, lid) { // create state first (unique index) then grant the round; compensate on grant failure
  const round = pickRound(pool(lid), char, prevQid);          // uniform, level filter, supported-objectives filter
  state = upsert({ cid, lid, ft: 0, takeDateMs: now, active: true, activeQuestId: round.id });
  progress = grantRound(cid, round.id);                        // delete stale row first
  push('onTakeLoop', { flag: true, d: dto(state) }); push('onAddChaQuest', progress); npcStates(...);
}
async finishRound(cid, qid) {                                  // inside quest.finishQuest when type === 7
  const st = activeState(cid, qid); requireObjectivesDone(); consumeCollect();
  reward = loopReward(char.level, st.ft); credit(reward);
  deleteProgress(cid, qid); // no quest_history
  const ft = st.ft + 1;
  if (ft < loop.num) { next = pickRound(...exclude qid); st.ft = ft; st.activeQuestId = next.id; grant(next); }
  else { st.active = false; st.activeQuestId = null; }
  push('onFinishLoopQuest', { id: lid, ft }); if (next) push('onAddChaQuest', next);
  diary.record(cid, DIARY_BY_LOOP[lid], 1); if (lid === 9 && [50,100,150,200].includes(ft)) diary.record(cid, 12 + ft / 50, 1);
}
```

Needed first in H5: loops data accessors (`data_tbl_quest_loop`, children by `sub_type`), extend `isSupported` to allow type 7 (and zero-require rounds), `finishQuest` branch, `initQuestManager.l`, NPC `loopInfo`, and the client loop UI (client research). Load: the pools are indexed once at startup like `questsByStartNpc`.

### D2. Marriage - rating: **partial / defer**

6 RPCs (`marriage/handler.go:25-30`): `initMarriage` -> `{seekingList, charMarriageList}`, `marriageSeeking(introduce, flag)`, `marriageRequest(targetId, name, introduce)`, `marriageReqFeedback(requestId, 1 accept | 2 reject)`, `cancelMarriageSekInfo`, `getCoupleRank(page)` (page size 20). Rules (`application/marriage/service.go:66-206`): no level, gender, ring or cost gate (`RingType` fixed 1, intimacy 0); cannot be already married (`ensureNotMarried`); self-request invalid; duplicate pending request is a silent no-op; only the target may respond; accept creates `player.marriages` (unique partners, audit log row) and deletes both seeking entries; reject marks `Flag=2`. Seeking/requests live in a Redis-backed store (`s.store`). **No divorce, no wedding hall (`bookWeddingHall`/`cancelWeddingHall` missing), no effects on stats/chat/titles.** H5: could be built on Mongo in a day, but gives no gameplay; defer (also needs `TBL_RANK`-like couple ranking).

### D3. Farm and magic estate - rating: **partial / defer**

Two systems. (a) NPC farm plots on maps 57/58 (`handlers/npc/farm.go`, `application/farm/service.go`): plant crop NPC (seed item, 25 vigor, one active plot per character, crop level gate from life-skill Trong Tro level via `TBL_SKILL` type 15, `plantDex`), checkpoints `onNpcOn` -> `onNpcReload` at 1/3 grow time -> ripe at `ReadyAt` -> wither at `ReadyAt + 2/3*grow`; harvest +20 `plantDex`. (b) Magic estate "Nong Truong Phap Thuat" (`farm/magic_estate.go`, 775 lines; 15 RPCs `getFarmByCid`, `getFriendFarm`, `addMineral`, `addFarmNum`, `farmLvUp`, `harvestMine`, `steelMine`, farm bag, log, replays): level table `{exp 60/240/640/1920/1921 -> max 4/6/8/12/16 slots}`, slot-count purchase costs up to ~2.6 M MoneyBind, minerals `data_tbl_mineral_template` (10 rows `{name, num, time (min), money, act_pnt, res_code1/2}`), friend stealing via the social module. Needs life-skill system (absent in H5) and friend/scene pushes. Defer; feed diary 27/28 later.

### D4. Dress / fashion and runes - rating: **partial / defer**

`activity` of M8 in Go (`handlers/dress/handler.go:68-86`, `application/dress/*`): dress panel gacha: free extract once/day, gold extract 30 / x10 288 gold, fashion-point (ssd) 300 / 2880, material prices crystal 1 gold, jewel 5 gold, transform 3 recipes -> 1, chips (`TBL_RECIPE.type 1 recipe / 2 chip`), activate with crystals/jewels, receive goods (bound equipment, colour from `TBL_DRESS.color`), fake dress / fake flyer, dress-book stat bonus via the stat pipeline (`TBL_DRESS.prop1..4`), `getDecoSuitProp`, `addDecoHoleLevel` (cost DecoSilver 216, `TBL_DECO_HOLE` 204 rows). State: char `dress_info` JSON `{book, recipe, bag.crystal, bag.jewel, extract, score, fakeDressId, fakeFlyDressId, day}`. Data: `data_tbl_dress` 93, `data_tbl_recipe` 185, `data_tbl_deco_show` 20, `data_tbl_deco_hole` 204, `data_tbl_deco_rune` 1,520. H5 needs a dress panel UI plus several currencies; defer.

### D5. Life skills (cook, medicine, fish, herb, plant) - rating: **partial**

`newCook`/`newMedicine(ingredientIds, recipeSkillId, skillType)` (`item/handler.go:250-251`, `item/life_skill.go:56-130`): recipe = `TBL_SKILL` row of type `CookbookSkillType`/`MedicinebookSkillType` -> base skill 17 / 18 (`application/skill/service.go:23-26`, `life_skill.go:509`); requires the recipe learned and base life skill level >= recipe level; selected ingredients consumed first, reward items added, then `+20` mastery (`lifeSkillCraftMasteryGain`, `life_skill.go:22`) on `cookDex`/`medicineDex`; pushes consumed-slot callbacks, `onAddCharactorSlot` per product, `onUPP`/`onSkillUpdate`/`onUpdateLifeDex`. Errors via a typed callback (`sendLifeSkillCraftError`). Gathering (`handlers/npc/gathering.go`): fishing NPC type 21 (1 vigor, `onGathering {hint, delay 19500, prop:{fishDex}}`), herb NPC (30 MP per product, delay 5000), `queryFishPool/queryHerb/queryGather` return `{name, level, remain}` from NPC rows; `quitGathering` on cancel. H5 has **no life-skill system** (no skill types 15-18, no dex props): needs skill upgrade rules (`reqLevel`, `dexSkill`, `expSkill`, gold), recipe tables and client panel. Defer behind the loop quests; recipe/skill data is in `data_tbl_skill` (4,914 rows).

### D6. Pet arena (18 RPCs) and PPVE tower (6 RPCs) - rating: **no / defer**

- Pet arena (`petarena/handler.go:22-39`, `application/petarena/service.go`): Elo with `K=32`, base 1000, 10 tickets refilled 1 per 6 h, ranking per season 1, `Fight` uses `BattleSimulator` (a numeric pet-vs-pet simulation, **no replay**) and the reward table by rank (`calculateRewards` :260-289: rank<=1 100k gold/50k exp, <=10 50k/25k, <=50 20k/10k, <=100 10k/5k, else 5k/2.5k, + `rating/100 * 100` gold) - silly magnitudes, not original. Several RPCs are config stubs (`getPetArenaActivityInfo`, `getPetArenaSysMsg`, `getLastPetArenaRank`). H5 has pets + `BattleManager` (battle replay is `onBattlePlayList`); an arena needs per-pet AI configs, async defenders, replay generation. Defer.
- PPVE (Khong Gian Dieu Khac, `activity/ppve*.go`, `application/pet/ppve_service.go`): daily 3 free challenges, **floor advance = win** (no combat), max 150 floors, KP exchange `TBL_CARVE_AWARD.free_exchagne[floor]` or 25 gold -> 50 KP, challenge gold tiers [10,20,50]; `data_tbl_carve` 960 rows (costkp, pv), `data_tbl_carve_master` 48, `data_tbl_carve_award` 150. State: feature `pet_pve` JSON. Gives nothing playable. Defer (diary 12/48).

---

## 2. Persistence and restart summary (Go -> proposed H5)

| Data | Go | H5 proposal | Restart story |
|---|---|---|---|
| sign-in month ledger | PG `character_daily_signins` | `character_signins` | persistent |
| diary/vitality | PG `character_daily_act` | `character_daily` (day key UTC+7) | persistent; online seconds from session ticker |
| online gift step | memory `sync.Map` | persisted `{day, step, startedAt}` | Go loses it; persist |
| PM/VIP | char columns | `character_vip` | persistent |
| loop state | PG `character_quest_loops` | `character_quest_loops` | persistent; boss summon in memory (re-use item) |
| boss daily | char `boss_daily` JSON | `character_boss_daily` | persistent |
| schedule boss | PG `schedule_boss_state` | single-channel Mongo + in-memory timer | recompute at boot |
| lotto / prabuff / mount / ppve | feature JSON | `character_features` (M7 store, `FeatureStoreService`) | persistent |
| marriage | PG + Redis | Mongo | persistent |

Use `FeatureStoreService` (`server/src/modules/progression/feature-store.service.ts`) for small per-character blobs (lotto, mount, prabuff, boss daily) to avoid new schemas.

## 3. Recommended implementation order (new module `server/src/modules/activity/`)

1. **Activity foundation**: import `data_tbl_activity` accessor, `startedActList` in the login payload + `updateActivityList`, level gates (type 2 = level, type 3 = state label, type 0 = flag); `ActivityEvents` hook + `character_daily` (diary, vitality, online time, chest claim); guide log. (Needs the H5 HUD activity hub: client research.)
2. **Daily sign-in** (8 RPCs) + lucky tier rows for the current month + real reward rows.
3. **PM/VIP core**: `character_vip`, `initPmData`, `buyPm`, `doPmOperation` (rights 2, 3, 10, 7, 13 first), daily PM exp, `pmLevel` in player/scene payloads; **then** VIP shop (B4).
4. **Loop quests** (D1): data accessors, state, take/cancel/repair, finish branch, NPC `loopInfo`, reward formula, diary hooks; lids 2, 5, 6, 7, 9 first (skip rounds with unsupported objectives and the five boss rounds).
5. **Daily boss** (C1): reuse `BattleManager` NPC groups; enforce `total 16`.
6. **Online gift + offline exp + festival**, then **lotto**, **prabuff**, **mount** (each self-contained).
7. Fix importer for `data_tbl_schedule_boss`; schedule boss only with world-boss display.

**Defer list**: gift codes (no client RPC, dashboard-only tables); nine boss, consume/recharge/point events, guild-war rank (mock data only, no tables); quiz/maze (data only, no Go logic, new design); marriage (no effects); pet arena + PPVE (no real combat, huge client surface); dress gacha + deco rune/hole (several currencies + panel); farm/magic estate + gathering + cook/medicine (need a life-skill system that does not exist in H5); boss loot (no data); world-boss respawn (needs `onBossOn`, channels).

## 4. Unverified / open questions

1. Original loop rewards and milestone chests (info text promises them; script_get/script_give_up JS not in the repo): author H5 values (formula in D1) - confirm with the user.
2. Real contents of box items 3255-3259 and the sign-in day bags 4135-4138 (item `description` only; no table maps box -> contents in the data); `application/item/effect_box.go` only handles `i1/i2`. Decide: author reward rows in `docs`, or grant currencies.
3. Whether the original claimed multiple diary chests per day (the Flash client treats `ad` as a single flag, so one claim/day is the safe port).
4. PM right 1 multiplier (`ExperienceForLevel(level+1) * value`) and whether `ExperienceForLevel` is per-level or cumulative in H5 terms: Go keeps per-level exp internally (`domain/character/player_level_exp.go`), H5 stores cumulative exp (`quest.md`), so port `value * (levelExp[level+1]-levelExp[level])` only after confirming intent.
5. PM right 10 bag base (3231 is a potion; code gives 3232..3238 for levels 1..7 via `3231 + min(level,7)`, verify that level 1 -> 3232 "Tui Qua VIP (1 Sao)" is the intended).
6. Feast `at` string parser order and lunar-date handling (`data_tbl_feast`), and the real `takeFeastGift` reply shape (client only needs truthy).
7. Timezone: Go runs in `GAME_TZ` default Asia/Ho_Chi_Minh (`docker/docker-compose.yml:535`); H5 should compute all day/week/month keys in UTC+7 (the VIP shop also uses Asia/Saigon). The sign-in `LevelGate` message text and the `CloseOnKey` rule come from legacy memory, not re-read in the AS client.
8. Prabuff costs (10 element / 7 gold) and crit odds are Go-side assumptions (`prabuff/tables.go:21-31`).
9. Whether H5 `Currencies` already has `elementPnt`, `yijieElement`, `decoSilver` (216) keys (M7 `currency-rules.ts`); not re-checked.
10. `getPPVERank`/`getPetArenaRank` payloads vs H5 ranking module (M6) - not compared.
