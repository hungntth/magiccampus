---
name: m11-mail
description: M11 phase A mail/escrow wiring facts, ws smoke bot recipe, pitfalls (heredoc backticks, loginExtra hook)
metadata:
  type: project
---

- Mail module `server/src/modules/mail/`; public API `MailSystemService.sendSystemMail` (escrow `fromRef`, idempotent `source`); escrow in `inventory/escrow.service.ts` (slotType 90, characterId 0, `escrowRef`). Phase B auction must `escrow.registerOwner('auction', ...)`.
- Login hooks without a session: `CharacterService.addLoginExtra(cid => ...)` runs once per chooseCharactor; schedule timers there and look the session up with `SceneManager.findByCharacter` at fire time.
- Smoke: scratchpad `mail_bot.mjs` (A hudtest cid1 Han, B watchbot cid5 WatchBot; scenarios all/ret2/full/take/race/exp/show) + `mail_fix.js` (pet 900001 for A) via `docker exec -i mcgame-mongo mongosh mcgame --quiet < file.js`. Expiry test: age `mails.createdAt` by 31 days then B `showMailP`.
- Edit pitfalls: `node -e "..."` in bash with template-literal backticks inside double quotes executes them (text vanishes); use the Write tool for scripts or the Edit tool. A heredoc containing apostrophes aborts the whole bash command.
- Mongoose `escrowRef` needs `@Prop({ type: String ... })` explicit type (optional props lose reflection).
- Browser: HUD mail envelope is `.mail-notice .env`; screenshots lag one frame, re-take; panel opens via the notice tip button (NPC click needs proximity).
