# Mê Trận (maze, M10 phase G)

Plan `docs/plans/2026-11-04_13_DUNGEONS.md` §2.5, notes "phases E, G, H". Legacy `E:\mcgame\docs\memory\maze.md` + research
`E:\mcgame\docs\research\2026-10-10_01_MAZE_RESEARCH.md` §4-§6 (wire contract).

- Server `modules/maze/` (`character_maze` rev CAS; pure `maze-board.ts`, `maze-events.ts`, `maze-config.ts` + tests; `maze-push.ts` =
  fixed push order; doors 900001-900004 + event NPC 900010 are instance NPCs; fights built with `creatureFighter` + `combat.startGroup`,
  ctx source `maze`).
- Copy rooms: `Session.copyId`, `SceneManager.join(session, mapId, copyId)`, `SceneTransportService.enterCopy`; positions are never saved
  on 2007-2009 (relog = return point, as Go).
- 15 RPCs + 7 pushes verbatim (not quiet). `answerMazeQuestion` takes an H5 `choice` letter and is graded server-side.
- Client `game/MazeController.ts`, `ui/maze/*`, strip 27; `mazeRecover` confirm after every maze fight.
- Test: fast-forward `run.cur` / `run.actNum` / `run.board.N` in `character_maze`; delete the doc to reset the daily entry.
