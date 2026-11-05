---
name: m11-auction
description: M11 phase B auction wiring facts, fixture + bot recipe, pitfalls (listing row as saga log, PM test, browser NPC click)
metadata:
  type: project
---

- Module `server/src/modules/auction/`; listing row is the saga log (`status`, `mailed`, `refundDue`, `bidSeq`); mails derive from it via pure `mailPlans` (idempotent sources `auction:<id>:goods|price|refund:<seq>`); sweeper `retryPending` finishes owed mails.
- Smoke: scratchpad `auc_fix.js` (hudtest items 950001..6 incl. equip 152, pets 950101/2, wallets; run via `docker exec -i mcgame-mongo mongosh mcgame --quiet < auc_fix.js`), `auc_bot.mjs` (full 3-bot scenario, ~90 s incl. the 60 s sweeper wait; mongo via execFileSync, no shell quoting), `auc_pm.mjs` (PM batch: set `character_vip` hudtest `vipType:3, expiresAt:4102444800000`, restore `vipType:0, expiresAt:0` afterwards), `auc_clean.mjs` (cancel active ids + take mails; edit the id list).
- Browser: set hudtest `mapId 9, posX 3490, posY 1300` in Mongo before login, click the white-haired NPC "Quản Lý Đấu Giá" (~445,215 in the 800x523 frame); screenshots lag one frame, retake. Restore map 30 / 1245 / 511 afterwards.
- Edit pitfalls: `node -e` string replace with CRLF files (GameScene.ts, npc.rpc.ts): normalise `\r\n` -> `\n` then back; app.module.ts is LF.
- A refused listing burns a counter id (id allocated before the goods are parked).
