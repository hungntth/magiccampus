# Main HUD (portraits, minimap strip, chat, menu bar, shortcut bar)

Implemented 2026-11-03. Research: `docs/research/2026-11-03_03_MAIN_HUD_PORTRAIT_RESEARCH.md`,
`..._04_MAIN_HUD_MINIMAP_RESEARCH.md`, `..._05_MAIN_HUD_BARS_CHAT_RESEARCH.md` (legacy MainLayer / compMain).

## Art
- Original Flex skins come from the main client `E:/mcgame/frontend/s/6a41a5ba…orig` (XOR[1,2,0]-wrapped CWS,
  "BUS" magic). `tools/swf` `swfui` renders every `_embed_css_` symbol to PNG + `index.json` {w,h,ox,oy}
  (ox/oy = registration point, e.g. `button_task_up_mc` is center-registered: legacy x375/y23 is its center).
- Generated into `client/public/ui/<lib>/<symbol>.png` (MainStage_* only); never hand-edit, regenerate:
  `pnpm --filter @mc/swf-tools swfui -out ../../client/public/ui -xor 1,2,0 -match _embed_css__style_MainStage_ E:/mcgame/frontend/s/6a41a5ba5c0006ab4e0c1321a2b05027.orig`
- Style names → symbols were matched by name/size (the CSS → symbol mapping lives in compiled ABC closures).
  Not found as art: `BtnStdRed`, `RightButtonBackground`, `CanvasSkillBar`, VIP button → drawn in CSS (`hud.css`).

## Client (`client/src/ui/hud/`)
- `skin.ts` (loadSkins before the scene, skinImage/skinButton with up/over/down via CSS vars), `portrait.ts`
  (PortraitCanvas 2,5 192x57 + PetCanvas 2,67 empty state), `miniMap.ts` (right0/top0 220 wide), `systemBar.ts`
  (menu icons + key shortcuts R A C B W T S K Q E, ignored while an input has focus), `userBar.ts` (right0/bottom44),
  `mainHud.ts` composes them; `ui/chat.ts` ChatBox = ChatCanvas tabs + chat input row.
- Location text "1 - <map> <x/10>,<y/10>" (H5 has a single line, so the line prefix is always 1).
- Exp bar = progress inside the current level from cumulative `exp` and `LEVEL_EXP`; SP has no data yet (empty bar).
- Every panel button/shortcut only toasts "Tính năng đang phát triển"; PK toggle is local (legacy `uif apvp` not ported).
- The chat log area is click-through (pointer-events none) so map clicks behind it still walk; tabs/buttons are clickable.
- Chat tabs filter by kind (Toàn Bộ all, Thế Giới, Hiện tại, Hệ thống; others empty); send channels Hiện tại/Thế giới.

## Server
- `modules/system/system.rpc.ts`: `checkNetDelay()` → `NetDelayReply` (epoch ms), requireAuth, **not quiet yet**.
  Client pings on scene start and every 10 s; delay = round(rtt/2), states Rất tốt/Tốt/Bình Thường/Yếu/Rất yếu
  at ≤50/100/300/500 ms.

## Deferred
Activity icon strip (ActivityCanvas), TargetCanvas radial menu, potion reserve buttons, Up/lvUp flow, VIP panel,
line change, emoji popup, whisper/guild/team channels, skill slots, chat height persistence, every panel.

## Seeds (2026-11-03 run)
Legacy now lives at E:/mcgame. Newer seed dumps:  uses  (imported as the import time),
 has no column list (KNOWN_COLUMNS from the baseline migration). Verified: 5530 quests, quest 1 = 240->231.

## Notes from the first in-game run (2026-11-03)
- The chat log area is click-through (pointer-events none) so map clicks behind it still walk; tabs/buttons stay clickable.
- Legacy now lives at E:/mcgame (`ASSET_DIR` / `SEED_DIR` in server/.env). Newer seed dumps: `game_tuning_crosscontention`
  uses `now()` (imported as the import time); `data_tbl_quest` has no column list (KNOWN_COLUMNS from the baseline
  migration). Verified: 5530 quests, quest 1 = 240 -> 231.
