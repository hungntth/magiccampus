---
name: m12-orchestration
description: M12 pet depth run 2026-11-05 - review-first of user hand-written code, 14 sequential helper slices, recurring bug classes
metadata:
  type: project
---

- M12 finished 2026-11-05 by one orchestrator + 14 sequential mc-plan-implementer helpers (8 server slices, 6 client slices),
  shared rules file in scratchpad `m12_prompt.md`. Each helper ~15-22 min, self smoke-tested with ws bots / browser.
- **Why review first:** the user's uncommitted M12 code did not boot (Nest module cycle PetModule -> PetBoostModule ->
  Progression -> ... -> PetModule) although lint/tests were green; also unit mix-ups (aptitude per-mille added to attribute
  points), off-by-one table indexes, free-reroll exploits, charge-before-validate, mojibake strings.
  **How to apply:** before extending user-written code, boot the server and read it against the legacy Go; list concrete
  bugs per slice in the helper prompt (helpers then verify + fix them).
- Coordinator may ask to parallelize late; check what is actually left first (all panels were already done).
- Generated client static tables (`server/tools/gen-pet-*.ts` -> shared `pet*Data.ts`) are the pattern for static data the
  client needs; re-run after `pnpm import:seeds`.
