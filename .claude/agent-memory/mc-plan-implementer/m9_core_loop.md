---
name: m9-core-loop
description: M9 core-loop status (phases A-H done and browser-smoked 2026-11-05), module wiring and pitfalls met on the way
metadata:
  type: project
---

- M9 plan `docs/plans/2026-11-04_12_CORE_LOOP.md`: all phases A-H implemented 2026-11-05; each phase has implementation notes.
  New RPCs are NOT quiet yet: ask the user before quieting (skills, hotbar, relive, blood bag, bosses, detail, us, toMovable, spectate).
- Wiring: `modules/settings/` (uif / skillSetBattle / skillSetUserBar / us; `us-value.ts` whitelist); permission gates live in
  `settings/permission.module.ts` (own module: SettingsModule -> PkModule -> CombatModule -> Party/Trade cycles).
  `LoopBossService` sits in LoopCoreModule (imports InventoryModule); order items reach it via `UseItemService.setOrderHook`.
  `SpectateService` in CombatModule; `CombatService.roster` gives a party roster without the encounter roll.
- Client: GameScene split -> `game/NpcLayer.ts` + `BossLayer.ts` + `ViewSettings.ts`; MainHud owns skill / settings / world map / help panels.
- Pitfalls: Vietnamese text in rep.cjs JSON specs can miss -> use Edit; backticks inside `node -e "..."` OR a bash heredoc
  without quoted delimiter get executed (cost a memory-doc rewrite) -> write JS with the Write tool; pre-M9 characters lack new
  array fields (bloodBag) -> guard dotted writes (`ensureBloodBag`). Confirm/amount dialogs need z-index above act-win (46).
- Test accounts: hudtest (char 1 Han, GM) and watchbot (char 5) in `server/.env.example`; bot script idea: global WebSocket +
  md5 from `packages/shared/dist`, `register`/`login`/`sendCharList`/`chooseCharactor`/`sceneLogin`/`cbom` loop.
