---
name: item-use-bc
description: Item use phases B (gift box) + C (food buffs) - wiring, smoke bot recipe, pitfalls
metadata:
  type: project
---

- Gift box: `item-use/gift-box.service.ts` (pending Map per char, consumes the box via `InventoryService.consumeStack` at the first pick, NOT `ctx.consume()`), `choice-bags.service.ts` registers `addQuestItem` handlers + is the `DescBagService` `ChoiceBagPort`. Client: `game/MultiItemController.ts` owned by `BagController` (kept it <= ~310 lines by delegating). Details in `docs/memory/item-use.md`.
- Foods: `FoodService` = `addType([502])` + `addTemplate(wedding candies)`; a type handler is terminal, so rule foods (2503/3438/6562) answer FOOD_NO_EFFECT until phase D registers them by template id (template handlers run first).
- `BuffService.grant(cid, id, seconds, {addRemaining, battles})`; battle charges decrement in `BattleEndService.pushResult` (battlePlayEnd), not at settle.
- Smoke: scratchpad `smoke_bc.mjs` (copy of phase A/G `smoke.mjs` + scenarios, args = scenario names: paid, free, pet, feather, thankhi, title, desc, full, food, battleFood, noeffect, wedding, hp, ui) and `clean.js` (stdin to mongosh: deletes account gbox_smoke + its char rows). Each docker-exec `give` is slow: run <= 4 scenarios per call (120 s tool timeout), `GOLD` env is process-wide.
- nest `--watch` compiles ad-hoc `.ts` files dropped into `server/src` (a temp `cmp_tmp.ts` produced `dist/cmp_tmp.js`): put throwaway scripts outside `src` or delete the dist copy.
- Browser: `javascript_tool` sets login inputs reliably (native value setter + `input` event); `computer` typing missed the fields at 800x450. Items in the bag open with a `dblclick` MouseEvent on `.bag-panel [draggable="true"]`.
- Heredocs with apostrophes break the Bash tool even when quoted: write `.cjs` edit scripts with the Write tool (see `docs.cjs` pattern: CRLF-preserving `edit()` + `rep()` that logs MISSING).
