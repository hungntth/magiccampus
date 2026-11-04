---
name: activities-phase-d
description: M8 phase D (daily boss, offline exp, feast, lotto, prabuff, mount) wiring and test pitfalls
metadata:
  type: project
---

- Modules: `dailyboss/ offline/ feast/ lotto/ prabuff/ mount/`; client `DailySystemsController` + `StoreSystemsController` owned by `ActivityController`; `ExtraBar` = "Ủy thác" / "Thú cưỡi" buttons.
- Feature-store field names must be plain identifiers (`statePatch` rejects dots): use flat keys like `claim_<id>`, `t1_level`.
- Mount sheets (`PC_FEMALE_0100xx`) are 1600x31000 px atlases: black quad on the GPU; `Entity.loadVisual` skips sheets over 8192 px. Scene payloads are not decorated.
- Dress ids are not 1..18 contiguous (6..11, 19, 20 are the timed skins; 4/5 do not exist). Seed boss level -2 for 2265..2268.
- e2e: scratchpad `d_e2e.mjs` (+ `d_observer.mjs`); the first bot close races the leave hook (sleep ~800 ms before mongo writes). Feast needs a temp `data_tbl_feast` row and a server restart (table cached); delete it afterwards.
- Browser: confirm dialogs stack when a menu button is clicked repeatedly (flee): click each once.
