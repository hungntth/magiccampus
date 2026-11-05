# Star instance + task sweep (M10 phase E)

Plan `docs/plans/2026-11-04_13_DUNGEONS.md` §2.3, notes "phases E, G, H". Legacy `E:\mcgame\docs\memory\star-instance-system.md`.

- Server `modules/starinstance/` (`character_star_instance {scores, dailyMax, dailyUsed, day, sweep?}`, rules + test, line-ups = Go
  `PalaceLineups`, `star-cultivation.service.ts` reads the M7 `zodiac_stars` feature, starPnt = currency 240).
- RPCs (not quiet): getWarMap (+ H5 fields `p`, `pnt`), clickWarMap (codes 1 / 0 / −2 / −3 / −5), addWarMapTime, the task sweep set
  (initTaskSweepPanelByClient, taskSweepSure, taskSweepEnd, taskSweepCancel, taskSweepLeftTimeCheck, taskFinishByGold,
  getTaskBattleTime). battlePlayEnd reply `{r, s}` via `BattleHooks.onReply('star')`; client `BattleHost.onEndReply` shows the report.
- Client: `game/StarController.ts` (hosted by DungeonController: GameScene is at its line cap), `ui/star/*`, `ui/taskSweepPanel.ts`,
  strip id 2.
- Test: set `character_features` `zodiac_stars` stars for the char; fast-forward a sweep by lowering `sweep.st`.
