---
name: go-combat-navigation
description: Where the legacy Go combat code lives, which handlers are live vs dead, and which memory docs are stale
metadata:
  type: reference
---

Combat packages (under `D:\mcgame\internal\`): handlers `presentation/rtmp/handlers/combat/` (cbom = `encounters.go`, battleUpdateCmd = `commands.go`,
battlePlayEnd = `battle.go:EndBattle`, relive = `recovery.go`), quest-battle start `presentation/rtmp/handlers/npc/quest_battle.go`, rules in `domain/combat/`
(turn_processor/executor/builder, damage.go), rewards in `application/combat/rewards.go`, creature stats `application/combat/npc_stats.go` + `domain/stats/profile.go`.

Registration quirk: `cmd/gameserver/main.go` order scene(451) -> combat(539) -> npc(552); `clickNpc` is live in npc handler, `clickBoss`/`hitNpc` in combat `HitNpc`.
Dead code: `CombatAction`, `ProcessNextActor`, `finalizeTimedOutBattle`. Damage V2 (`resolve.go`) is behind env `COMBAT_PERMILLE_V2`, off by default.

Stale legacy memory (`docs/memory/battle-combat.md`, `quest-battle-rules.md`): encounter rate (code floor 30 %), onBattleStart fields, cList fields, NPC type enum, timeout finalize,
behavior ids. No `onEndBattle` exists. `data_tbl_skill_effect` is empty in Mongo. Always trust code over those memory docs.

Data semantics: `data_tbl_map_creature` rows keyed by `mid`, rate band `[start_rate,end_rate)` of 0-100, `exp -1` = none; `creature.life` is a per-10000 HP percent;
`creature_loot.rate` is x/50000 in Go (quest rows 10000 x5 = 100 %); `npc.sub_type` = quest id list for NPC types 10/19/20; `quest_require` columns are `qid,kind,type,item_id,num,q`
(kind 1 item/29, kind 2 creature/12); `quest_pre` kind 2 = prerequisite quest.
