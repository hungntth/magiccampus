---
name: m13-mystery-astrology
description: M13 phase F wiring, smoke recipe and pitfalls (mystery / astrology modules, furnace, lock-free book + rune grant, recipe colour fixtures)
metadata:
  type: project
---

- Modules `mystery` (Mật Bảo + furnace + books) and `astrology`; stat provider `MysteryBonusProvider` in `stats/growth-providers.ts` (imports only `mystery-rules` / `mystery-state`). Mật Bảo UI = 4th tab of the Hồn Khí window (`decoWindow.ts`, `DecoUiHost.mystery`); furnace + astrology windows are owned by `ActivityController` (strip ids 51 / 28).
- Item handlers run inside useItem's lock: `MysteryBooksService` writes the feature store directly; the dissolve (own lock) calls the new lock-free `RuneService.grantLocked`. Recipe materials match the INSTANCE colour (`character_items.colorCode`): `/grant item <id> <n> <colour>` (4th arg added) or set it in Mongo.
- Smoke: scratchpad `f_smoke.mjs` / `f_setup.mjs` (+ `lib.mjs`), start `DEV_COMMANDS=1 pnpm dev:server`, then kill the three node pids (pnpm, `nest.js start --watch`, `dist/main`). Daily state is written with `state.make = {day (UTC+7 key), made, addTimes}`; astrology cycle flips 05:00 UTC.
- Heredocs with apostrophes / Vietnamese silently fail in bash: write scripts and snippets with the Write tool. `node -e` strings with backticks break too: put markdown snippets in files and append them from a `.cjs`.
- A general-purpose subagent built the two simple client windows (astrology, furnace) in parallel from the shared contract; review its DOM in the browser (strip titles are `.act-strip [title]`, FeatureWindow tabs `.ft-tab`, cells `.fn-cell`).
