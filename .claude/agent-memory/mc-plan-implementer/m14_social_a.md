---
name: m14-social-a
description: M14 phase A (relationships/intimacy) wiring, smoke pitfalls (throttle timing, nest --watch restarts, bag page 2)
metadata:
  type: project
---

- `modules/social/`: `RelationshipService` is the feature API (link/convert/unlink/addIntimacy/resetIntimacy/announce/pushSnapshot); locks are `withKeyLock('rel:<id>')`, never the bag lock. Won-battle gain uses `BattleHooks.onAnyEnd` (no combat edit). `addIntimacy` uses a pipeline update (`updatePipeline: true`).
- Smoke: run the built server without watch (`node dist/main` with DEV_COMMANDS=1) because other agents' edits restart `nest --watch` and drop sockets/parties. Team throttle stamps persist 55 s across sessions and the party tick claims at its own phase, so to isolate the battle hook start the party right after a tick second and fight within ~20 s.
- Browser: bag page 2 is locked for new characters (slotIndex >= 30 is hidden); put test items at slotIndex < 30. The same account logging in again kicks the earlier ws (bots vs. browser).
