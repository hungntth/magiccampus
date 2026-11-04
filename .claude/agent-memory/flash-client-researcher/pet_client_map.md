---
name: pet-client-map
description: Pet feature file cluster and non-obvious facts of the decompiled client (list source, exp semantics, battle batching, follow-pet quirks)
metadata:
  type: reference
---

- Full results: `D:\mc-game-new\docs\research\2026-11-04_07_PET_CLIENT_RESEARCH.md`.
- Pet list = `PetManagerPanel.initView` -> awaited `initViewPetMngP`, called from `Core.initMainUI`; wrapper `{id, data:{...}}` is unwrapped client-side, keyed by pet id. No other login source.
- Pet `exp` is CUMULATIVE; level is never sent, always `PetLogic.expToLv(exp)` over `GamePredef.PET_LEVEL_EXP` (`predef/GamePredef.as`, not `config/`).
- `PetManagerPanel` reads `petName`, not `name`; scene/battle pet objects use `name`. `state` 1 battle / 2 follow icon / 3 rest.
- Client demotes old battle pet itself (`changePetState(old,3)` then `(new,1)`); gating is only level/useLv/binded alerts.
- With a live battle pet the client batches exactly 2 battle commands (player, pet); dead player + live pet => auto DEFENCE for the player.
- `contractPet` = account-wide "Khe uoc" bonus levels (PetEvolutionPanel), NOT pet acquisition. `petUpSkill` exists in client but is missing in the Go registry.
- Follow-pet: `_showPetId` is never restored from login data; `Core.createPlayer` cancels follow unless buff 1709/1979 or pmLevel>0.
- `onCreatePet`/`onCancelPet`/`onRefreshPetProp` bodies live in the stubbed CallBack.as; names only confirmed via Go (`handlers/pet/helpers.go`).
