---
name: m12-client-petevo
description: M12 client slice C2 facts - T.Hoa window / Sach Tien Hoa wiring, client static tables, evolved-pet refresh trap, smoke recipe
metadata:
  type: project
---

- Wiring: `game/PetEvoController.ts` (owned by `PetController`, opened by `funcs.set('evolve', ...)`); views in `ui/petevo/`. Windows must keep the `pf-win` class so `petfunc/seats.ts` `openPicker` finds its root.
- Client has no static tables: handbook / contract rows are generated into `packages/shared/src/petHandbookData.ts` by `server/tools/gen-pet-handbook.ts` (reads Mongo; re-run after seed imports). Same pattern as `petFeatherSteps.ts`.
- `onRefreshPetProp` carries only `property`: after evolve / feather call `PetController.reload()` (initViewPetMngP) for tid / icon / envoInfo; patch `pet.envoInfo` from feather replies for in-loop display.
- Handbook has 10 series (class 1..10), Flash tab names at Language `PET_HANDBOOK_PANEL_U[12..18,110,118,120]`; hudtest is level 151 so the level-120 client gate passes.
- Browser login after each Vite reload (any TS/CSS edit logs out): fill via `computer` clicks at (398,200)/(398,241), Return, click the card (295,322) then Vao game (290,388); open pet panel with `window.dispatchEvent(new KeyboardEvent('keydown',{key:'w',code:'KeyW'}))`, drive windows with `javascript_tool` (`.pet-funcs button` text, `.confirm-dialog button` "Đồng ý").
- Smoke fixture: scratchpad `c2_fix.js` / `c2_clean.js` (ids 986001+, stashes stone stack 128 in m12c2_stash, VIP doc created and deleted, npPnt / activePetObject / contractPet unset, gold 997). Add a stone stack row before re-login to test stones; pets in the bag carry exp 100000 but show a low level (display only).
