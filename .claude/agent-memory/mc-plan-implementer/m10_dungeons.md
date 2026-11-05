---
name: m10-dungeons
description: M10 dungeons plan (A-I implemented 2026-11-05), framework wiring, parallel-agent recipe, bot test recipe and pitfalls
metadata:
  type: project
---

- Plan `docs/plans/2026-11-04_13_DUNGEONS.md`: phases A-I implemented 2026-11-05 (notes per phase at the end). Memory docs:
  `docs/memory/{dungeons,star-instance,maze,quiz,training,boss-towers,world-boss}.md`. Open: tower / boss balance vs H5 damage.
- Adding a dungeon: `enabled: true` + real floors in shared `dungeonDefs.ts`, `modules/dungeon/<key>/` hooks provider registered in
  `dungeon.module.ts`; spawns reuse template ids or instance ids without a data_tbl_npc row (clickNpc resolves both via providers).
- Parallel implementers worked well for C-I: write a shared rules file (scratchpad `common_prompt.md`) and spawn one
  mc-plan-implementer per module with `run_in_background: false` in ONE message (they run concurrently, results come back to you;
  background agents report to the main session instead). Tell them not to smoke-test (dev server restarts on every edit); the parent
  smoke-tests afterwards with the bot. One agent owning a shared schema (towers) must run first.
- Bot: scratchpad `p3_bot.mjs` (A hudtest cid 1, B watchbot cid 5, C lhbot cid 6 — all gmLevel 1, boosted; party step needs all three
  on the same map; steps fight / sfight (npcScript then play) / enc (cbom) / npcs (createNpcs) / lastans / play). finishQuest needs
  `{i, n}` (bare id has npcId -1 → "Không thể trả nhiệm vụ ở đây"). Fast-forward via mongosh (`runs.<key>.beaten`, quest_history
  upserts, objectives current).
- Pitfalls: `cat > file` / `cat >> file` without stdin hangs the Bash tool; shared test script lists files explicitly (new
  `*.test.ts` must be appended in packages/shared/package.json).
