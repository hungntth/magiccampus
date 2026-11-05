---
name: m11-temp-bag
description: M11 phase C (temp bags, Túi tạm thời, bank sort) pitfalls - tsx vs Nest schemas, e2e of battle loot, fixtures, shell backtick traps
metadata:
  type: project
---

- `tsx` (esbuild) emits no decorator metadata: any script importing a `@Schema` class (services import schemas) dies with `CannotDetermineTypeError`. For service-level e2e compile the server: `cd server && npx tsc -p tsconfig.json --noEmit false --outDir .tmp_out`, run a `.cjs` script that `require`s `.tmp_out/src/modules/...` (+ `server/node_modules/reflect-metadata`), build the services by hand over `mongoose.connection`, then `rm -rf server/.tmp_out`. Used to drive `BattleLootService.credit` deterministically (scratchpad `loot_e2e.cjs`).
- Temp-bag rows (slot type 3) live in `character_items`; anything that lists a character's items without a slotType filter must exclude 3 / 90 (`InventoryService.list` does).
- `slot-writes.ts` has the shared `mergeInto` / `applySortPlan`; temp bag, bank and bag sort all use them. Moves need `SlotRef` {slotType, slotIndex}; swaps go through slotIndex -1.
- Fixture traps: `mongosh < file.js` aborts silently at the first duplicate-key insert (rows created by earlier tests at fixture slots), so delete by slot range, not only by fixture ids; `deleteMany({characterId})` on `character_vip` destroyed hudtest's real VIP doc (check with `findOne` first, never delete by characterId); bank/bag test items on hudtest: pages opened via `bagSlotNum/bankSlotNum`.
- Bank in a bot: `clickNpc 1636` then `npcFuncClick 1636` (hudtest at map 30 pos 1650,1330) sets `session.bankOpen`. Browser: patch `WebSocket.prototype.send` BEFORE login to capture `window.__ws`, then send raw `{t:'call',...}` frames to open the bank; DragEvent + DataTransfer dispatch drives the bag / temp panels; `await import('/src/ui/x.ts')` in the page mounts a panel with a fake host.
- Shell: backticks inside `node -e "..."` replacement strings get executed (words vanish); write docs/code with the Write tool, then splice from a file.
