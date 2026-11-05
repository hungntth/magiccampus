# World boss, schedule boss, boss loot (M10 phase I)

Plan `docs/plans/2026-11-04_13_DUNGEONS.md` §2.7, E2.10, notes "phases F and I". Legacy `world-boss.md` (+ research
`2026-10-10_01_WORLD_BOSS_RESEARCH.md` §3-§5, `2026-10-31_02_WORLD_BOSS_GUIDE_GAP.md`), `schedule-boss.md`, `boss-loot.md`.

- `modules/worldboss/`: in-memory event (schedule `2,4,6|14:30-15:00` UTC+7, 30-min lobby), map 2006, Hydra 1255 pool 800M (kit: pool
  6023 / 5938 / 5937 × 3, control + debuff immune, Ngày Diệt Vong round 6), 7 RPCs + GM `gmWorldBoss` / `/wb start|stop|lobby|status`,
  `initWbView` 10 args in the research order, result after battlePlayEnd, owed bags `character_wb_owed`, Chiến tích = currency `honor` 2.
- `modules/scheduleboss/` (`schedule_boss_state`): 62 tracked bosses, respawn 6 h ground / 24 h flying, alive ones through M9
  `createBoss`; static rows hidden (`InstanceNpcService.hideStatic`).
- Boss loot: `combat/boss-loot.ts` + `gamedata/boss-loot.ts` (`data_tbl_boss_loot`, 1/50000 rates, source filter); the seed only has
  daily rows (Sổ Tay bosses). `BattleContext.noRewards` / `atkMul` / `bossLevel` (level-gap rule > 10: exp 1, no loot).
- Client: `game/WorldBossController.ts`, `ui/worldBoss/*`, strip 15.

## M11 mail (2026-11-05)
Unclaimed gift bags (offline, full bag, left the map, evacuation) are mailed per bag item (Go `exit.go mailPendingAward`); `character_wb_owed` is only the fallback for a failed mail and is converted to mail at login. See `memory/mail.md`.
