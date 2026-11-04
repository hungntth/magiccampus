---
name: progression-client-map
description: Where progression panels live in the decompiled client (titles, achievements, Than Khi, Tinh Cung, astrology, heiyaoshi, war sprite, monster heart, crystal) and non-obvious facts
metadata:
  type: reference
---

- Output: `D:\mc-game-new\docs\research\2026-11-04_13_PROGRESSION_CLIENT_RESEARCH.md`.
- `HeiYaoShiPanel.as` is an aborted stub (only `HeiYaoShiPoint`, `HeiyaoshiAlertPanel`, `HeiYaoShiConfig` readable). All Than Khi operations are tabs of
  `EquiptFuncPanel.as` case 4 (`tabD` 0..7); `CharactorPanel.tabBtnClick` (~8987): tab 2 MW (lvl 50), 3 Tinh Cung (lvl 80), 4 mount (reborn).
- Many progression RPCs are `call(name, null, ...)` with a null Responder; the answer is a push whose handler is a public method of the panel
  (`onInitMagicCrystalData`, `updateWarSpritePanel`, `updateMonsterHeartPanel`, `updatePraView`, `updateMWResetView`, `showEquipChangeAlert`).
  Use the panel's public `on*`/`update*` methods as the push-payload evidence, since CallBack.as is empty.
- `remote.nc.call(...)` (succinctMW, onSureSuccinctMW, activateMWPro, surePetEquModPre) bypasses `RemoteObj` (no RPC_DELAY).
- Activity icon bar `compMain/ActivityCanvas.as` `activityClick` switch maps activity ids (`GamePredef.as:2714-2762`) to panels (Heiyaoshi 57,
  war sprite 61, monster heart 64, crystal 66, astrology 28, medal 26, magic array 24, stone seal 39, mystery furnace 51, explorer medal 72).
- `docs/database/details/TBL_*.md` in `D:\mcgame\docs` list table columns with client usages (handy for TBL field names).
- Go memory notes can be wrong vs client: MW reset-prop has no apply RPC; magic crystal has no poll; astrology has 6 formulas + `lookFormula`.
- Title buff is long-buff row key 0 (`upLongBuff(bd)` / `delBuff(0)`); `Charactor.as` fields `t, ct, cts, actT, actTN, vipT, broT`.
