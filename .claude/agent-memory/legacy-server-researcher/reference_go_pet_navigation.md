---
name: go-pet-navigation
description: Where the legacy Go pet/mount code lives, live-vs-stub RPCs, registration notes, pet data-column semantics and known Go quirks
metadata:
  type: reference
---

Packages (under `D:\mcgame\internal\`): entity + stat formula + exp table `domain/pet/pet.go` (RecalculateStats, GainExperience, ToDTO, ToSceneDTO),
service `application/pet/` (service.go, contract.go = creation, skill_slots.go, skill_books.go, skill_delete.go, equipment.go, pet_guard.go),
handlers `presentation/rtmp/handlers/pet/` (all 36 pet RPCs registered once in `handler.go`, no collisions), repo `infrastructure/persistence/postgres/pet_repository.go`
(table `player.character_pets`, extra columns `life`, `attr_points`, `max_attr_points`, `distributed_attr_points`; everything else in `property` jsonb).
Battle side: `application/combat/{encounter.go (pet participant), catch.go, rewards.go (pet exp 50 %, life drain 10)}`, `domain/combat/{turn_executor.go, pet_actions.go}`.
Quest awards (type 12) `application/quest/service.go` applyRewards (~1200); pet turn-in (require kind 3) same file ~818-1000.
Mount is NOT a pet feature: `application/mount/`, state in `character_feature_states` key `mount`; `beginMounting` is registered by the mount handler wrapper
(`cmd/gameserver/main.go:714`), pet `BeginMounting` is only its fallback (no push). Flying: `handlers/scene/movement.go:362-470` (level 50 + equip position 14).

Quirks worth remembering:
- Growth RPCs (petStar, petJoin, seniorPetJoin, petXd, petXsd, petPzXsd, petStarClear, toPetFeather*, toPetEnvolution, petEat) are cost-free stubs whose arg shapes
  do NOT match the Flash client calls (client passes item ids); `contractPet` in Go takes a creature id but Flash sends `_selectType` (gacha panel); `contractPetTen` unregistered.
- Pet `CurrentHP` is never persisted from battle (only life drains); level-up leaves CurrentHP at the old value. Item type 506 doubles as "cre book" (i1 = creature id) in
  `effect_cre_book.go` but all 506 rows are use_type 2 (skill books) so it is dormant.
- `data_tbl_creature.catchable` is the catch DIFFICULTY (client tooltip), Go only accepts == 1. Pet skill columns: `skill.cre_kind` = `classIds|minQLevel`.
- Pet stat formula reuses `domain/stats/profile.go BuildBaseStats` with growth scale = grow_rate + grow_rate_add (not x level) and att + (level-1).
- Pet equipment pos 50..57 -> `equ1..equ8`, sids 1001..1200 (25 groups x 8); `req_class` is matched against creature `class_ids`, `req_class_id` against template id.
