---
name: m10-world-boss
description: M10 phase I wiring notes (worldboss + scheduleboss modules, boss loot hook in combat settle, CRLF edit helper)
metadata:
  type: project
---

- Event modules: `server/src/modules/worldboss/` (Wb* services, state in `WbState` via `WorldBossCoreModule` for the strip) and `scheduleboss/`.
  WB fights use `BattleContext {noRewards, atkMul}`; schedule fights `{bossLevel}`; both additive in `combat/battle-settle.service.ts`.
- Schedule bosses: static NPC rows hidden through `InstanceNpcService.hideStatic`, alive ones delivered by `createBoss` (`registerMapBosses`),
  so the client BossLayer owns onBossOn / onBossOff. Boss loot rolls in `BattleLootService.grant(…, ctx)` (`combat/boss-loot.ts`).
- CRLF files (app.module, combat.module, GameScene, ActivityController): edit with a node find/replace that preserves EOL, not heredoc/sed.
- The dev server's tsx watch auto-opens the real WB lobby (Tue/Thu/Sat 14:00 UTC+7); expect `world boss lobby opened` in logs.
