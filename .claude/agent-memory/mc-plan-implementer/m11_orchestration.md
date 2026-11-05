---
name: m11-orchestration
description: M11 (mail/auction/bags/trade pets/shop) run 2026-11-05 - sequential per-phase implementer recipe and test-data pitfalls
metadata:
  type: project
---

- M11 plan `docs/plans/2026-11-04_14_MAIL_AUCTION_BAGS.md` phases A-E done 2026-11-05 by one mc-plan-implementer per phase, run
  sequentially (each smoke-tests itself with ws bots; parallel agents would kill each other's bots via nest --watch restarts).
  Shared rules file: scratchpad `m11_prompt.md`.
- Tell helpers explicitly not to delete unrelated test-char state: phase C deleted hudtest's `character_vip` doc while testing PM.
- Credit points live in M7 `Character.currencies` / `CurrencyService` (not a new `points` map).
- After helpers finish, grep their files for `as unknown as` (one slipped into a test file).
