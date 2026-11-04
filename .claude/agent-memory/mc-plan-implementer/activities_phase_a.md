---
name: activities-phase-a
description: M8 phase A (activity strip, sign-in, diary, online gift) layout and test tips
metadata:
  type: project
---

- Modules: `modules/activity-events` hook = `DiaryEvents` (party imports `ActivityEventsModule`, no cycle); `activity-rewards` = `RewardGrantService` (exp + bound silver, pushes) and `ItemGrantService` (items by name); `signin` ledger = month bitmap with `$bitsAllClear` marking.
- UTC+7 keys live in `@mc/shared` `dayKey.ts`; use `dayKey(Date.now())`, never `new Date().getDate()`.
- Client: `ActivityController` owns the strip + diary/sign-in windows; add a ported activity id in shared `ACTIVITY_PORTED_IDS` and in the controller's `has`/`open`.
- Bot e2e: scratchpad `act_e2e.mjs` (uses `gbot.mjs`, tags A8/A9); set `character_daily` via mongosh to fake vitality / onlineMs. Browser: register in-page with random values, keep creds in `sessionStorage` across a reload (never print).
- `.act-strip` hides itself while `.battle-menu` exists (CSS `:has`). Pane screenshots lag one step; trust DOM reads.
