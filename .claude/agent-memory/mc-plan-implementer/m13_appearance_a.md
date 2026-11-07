---
name: m13-appearance-a
description: M13 phase A (appearance + flying) wiring facts, EquipHooks cycle trick, sheet label quirk, browser smoke recipe
metadata:
  type: project
---

- `modules/appearance/` is a non-leaf module: it imports InventoryModule; Inventory never imports it. Equip changes reach it through `inventory/equip-hooks.ts` (`EquipHooks.changed(cid, position)`), because CharacterModule -> QuestModule -> InventoryModule would cycle. Scene / Vip / Dungeon / Combat / Settings modules import AppearanceModule.
- Scene payloads: `appearance.decorate(sc, mapId, settle)` replaced `WeaponLookService.decorate` (settle true only for the owner's own scene entry, it grounds a stale persisted flying flag). `GameDataService.TEMPLATE_FIELDS` is a projection: new template columns (`res_code`, `wav_code`) must be added there or `template()` rows silently lack them.
- Sheets: dir 0 clips of most converted sheets are stored under Chinese names (`SheetAnim.order[0..7]` = behaviours 0..7), there is no `0-0` label; flyer sheets too. Use `AvatarView.playFirst` / `SheetAnim.orderLabel`, never assume `${dir}-${b}`. Mount sheets carry `0..7-8/9/10` clips (rider + mount in one clip).
- Smoke: scratchpad `fly_bot.mjs` style bot (global WebSocket, md5 from shared dist, `register`/`login`/`newChar`, mongosh via `docker exec -i` for gmLevel + level 50, then re-`login` so gmLevel applies, `gmGrant equip <tpl> 1 1` then `equipOn` with the id from `onAddCharactorSlot`). Flyer 1626 (Phi Long, sheet EQUIP_FLY_000008), fashion 1432, no-fly map 2002, flyable map 1. Clean test accounts afterwards (`accounts` /^f[abcd]_/ + every collection with `characterId`).
- Browser: dev client login via the form works with such a test account; hidden pane renders ~1 fps so lift / landing tweens take 10-20 s; the visible frame is 800x450 or 800x524 depending on the pane, re-screenshot before coordinate clicks; Vite HMR page reload sends you back to the login screen. `await import('/src/...')` in the page gives a different module instance (timestamped URLs), so prototype patching does not reach live objects: use temporary `console.log` + `read_console_messages`.
- Node scripts writing source files sometimes fail once with `UNKNOWN: open` while nest --watch / vite hold the file: retry the write (loop with `Atomics.wait`). A retry of a replace script re-applies edits whose search text is still present (duplicate lines): guard on the replacement text.
