---
name: m12-ppve
description: M12 slice 7 facts - headless pet sim + PPVE wiring, Go script rules, smoke recipe, pool balance trap
metadata:
  type: project
---

- `modules/pet-battle/`: `simulatePetBattle` (pure, no roundCap so a draw is NOT_END) + `PetLineupService` + `ReplayStore`/`ReplayPlayerService` are exported for the arena slice; PpveStateService owns the `pet_pve` feature. PetBattleModule imports CombatModule (NpcSkillCatalog) and PetModule; nothing imports it.
- Go `scripted_pet.go` is the truth for cmdList targets: 50+k = opposing slot % 10 == 5+k (random fallback), rule 2 = max(atk, matk), rule 3 = absolute HP. Round index is 0-based in Go; our rounds are 1-based, so `(round - 1) % len`.
- `resolveRound` treats a pet on the enemy side as pvp (flee semantics, MAX_ROUNDS 30 -> FLED); the sim passes no cap and stops at 24 itself. A pet without a script is simply left out of the command Map (engine fallback).
- `changePPLoadingState` HIDES the PPVE loading overlay (sent first, even before a denial). H5 has no `onMidNote`: notes are `onSystemMidMsgOrNote`.
- The 2060* qLevel 1..3 creature pool is wildly uneven (lv29 attack p50 2k, p99 46k, max 254M): PPVE floors are spiky for any PRNG; this is inherited from Go. Scan recipe: scratchpad `m12g_scan.mjs <from> <to>` sets `state.ppvefloor` via mongosh and challenges once.
- Smoke recipe: scratchpad `m12g_fix.js` (bound pets 981001.. for hudtest, stashes wallet / pet_pve), `m12g_boost.js` (aptEx points, else pets are too weak to win), `m12g_bot.mjs <panel|config|win|loss|gold|carve>`, `m12g_full.js` (fills the bag + floor 9 for the mail fallback), `m12g_clean.js` (removes reward rows created after 2026-11-05T13:00Z, PPVE mails, restores gold / currencies). Reward items 4724 / 6516 stack into existing bag rows: remove them before testing the bag-full mail path.
- CRLF tip again: `fighters.ts` showed CRLF in `file` before an Edit; the Edit tool rewrote it as LF (git warns only). Heredocs with apostrophes (even quoted `<<'EOF'`) abort the whole bash call in this harness: write scripts and doc text with the Write tool and run them.
