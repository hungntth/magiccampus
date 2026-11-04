---
name: reference-go-progression-navigation
description: Go code map for stat-feature/progression panels (titles, achievements, MW, zodiac, heiyaoshi, war sprite, crystal, awaken, soul), dead-bonus traps, shadowed handlers, stale memory
metadata:
  type: reference
---

Verified 2026-11-04 (research `docs/research/2026-11-04_14_PROGRESSION_SERVER_RESEARCH.md`).

- Foundation: `application/statfeature/character.go:20` aggregates feature blobs (`character_stat_features` JSONB by feature_key) into one
  `EquipmentStatBonuses`; merged with gear in `application/item/equip_stats.go:25-63`; applied once in `domain/character/equip_stats.go:364`
  (attrs -> recalc -> flats -> floats -> percents). Feature/buff prop ids use `CommonFeaturePropToStat` (59/60 = finalPraDef/MagDef, NOT
  finalReduceHurt), equipment ids use `EquipmentPropToStat`. `data_tbl_stat_feature` is documentation only.
- **Dead bonus traps** (reader key != writer key): medal, PRS, astrology `starsNow`; no reader at all: monster heart, stone seal, soul gem,
  mystery treasure, fairy. Live: awakening (but only current row; client sums 1..L), train soul (current row, matches client), mount, zodiac
  stars, explorer medal, war sprite, heiyaoshi, prabuff (tracks 1,3,5,7), magic crystal, MW via item props.
- Titles: client link title->buff is `data_tbl_title.b` (448/472 resolve in data_tbl_buff); Go reads always-NULL `buff_id` so never applies.
  `get_character_titles` SQL has no `s` filter (ct includes special).
- Achievements: Go has snapshot+claim only, no progress writers; `achieveReqLog` should be keyed by requirement id (client). 588/739 require rows have num=0
  (threshold only in description text). Title reward must be parsed from `desc` ("Danh Hieu X"), name match is wrong.
- Handler shadowing: `activity/backlog_panels.go` (registered main.go:768, last) still shadows `stoneSealGetData` and `initPRSPanel`.
  `onGetMakeLimitTimes` registered by craft AND mysterytreasure. Stub list `handlers/stub/handler.go` has no overlap with these features.
- Star instance: `clickWarMap` never starts a battle (BattleTypeStarInstance never set) -> reward path dead; legacy memory claims otherwise.
- MW: `StageMagicWeapon` unreachable (artifact ratio >=1.0 from level 15; crystal id check compares template 522 which does not exist, real item is 4758 type 522).
  `data_tbl_artifact` = 6 main tids x 50 levels, rate/item_num ignored by Go. `MainGrowMultiplier` dead. Succinct lines not in stats.
- Currencies for these systems (ids 73-75, 215, 229-241) have no income in local data (creature_loot only type 29, `data_tbl_item_award` 0 rows).
- Client-derived tables (not in Mongo): magic crystal catalog, prabuff level/effect arrays, stone seal costs, fairy tables - transcribed in Go from `GamePredef.as`.
- Legacy memory stale: star-instance-system, stat-feature-foundation (medal/PRS "wired"), heiyaoshi (activate "not implemented"), mystery-treasure, magic-weapon (stage/formulas), title-system.
- Tooling note: python3 is not available in the bash tool here; use `node -e` for scripted edits. `mongosh` aggregate output can be huge (title group by k,t,s) - always project/limit.
