---
name: stat-features
description: M7 phase C pitfalls - modules/feature layout, feature-state keys, provider placement, e2e/browser tips
metadata:
  type: project
---

- Layout: `server/src/modules/feature/` (pure `*-rules.ts` + `feature-state.ts` parsers, services, `soul.rpc.ts`, `warsprite.rpc.ts` = wsp + crystal). Stat providers for these live in `stats/feature-providers.ts` (read `character_features` by model; StatsModule cannot import ProgressionModule: cycle) and import the pure rules from `modules/feature`.
- Feature docs: keys in `FEATURE_KEYS` (`train_soul`, `awakening`, `war_sprite`, `magic_crystal`); whole-state `store.put` under `withCharLock`; tests build rows with `buildFeatureTables(...)` (gamedata/feature-data.ts), never importing schemas.
- Crystal catalog lives in `@mc/shared` `statFeatures.ts` (compact tables, verified against Go catalog.go): rebuild shared before server tests/lint.
- A bash heredoc with an apostrophe aborts the whole command silently (nothing is written): use the Write tool for every source file.
- Default payment pref is `moneyBind`: e2e must fund `moneyBind` (not just `money`) or silver charges refuse. Browser: register via the form with in-page random values, create the char, seed currencies/level in Mongo by NAME, then pick the char card + `.panel > button`; `C` key (blur first) opens the panel, header button "Tu luyện" opens the feature window (`.ft-tab[data-tab]`, `.ft-btn`).
- Fixture scripts: `fs_e2e.mjs` (ws bot, all four systems) and mongosh seeding via `docker exec -i mcgame-mongo mongosh mcgame --quiet < file.js`.
- Phase D (heiyaoshi + zodiac): rules `heiyaoshi-rules.ts` / `zodiac-rules.ts` (pure, `now` injected), providers `HeiyaoshiBonusProvider` / `ZodiacBonusProvider` in stats/feature-providers.ts, state keys `heiyaoshi` / `zodiac_stars` (`{stars:{...}}`, END timestamps). Client tabs 4-5 of the Tu luyen window live in `game/FeatureStarController.ts` (own 1 s ticker, sends finishStarLvUp). Real data: star 1 L1 = 30 s but star 4 L1 = 120 s, so a short browser timer needs star 1; figure 1 of heiyaoshi has only 4 points / 2 triangles.
- Gotchas: server tests need `pnpm --filter @mc/shared build` first (undefined `HEIYAOSHI` otherwise). My scratchpad edit scripts named e2/e3/e4.cjs overwrite older ones: use unique names. Test account for phase D: hzd_gwa1kt (char 55, scratchpad hz_e2e.mjs / hz_seed.js); items via chat `/grant item <id> <n>` need a real click on the chat input (150,538 in the 800x553 screenshot frame) + `key Return`.
