---
name: m13-equip-depth
description: M13 phase D equipment depth wiring (sublime / restrain / Ky Linh / jewel exchange), colour-scale trap, test + browser recipe, CRLF edit helper
metadata:
  type: project
---

- Files: `server/src/modules/forge/{equip-sublime,qiling}.{service,rpc}.ts`, `*-rules.ts`; state `properties.sublime {lv,add,el}` / `properties.qiling[3]`; shared `equipDepth.ts` (+ generated `equipSublimeData.ts`,
  `server/tools/gen-equip-sublime.ts`). Pet twin rules in `forge/sublime-rules.ts` are reused (`planSublime`, `rollSublime`, `restrainBlocker`). Details `docs/memory/equip-depth.md`.
- Colour trap: H5 equipment `colorCode` is the Go ColorCode (orange 5, quality q = (c-1)*5+prefix); the Go gate "colour >= 4" is on display colour = ColorCode - 1 -> `equipDisplayColor`. Pet gear uses colorCode as display directly.
- `equipt_suit` = pet gear + wings only (no character consumer); do not wire it for characters.
- Several repo files are CRLF (forge.module.ts, core-providers.ts, forge.ts, equip-stats.ts): multi-line `Edit`/string replace fails silently in node scripts; use a CRLF-aware replace helper or the Edit tool.
- Browser: strip icon "Kỳ Linh" (id 68) opens the forge window; `C` key opens the character panel, hover the worn slot for the tooltip. `askConfirm` dialogs exist in the DOM (`.confirm-dialog`) but did not show in screenshots; click "Đồng ý" through JS.
- Smoke recipe: scratchpad ws script with `ws` + `mongodb` required through `createRequire('E:/magiccampus/server/package.json')`; stat reads via equipOff/equipOn `onUPP property.finalAttack`; cleanup only by `characterId` (never delete `_id: cid` outside `characters`).
