---
name: m12-client-petfunc
description: M12 client slice C1 facts - Luyen pet window wiring, extension point for the other pet windows, smoke tricks
metadata:
  type: project
---

- Pet panel second row: `PET_FUNC_BUTTONS` in `ui/petPanel.ts`; open a window with `PetController.setFuncHandler(id, pet => ...)` (ids train/evolve/guard/talent/stone/soul). `PetFuncController` (`game/`) is the pattern: window + RPC wrappers resolving null on refusal, `bag.subscribe` + `PetController.refreshAll` redraw.
- Client items carry no template facts by default: type 507 items expose `tplPropType/tplPropNum` (bag-mapping.ts), pets `divine`, skills `level`. Add optional wire fields instead of hard-coding tids in the client.
- Client has no tsx/test script: run client unit tests from `server/`: `node --test --import tsx ../client/src/.../x.test.ts`.
- Browser smoke: Vite does a full page reload when a new CSS/TS dep appears, which logs the session out; re-login (hudtest) via `find` refs. Re-query `.pet-funcs button` after any panel re-render (stale detached buttons keep the old pet in their closure). Drive tabs with `javascript_tool` helpers (click `.pf-seat`, then `.pf-picker-row` by text).
- Fixture recipe: scratchpad `c1_fix.js` / `c1_clean.js` (pets/items 985001+, bag slots 130+). The auto-filled item seat takes the LOWEST colour stack first, which can be a real hudtest stack (id 114, tid 1651): restore it at clean, plus moneyBind after Nguyen To.
