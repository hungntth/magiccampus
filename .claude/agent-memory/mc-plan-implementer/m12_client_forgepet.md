---
name: m12-client-forgepet
description: M12 client slice C4 facts - forge pet tab group wiring, sticky picker trap, sublime wire field, smoke recipe
metadata:
  type: project
---

- Pet forge tabs: `ForgeTab.group = 'pet'` (ForgePanel shows one group + switch button); host list is `ForgeHost.petGear()` (bag, PET_BAG, PET_EQUIP), NOT `host.items()` (mixTab / craftTab list every slot type there). Base class `ui/forge/petGearTab.ts`: subclass ctor must call `this.start()` last (subclass fields init after super()).
- A tier-up pushes `onDelCharactorSlot` then `onAddCharactorSlot` for the same id: `EquipPicker` without `sticky` loses the selection. Server answers petEquLevelUp / petEquModColor as RPC results (no onPetEquLevelUp push); colour success / roll-failure notes come from the server (refusal = `num === 0`), so do not toast those twice.
- Sublime state is `BagItem.sublime` (parsed from `properties.flag` in `bag-mapping.ts`); per-level table is generated (`server/tools/gen-pet-sublime.ts` -> `shared/petSublimeData.ts`). Items 2528 / 2529 have no item template rows.
- Smoke: fixture `m12e_fix.js` / `m12e_clean.js` (scratchpad) works unchanged for the browser; piece order in the picker = bag, pet page, worn. In the 800x450 pane the HUD "Chế tạo" is at (773,173), bottom bar "Pet" at (633,436); drive tabs / buttons through `javascript_tool` helpers (`document.querySelectorAll('.forge-tabs button')`, `.forge-picker .forge-cell`, `.confirm-dialog button`). HUD buttons are not `<button>` elements. Server cold start under `nest start --watch` takes ~2 min here; wait on `curl :4000` with Monitor. Every client edit reloads the page and logs out.
