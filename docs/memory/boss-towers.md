# Boss towers + flop pass (M10 phase F)

Plan `docs/plans/2026-11-04_13_DUNGEONS.md` §2.4, E2, notes "phases F and I". Legacy `nine-boss.md`, `corridor.md`, `trials-vdrl.md`,
`flop-pass.md` (+ `2026-10-22_09_FLOP_PASS_RESEARCH.md`).

- State: `modules/towers/` `character_towers` (nineboss / corridor / trials), `TowersStateService.mutate` (rev CAS; manual upserts need
  `rev: 1`).
- Nine boss `modules/nineboss/` (config = Go floors + pins on the E2 engine: clone, Hydra split, Atula revives, elite + death marks),
  RPCs initNineFloorPanel / attachThisFloorBoss / getNineBossAward, strip 13, round cap 150.
- Corridor `modules/corridor/`: NPC menus only (gate 2309 map 30, bosses 2301-2308, portals 2293-2300, exits 2310-2317, funcs `hlvt_*`),
  floor kits / summons / openers, couragePoint claim.
- Trials `modules/trials/`: 7 RPCs, trainer funcs `trials_fight_<floor>` / `trials_out`, party ≥ 2 for a new entry, 5 s sweeper, death
  rules (guardedRevive / twinRevive), strip 43.
- Flop pass `modules/floppass/` (`character_flop`, `flop_rank`), 9 RPCs, weekly cycle Monday 00:00 UTC+7, strip 40.
- Client: `game/TowerController.ts`, `game/TrialsController.ts`, `ui/nineBossPanel.ts`, `ui/flopPassPanel.ts`, `ui/trials/*`.
- Pitfall: the pinned HP (2M-1B) beats the boosted test characters; fast-forward state in `character_towers` to test claims.
