---
name: m13-fairy
description: M13 phase G fairy (Tiểu Tinh Linh) server half - module wiring, look/stat hooks, G2 accessor, smoke recipe and pitfalls
metadata:
  type: project
---

- Module `fairy` (feature keys `fairy` / `fairy_skin`, pure state/grow/rules/skills files); FairyModule imports Appearance, ItemUse, NpcScript, Shop, Stats (nothing imports it back). Stats + appearance read the documents through the pure `fairy-state.ts` / `fairy-skills.ts` only (cycle-free).
- Look = `AppearanceService.fairyArt` + `pushFairy`; stats = `FairyBonusProvider` in `stats/growth-providers.ts`; G2 combat reads `FairySkillService.battleSkills(cid)` (client panels + combat casting were left to later agents, 2026-11-12).
- Replies keep the Go fail objects (`{f:false, code}` / `{flag:false, sindex}`) instead of throwing: the Flash client maps codes to text.
- Smoke: scratchpad `fairy_smoke.mjs` (+ `lib.mjs`), `DEV_COMMANDS=1 pnpm dev:server`, chars on map 10 near NPC 1726 (1140,1700). Gift bags are req_level 80 (use a level-80 char or useItem refuses silently); 3583 is use_type 4 (refused before item handlers); 521 books are use_type 2 (pet target).
- Flash research via a background `flash-client-researcher` (sonnet) while reading Go saved a lot of time; CallBack.as is a stub, so push handler bodies are unverifiable.
