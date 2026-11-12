---
name: m14-wedding-e
description: M14 phase E (wedding hall) wiring - lock order, scheduler/sweep design, instance NPC 852, smoke + browser traps
metadata:
  type: project
---

- `modules/marriage/wedding-*`: lock-free where a Mongo conditional update is enough (`WeddingStore.markStarted / vow / finish / removeUnstarted / nextRedBag`). Booking = `withMarriageLocks(couple)` -> key `wedding-book` (gap check + charge + insert); never hold a char lock while taking another (card delivery locks one character at a time, divorce takes char -> marriage locks, so no wedding key lock around char locks).
- Item delivery to a partner/guest goes through `WeddingItems.give` (GrantService bag, else `MailSystemService` with a `source` key); `giveIfFits` is bag-only (cards). Couple gift bag 1687-1689 = `ItemUseRegistry.addTemplate` handler (cards only, celebration extras cut). Ring titles 61-63 already work via item_award rows (type 33), no hook needed.
- Hall exit: every scheduler tick ends with `WeddingHall.sweep()` (members of maps 63/64/65 without an open hall), plus `SceneHooks.onMapChanged` for login inside a closed hall / vow prompt at login in an open one. Origins persist in `wedding_origins` (`_id` = character id).
- Nguyệt Lão 852: instance NPC on map 34 (1300, 1230; `NPC_MARRIAGE.hub`, walkable per the hit mask) registered in `MarriageNpcService.onModuleInit` like NPC 49.
- Smoke: 8 accounts, bookings forced open/closed through Mongo (`startAt` / `finishedAt` edits) and the real 10 s tick; `m14_e_smoke.mjs` ~4 min. `mj('db.x.find().toArray()')` returns dates as ISO strings. Walk-through of a heredoc with apostrophes fails in bash: write scripts with the Write tool.
- Browser: Vite reloads to the login page after ANY client file edit (also .ts): re-patch `WebSocket.prototype.send`, re-login via DOM (`.char-list .char-card` click, then the "Vào game" button). Tier pick can be sent through the captured ws as `npcScript('marriage_book_1')` (no NPC distance check). A character saved inside an open hall logs back into it and gets the vow prompt.
- `askConfirm(text, onYes, onNo, labels?)` has optional button labels; the python-style multi-line `node -e` replace silently skipped one edit (check with grep, use the Edit tool for a second try).
