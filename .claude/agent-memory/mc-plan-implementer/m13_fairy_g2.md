---
name: m13-fairy-g2
description: M13 G2 fairy battle skills - async kit preload through loadPets, CRLF combat files, seed prop 41 trap, live battle smoke recipe
metadata:
  type: project
---

- Battle starts are sync: per-character async battle data (fairy rotation) is preloaded inside `CombatService.loadPets` (every PvE/PvP start awaits it, incl. pk.service) and taken in `startGroup` / `PvpService.start` (`combat/fairy-kits.service.ts`). Reuse this hook for similar per-battle data.
- CRLF in combat: `round.ts`, `pvp.service.ts`, `combat.module.ts`, `battle.types.ts` (the `grep -q $'\r'` check lied); use Edit or a CRLF-normalising .cjs.
- Seed buff prop 41 is NOT life steal in the H5 data (Chiến Phách, Niết Bàn...): life steal uses H5 pseudo prop 941; 901 / 903 are free.
- Go seed overlays (e.g. `data_tbl_buff_doc_dao_poison.sql`) are not imported by `pnpm import:seeds`: check the Mongo row before trusting legacy memory.
- Live smoke: scratchpad `g2_smoke.mjs` (lib.mjs): gmGrant fairy, patch `state.fairy.<id>.skillFlag/skillConfig` in Mongo, `changeFairyState(id,1)`, char level 30 on map 2 (1800,900), `cbom` loop, defend (-20) each round, read `sSObj.buffAdd` on slot 10. Stop server = kill `nest.js start --watch` + `dist/main` pids.
