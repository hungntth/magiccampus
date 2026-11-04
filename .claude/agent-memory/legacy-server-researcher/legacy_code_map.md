---
name: legacy-code-map
description: Which Go package owns which feature in D:\mcgame, dispatcher quirks, and where legacy memory files are stale
metadata:
  type: reference
---

Go module root `D:\mcgame\internal\`. Handlers: `presentation/rtmp/handlers/<feature>/` (reg in each `handler.go` via
`dispatcher.Register`); rate limits + quiet list in `infrastructure/rtmp/dispatcher.go` (rateLimits ~109-194, mirrors client
`docs/client/config/RPCConfig.as`). Registrations were unique for the character/item/buff RPCs (grep `"<rpc>"`), no last-write-wins seen.

- Stats formula: `domain/stats/profile.go` (BuildBaseStats); character entity + level-up + allocate: `domain/character/character.go`;
  gear/buff bonus fold: `domain/character/equip_stats.go`, aggregation `application/item/equip_stats.go`; exp table hardcoded in
  `domain/character/player_level_exp.go` (no exp table in Mongo).
- Items/equip/use: `application/item/service.go` (+ `effect_*.go`, `potion.go`), handlers in `handlers/item/{equip,use,bag,bag_manage,recover}.go`.
- Buffs: `application/buff/service.go`, `handlers/buff/handler.go`, table `player.character_buffs`.
- NPC healer: `handlers/npc/npc_func_other.go`; cost table `gamedata/predef/quest_reward.go`.

Stale legacy memory (verified 2026-11-04): `docs/memory/unified-stat-formula.md` coefficients, `aptitude-stats.md` (apt = distributed points,
class apt internal), `item-inventory.md` prop 21 label. Always trust code over `docs/memory`.

Scales/collisions: class `apt_*` are per-mille multipliers (1500-2700); equipment slot sid = template `position` (1-22), `slotIndex = position-1`,
positions 50-57 are pet equip; item colour 0-4 vs equipment ColorCode 0-5; equipment prop dictionary (21-29) differs from buff/common prop dictionary.
`MEMORY` note: docs/memory paths in H5 docs say `E:\mcgame` but the real path is `D:\mcgame`.
