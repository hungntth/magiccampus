---
name: item-use-ag
description: Item use effects phases A+G - dispatcher/registry wiring, PushSink collector trick, desc-bag port, smoke recipe and pitfalls
metadata:
  type: project
---

- `modules/item-use/` is a leaf module (imports Inventory/Rewards/Pet/PetStone/Title/Progression). It registers `UseItemService.addConsumeHandler` and exposes `ItemUseRegistry` (`addTemplate`/`addType`/`addQuestItem`); later phases B-F register there, never edit `item-use.service.ts`. Details: `docs/memory/item-use.md`.
- Hooks return `Push[]`, but GrantService/RewardGrantService emit via `session.callback`: they now take `PushSink` (`rewards/push-sink.ts`) and `item-use/push-collector.ts` records pushes in order (slot -> note -> grants).
- `withCharLock` is not reentrant and `useItem` already holds it: any service called from a handler needs a lock-free entry (`PetStoneService.grantUnlocked`, `PetService.award`, not `PetStoneService.grant`).
- `GameDataService.template()` reads base `data_tbl_item_template` only (item-template overlays are not imported). Award rows come from `InstanceDataService.itemAwardRows` (overlays unioned).
- Desc-bag parser tests need no Mongo: `DescBagIndex.build(TemplateSummary[], ...)`. Real-data coverage: dump collections with `docker exec mongosh --eval 'print(JSON.stringify(...))'` into the scratchpad, run a tsx script importing the repo files.
- A `nest start --watch` from the user usually runs on :4000 and recompiles dist on edits: smoke by ws bot against it (fresh account `register`/`newChar`/`chooseCharactor`, rows inserted with `docker exec -i mcgame-mongo mongosh` via stdin, `slotIndex` must be unique per bag or the insert silently fails). Delete the test account/char/rows afterwards (loop all non-`data_` collections for `characterId`).
- Shell: `node -e "..."` with backticks and heredocs containing apostrophes/`${}` break in the Bash tool; write scripts with the Write tool or `cat <<'EOF'` files. CRLF files touched: `use-item.service.ts`, `pet.service.ts`, `reward-grant.service.ts`, `PROJECT_KNOWLEDGE_BASE.md` (normalise in scripted edits).
