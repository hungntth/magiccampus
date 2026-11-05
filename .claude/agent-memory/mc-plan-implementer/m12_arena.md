---
name: m12-arena
description: M12 slice 8 facts - pet arena wiring, lock order, smoke recipe, traps
metadata:
  type: project
---

- `modules/pet-battle/arena*`: ladder is ids-in/ids-out pure (`arena-ladder.ts`); `ArenaStateService.withLadder` = `withKeyLock('petarena:ladder')`, lock order is always `withCharLock` then ladder lock (view reads take only the ladder lock). `loadLadder` (unlocked) is for callers already inside `withLadder`.
- `PetMaterialService` (PetModule) reads `PetArenaEntry` by model for the busy line-up; PetModule registers the schema, imports `weekSeason` from `pet-battle/arena-rules` (pure, no Nest cycle). `weekSeason` = shared `isoWeekSeason` (UTC+7).
- Flash contracts beat the Go handler: `getLastPetArenaRank` replies `{"0".."5": rows}` (Go returned `{rank, rating}`), `onGetEnemies` rows are flat `{name, tName, total, rate, cid, win, rank}` with the self row first. Defender push only to a session that opened the panel (`ArenaFeedService` WeakMap flags).
- Smoke recipe: scratchpad `m12h_fix.js` (pets 982001.. for cids 1 / 5 / 6; wipes the arena collections; stashes hudtest wallet), `m12h_bot.mjs <pre|register|fight|limits|loss|streak|nopets|award|misc|season>` (hudtest + watchbot online, lhbot registers in `register`; Mongo edits through `docker exec -i` from the bot), `m12h_season.js` (moves this week's rows to last week, then restart the server and run `season`), `m12h_clean.js`. The three accounts hudtest / watchbot / lhbot all are level 151 = group E (index 4), so they share one ladder. Order of scenarios: pre, register, fight, limits, loss, streak, nopets, award, then season.
- A first full ws smoke needed no fix; unit-test traps were only in my expectations (arena slots keep distinct positions, pet-id dedupe is by pet; Elo on a 1-rating defender).
