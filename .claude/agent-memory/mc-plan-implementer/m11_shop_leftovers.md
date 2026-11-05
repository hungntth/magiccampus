---
name: m11-shop-leftovers
description: M11 phase E (credit shops, guild shop 83, trolley) wiring facts, reused currency store, smoke fixture/restore recipe and shell traps
metadata:
  type: project
---

- Point balances = `Character.currencies` via `modules/progression/currency.service.ts` (NOT a new `points` map): the plan predates M7. Add missing keys to `CURRENCY_IDS` in `packages/shared/src/progression.ts`. Credit shops: `modules/shop/credit-shop.service.ts`; limits `character_credit_limits` (conditional upsert, E11000 = limit hit).
- `ShopModule` now imports `GuildModule` (exports `GuildShopService`) + `ProgressionModule`; `NpcModule` and `TrainingModule` import what they need from it. No cycle appeared.
- `BuyResult` carries `update: PlayerUpdate` (not key/total); vip shop and mall reuse `pushBuy`. `settle()` takes `Price | ContribPrice`.
- Guild contributions live on `guild_members` rows (`normalContrib` = Go guildContrib = p_type 20, `donateContrib` = 21), not on the character.
- Smoke recipe (hudtest cid 1): snapshot `characters` doc + `character_items` rows with a mongosh script before, set `mapId/posX/posY` (map 9 = NPC 2318, map 49 = NPC 1117) via Mongo before connecting, run a ws bot (scratchpad `shop_bot.mjs`), insert a fixture guild (`_id 99901`) + member row, afterwards delete exactly those rows and diff the snapshots (stripping createdAt/updatedAt). The bag is nearly full (3 free slots): every test purchase eats slots, delete bought rows between runs.
- Browser: screenshots lag one action behind a click; take a second screenshot before assuming a click failed. Reload the SPA (any localhost:5173 URL) to drop the socket before restoring the character document.
- Shell traps: bash heredocs / `node -e` strings containing backticks or apostrophes break the tool (EOF error); write files with the Write tool and run a `.cjs` for line-ending-preserving edits. `sed -i 's/$/\r/'` on an already CRLF file doubles the CR: use `s/\r*$//; s/$/\r/`.
