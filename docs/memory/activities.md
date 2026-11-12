# Activities (M8): strip, sign-in, diary, online/offline, festivals, daily boss, lotto, prabuff, mount

Plan: `docs/plans/2026-11-04_09_ACTIVITIES.md`, with implementation notes for phases A–D. Implemented 2026-11-04.
Research: `docs/research/2026-11-04_15_ACTIVITIES_CLIENT_RESEARCH.md`, `..._16_ACTIVITIES_SERVER_RESEARCH.md`.
VIP is in `vip.md`; loop quests are in `loop-quest.md`.

## Shared helpers
- `dayKey.ts`: every day, week and month key is computed in **UTC+7** (the legacy server timezone). Resets are lazy, from the keys; there is no cron.
- `rewardScale.ts`: `BASIC_GET_EXP` / `BASIC_GET_MONEY` (from Go `quest_reward.go`) and the `REWARD_K` table.
  - Rewards whose contents have no data (chests, sign-in bags, online gifts, festival bags) pay level-scaled exp and bound silver.
  - Named items in a description that match an existing template are also granted.

## Phase A: strip, sign-in, diary, online time, guide
- **Activity strip** (`ui/hud/activityStrip.ts`): `startedActList` from `data_tbl_activity` with type gating. Only ported ids are shown (0, 65, 19, 49, 25, 21, 24).
  - Labelled tiles stand in for the icon art.
  - The `updateActivityList` / `updateActivityState` push names come from Go; they are not pushed yet.
- **Sign-in**: one ledger feeds two tabs, and there is one sign-in per day across both.
  - Legacy 5-day tab: `getSignInData`, `signinNow` (level 20).
  - Monthly calendar: `initDailySignInActData`, `dailySignInActDoSignin`, `dailySignInActGetAward`, `dailySignInActRetroactive` (50 gold), `dailySignInUpActCrit` (100 gold) (level 50).
  - The lucky claim only works in May 2026, the only month with data.
- **Diary**:
  - RPCs: `getCharDiaryData`, `getDailyActAward` (chests at 30/60/120/210/360 points, one claim a day), push `updateDiaryData`. `getDiaryList` is an H5 catalog read.
  - `DiaryEvents` hooks: login 29, 30 min online 33, party 34, loop rounds 5/19/20/3/4/17, 200-vòng milestones 13–16. Counts are clamped to the table `max`.
- **Online time**: `getTodayOnlineTime` counts real session time per day. `getDailyOnlineAct` pays a gift every 30 min (auto-claimed on login).
- **Guide**: `saveGuideLog` stores a flag map only.

## Phase D: daily boss, offline exp, festivals, lotto, prabuff, mount
- **Daily boss** (`modules/dailyboss/`):
  - `bossDailyGetData` and `bossDailyBattle` start a solo PvE battle against the boss creature. Type 1 allows 2 or 4 tries a day, type 2 has a 72 h cooldown.
  - The total of 16 tries a day **is enforced** (Go never did). Tries are spent when the battle starts. `bossDailyFinishByCard` is a check only.
  - The reward is the battle exp; there is no loot data.
  - The client gallery (`.ds-boss` in `dailySystems.css`) is a stone-card layout: three wide boss cards, a parchment level-filter sidebar, and CSS spotlight framing. It pages six bosses at a time with previous/next controls. `BossDailyRow.resCode` carries the main creature resource so `animateCreatureModel` plays its standing sheet frames in a centred 158×136 canvas. Boss sizing uses the actual transformed frame bounds rather than SWF whitespace; action buttons are above all visual layers. Animation callbacks are stopped on page changes and close.
- **Offline exp** (`modules/offline/`):
  - `getOfflineExp` / `getPetOfflineExp(type, hours)`: `BASIC_GET_EXP[level]` × [0.3, 1, 2, 3] by mode, level ≥ 30, error codes -2..-9 (-7 never returned, as in Go).
  - Offline time runs from a clean disconnect or back to character select until the next login, capped at 3 days (H5), and is sent at login as `offlineTime`.
- **Festivals** (`modules/feast/`): `at` = hours|weekday|day|month (0-based months). `getCurrentFeast`; `takeFeastGift` (an H5 rule) pays once per feast. No row is valid on 2026-11-04.
- **Lotto / wish tree** (`modules/lotto/`): weighted rolls on `TBL_PLAN`. The pool is limited to grantable rows (tables 29 and 19, no quest id). Only the `lotto` bag is ported.
- **Prabuff** (`modules/prabuff/`): tracks and exp tables come from the client constants; the costs are Go-assumed. Level 50 gate (H5; Go used rebirth). Stats come through a stat provider.
- **Mount** (`modules/mount/`):
  - RPCs: `getMountList`, `checkHaveMount`, `renewMount`, `addMountExp` (item 3804), `addMountUpExp` (3805/6273), `beginMounting` / `stopMounting`.
  - Riding broadcasts `onMountOn` / `onMountOff` to the map. `mountInfo` is sent at login. Stats come through a stat provider. Level 50 gate.
  - The rider sprite now renders (paged WebP atlases; M13 phase A): `AvatarView` shows the mount sheet instead of the body (clips use
    behaviours 8 / 9 / 10), hidden on a costume / transform body and while flying. Scene rows carry `av.mount` (`AppearanceService.mountArt`),
    `onMountOn` / `onMountOff` are handled by `AppearanceController`. See `docs/memory/appearance.md`.
- Client: `DailySystemsController`, `StoreSystemsController`, the strip icons; "Ủy thác" opens from the minimap red function column and "Thú cưỡi" from the character panel (Trang bị tab, legacy CharactorPanel.showMount) — no separate HUD button bar.

## Deferred
Gift codes, nine boss, consume/recharge/guild-war events, quiz and maze, marriage, pet arena, pet PVE tower, dress gacha and runes, farm and estate, life skills,
boss loot, schedule/world boss (`data_tbl_schedule_boss` is now imported), the tutorial step engine.
Quiet the new RPCs after the user confirms.

- M14 H: icon 22 (Chiến Trường Dũng Sĩ, type 3) joined `ACTIVITY_PORTED_IDS`; `ThreePvpState.stripEntry` adds the flag-2 entry to the login list while the event fights and `updateActivityState {id 22}` is broadcast on every phase change (`threepvp.md`).
