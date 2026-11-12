---
name: m14-marriage-d
description: M14 phase D (marriage core) wiring - extension points for the wedding hall (E), snapshot listener, priorType, smoke + browser traps
metadata:
  type: project
---

- `modules/marriage/`: locks are `withMarriageLocks(ids)` (`marriage:<id>`, ascending, not reentrant); `marryLocked` / `endMarriage` run inside them, pushes (`announceMarried` / `announceEnded`) always outside. `TitleService.revoke` takes the char lock itself, so divorce does the card spend under `withCharLock` and the title revokes after it.
- Phase E hooks left on purpose: `MarriageService.onEnded(name, fn)` (close a hall on divorce), `TierPickService` (NPC `marriage_book_N` sets the tier, booking reads it), `wedding_bookings` schema + `MarriageStore.dropBookings`, the commented slot in `MarriageNpcService.click()` / `script()` default for `marriage_book_N` / `marriage_list`. `SysEventPush` / `BookRow` / `WEDDING_TIERS` are already in shared `marriage.ts`.
- `RelationshipService.addSnapshotListener(fn)` runs after each `initViewImC` answer (used for `onInitCouple`). Game-ready pushes ride `SceneHooks.onMapChanged(fromMap 0)`.
- Nguyệt Lão 852 is on map 100 (no map data): only Cupid 215 (map 34, 1384/1197) is clickable. Smoke chars must stand on map 34 for `clickNpc 215`.
- `marriages.priorType` (1 friend / 3 enemy / 0) decides what divorce restores; couple rows keep friend intimacy through `link`.
- Smoke: compile with `npx tsc -p tsconfig.json --outDir .m14d-dist` in `server/`, run with DEV_COMMANDS=1, stop via PowerShell `Stop-Process` on the :4000 owner, delete the dir. Character gender is set in Mongo (`newChar` always makes male). Purge test data with a generic sweep over every collection holding `characterId` (character_daily / character_features / character_skills are left behind otherwise) and delete `accounts` too.
- Browser: HUD "Xếp hạng" needs a real click through `find` ref (DOM click on the div does nothing); chat `/grant item 122 1` needs a real click on the input + `key Return`; bag cells open with `dblclick` MouseEvent dispatch.
- Edits: `rankingPanel.ts` (and likely other client files) are CRLF: a node `replace` with LF text half-applies silently; use the Edit tool.
