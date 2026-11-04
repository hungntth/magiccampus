---
name: reference-go-activities-navigation
description: Go code map for M8 activities (daily/diary/signin, PM/VIP, bosses, loop quests, marriage, farm, dress, mount, arena), mock vs live handlers, shadowed registrations, data traps
metadata:
  type: reference
---

Verified 2026-11-04 (research `docs/research/2026-11-04_16_ACTIVITIES_SERVER_RESEARCH.md`).

- Most of `handlers/activity/` is mock payloads: `awards.go`, `panel.go` (getJXHDList), `onboarding.go`, `backlog_panels.go` (~40 starter stubs), `icon_panels.go`.
  Real rules only in: `dailysignin/`, `application/activity/{service,operation,pm_exp,pm_findback,offline_delegation,boss_daily_service,daily_act_service}.go`,
  `application/quest/loop_*.go`, lotto/prabuff/mount/petarena/marriage/farm/dress services.
- **Shadowing (last write wins, `cmd/gameserver/main.go`)**: activity handler (768) overrides real `stoneSealGetData` / `initPRSPanel` (605/610) with backlog
  stubs; `getTodayOnlineTime` auth stub (437) overridden by activity (768); `clickBoss` scene (451) overridden by combat (539); `stub/handler.go` registers last (807).
- Client RPCs with **no Go handler**: `takeFeastGift`, `getLoginAward`, `getGameGift`, `getConsume`, `bookWeddingHall`, `cancelWeddingHall`.
- Diary (`TBL_DIARY` 44): only task 29 (login) has a producer (`daily_act_service.go:101`). Chest claim = one per day for all tiers. `data_daily_act_award_rewards.item_id`
  2003-2007 are wrong (real chests = `icon_giid` 3255-3259). Online-gift items in `activity/handler.go:42-48` are placeholders and not persisted (memory).
- Loop quests (`TBL_QUEST_LOOP` 11 rows, type-7 quests 1,395): **zero rewards in data**; cooldown anchored at `take_date_ms + refresh*1000`; live lids 2,4,5,6,7,9,16 (others `min_level=200`).
  Rewards in Go = `applyRewards` (empty). Class-quest exp/money formula + BASIC_GET_EXP/MONEY tables in `gamedata/predef/quest_reward.go`.
- PM/VIP: pmLevel gates are client-side; server rules only for rights 1,2,3,7,10,13,24 (`pm_operation.go:137-263`); PM thresholds `character.go:1606`.
  Right 2 pays `goldBind` (not moneyBind). Reward is applied BEFORE the counter is saved (double-pay window).
- Data traps: `supabase/seeds/data_tbl_schedule_boss.sql` uses lowercase `insert into` (H5 importer regex skips it); no `data_tbl_boss_loot` seed; lucky-tier seed only May 2026;
  `data_tbl_feast.aw` = item id (gift bag), `at` = "h|wd|day|month(0-based)" ranges.
- Mock-only (no data tables): nine boss, consume/recharge events, guild-war rank, quiz (`TBL_ANSWER`), maze (`TBL_MAZE`, `TBL_MEVENT_*` are models only).
- TZ: game server `GAME_TZ=Asia/Ho_Chi_Minh` (`docker/docker-compose.yml:535`); Go day/week/month keys are server-local.
