---
name: magic-weapon
description: M7 phase E pitfalls - magicweapon module layout, stone templates, artifact table semantics, equip-stats quirks, Vite/css and browser test tips
metadata:
  type: project
---

- Layout: `server/src/modules/magicweapon/` (pure `mw-rules.ts`, `mw-items.service.ts` load/stones/pushes, `magicweapon.service.ts` upgrade + `getMWPanel`, `mw-repair.service.ts`, `mw-ops.service.ts`); shared `packages/shared/src/magicWeapon.ts`; client `game/MagicWeaponController.ts` + `ui/mw/`. `FeatureWindow` takes `{title, tabs, cls}` so new windows reuse the Tu luyen shell.
- Legacy stone "item types" 510/511/514/519/522 are item TEMPLATES 2330/2331/2356/3228/4758 (`MW_STONE_TID`); stones are consumed by template via `inventory.removeByTemplate` (stone id RPC args only validated).
- `character_items.properties` of a magic weapon: `mainProp/Num 1,2`, `t1..t10` = SKILL ids (never gems: gear provider passes no gems for kind 8; skill ids collide with gem template ids), `flag` JSON string (sub lines). `star` = upgrade level; `equipBonusesOf` skips the star multiplier for kind 8.
- `data_tbl_artifact`: row = reaching that level; rate % / item_num (4758 crystals) / spirit_num per attempt; level 1 row = 0.9 x template, so fresh grants (`gmGrant equip`) start at floor(0.9 x template) and upgrades use `max(current, row)`.
- Vite on Windows sometimes misses the second write of a file (appended CSS not served): `touch` the file, check with `curl http://localhost:5173/src/...`. JS edits reload the page to login (relogin: form_input refs + `.char-list .char-card` + `.panel > button`).
- Browser flow: seed account with a ws bot (`mw_seed.mjs`: register, grants, level via mongosh), login in the pane, `C` key, `.char-tab` "Thần khí", `.char-mwtools` buttons, window `.mw-window .ft-tab[data-tab=i]`; confirm dialog = `.confirm-dialog button` first. nest --watch restarts drop the socket: finish server edits before browser runs. A heredoc with apostrophes aborts silently: use the Write tool for sources.
