---
name: m13-dress-b
description: M13 phase B (Tủ Đồ) wiring facts, cycle-free fake look, forge gate, ws smoke + browser recipe, shell traps
metadata:
  type: project
---

- `modules/dress/` imports AppearanceModule; AppearanceService reads the `dress` feature document itself (`parseDress`, `gameData.dressRow`) so AppearanceModule never imports DressModule. Stats side: `DressBonusProvider` lives in `stats/feature-providers.ts` and imports pure `dress/dress-rules.ts` / `dress-state.ts` only.
- Forge gate = `ForgeItemsService.equipRow(cid, id, wornOk, gate = true)`; info RPCs (`getStarNum`, `getHoleNum`, `getJewelData`, `getUpgradeInfo`) pass `gate=false`. ForgeItemsService now injects GameDataService.
- Client: DressController is created inside CharacterController (GameScene is at its line cap); panel reuses the `FeatureWindow` shell (`.feature-window` + `dress-window`), `ft-*` classes from `ui/feature/dom.ts`. Confirm dialogs use textContent: strip `<font>` tags from Flash strings.
- Smoke: scratchpad `dress_bot.mjs` (register / login / sendCharList / newChar / chooseCharactor / sceneLogin, mongosh via `docker exec -i`, strip the `mcgame> ` prompt prefix, set `accounts.gmLevel`, `characters.level/gold`, `character_features` state directly). The dev server on :4000 hot-reloads (nest --watch), no need to start another. `gmGrant currency shishangdian N` and `gmGrant equip <tpl> 1 1` work for GM accounts. Test fixtures: fashion 1961 (dress 1001), flyer 1626, dress 2001 (recipe 1024, equipt 1984).
- Browser: HUD keys need ONE `window.dispatchEvent(new KeyboardEvent('keydown',{key:'c'}))` (document + window double toggles); character panel "Tủ đồ" button is `.char-ok`; dress window selectors `.dress-window .ft-tab[data-tab]`, `[data-dress=id]`, `.ds-cell.pick`, `.dress-result button`; real clicks by coordinate after a screenshot (800x524 frame at 1100x720 emulation).
- Shell traps again: backticks / `$in` / `${}` inside `node -e "..."` double quotes are eaten; write replacement text with the Write tool or use Edit. CRLF files edited with Edit are fine (characterPanel.ts, CharacterController.ts, appearance.service.ts, forge-items.service.ts).
