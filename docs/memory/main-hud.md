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
  Not found as art: `BtnStdRed`, `RightButtonBackground`, `CanvasSkillBar` → drawn in CSS (`hud.css`).
  "Up" and "VIP" are both Flash `BtnLevelUp` 46x22 at (198,0)/(198,30): `MainStage_CharInfo/LevelUp*` (39x19) stretched + a
  static white label (`PORTRAITCANVAS_U[0]`/`[3]`, no VIP level in the label) — `.hud-label-btn` in `portrait.ts`.

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

## Responsive stage (2026-11-03)
- Legacy: 900x570 Flex stage (`GamePredef.APP_WIDTH/APP_HEIGHT`) embedded at 100%, drawn 1:1, widgets anchored by
  constraints; no scaleMode/resize code. H5 keeps that: `ui/stage.ts` sizes `#stage` (inside the safe-area
  `#stage-frame`) to the viewport in stage pixels with scale = min(1, w/900, h/570), `transform: scale()`.
  >= 900x570 is exactly the original 1:1; smaller windows/phones scale everything uniformly so anchors never overlap.
- In-game DOM (HUD, chat, quest tracker/panel, NPC dialog) mounts in `#stage`; login/char select and toasts stay in
  `#ui` (unscaled, H5-only screens). GameScene's `root` container gets the same scale; camera uses screen/scale.
- While an input is focused the scale is frozen (soft keyboard only re-anchors the bottom edge); re-fit on focusout.
- Hover skins are under `@media (hover: hover)`; portrait + coarse pointer shows "Xoay ngang thiết bị để chơi".
- Pixi renders at min(devicePixelRatio, 2) with autoDensity.

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

## Layout and remembered positions (2026-11-04)
- The minimap funCanvas column (Nạp … Bay) is vertically centred on the stage: `top: max(135px, 50% - 131px)`
  (`FUN_TOP` in `hud/miniMap.ts`; `.hud-minimap` is full stage height). The quest tracker's default top matches it
  (`style.css` `.quest-tracker`).
- `makeDraggable(panel, handle, key)` (`ui/panelBehavior.ts`): with a key the last dropped position is saved in
  localStorage `mc.pos.<key>` and applied when the panel opens (clamped to the current stage). Every window passes its
  file name as the key; `openActWindow` uses `act.<cls>`; private chat windows are not remembered (several at once). It
  also assigns an increasing z-index when a window opens or receives a pointer event, so the active full panel (including
  its internally layered children) is always above the others.
  The quest tracker drags by its "Nhiệm vụ" title row (key `questTracker`).

## Character select screen (2026-11-04)
- `ui/charSelect.ts` + `charSelect.css` port Flash `compFore/CharSelectCanvas` (research
  `docs/research/2026-11-04_19_CHAR_SELECT_CLIENT_RESEARCH.md`): 900x570 frame scaled to fit over `/img/login-bg.jpg`
  (copied from legacy `h5/public/img`), class preview = `ClassInfo.largeImg*` (static PNG, not a sprite), 3 slot cards per
  page with arrows past 3, buttons Vào game / Xóa nhân vật (always disabled, as in Flash) / Tạo nhân vật (< 3 chars) /
  Quay lại (`logout`, back to login on the same socket), "Tạo lại pass" = toast (setDeletePass not ported).
- Login (`ui/loginScreen.ts`, legacy LoginCanvas): same 900x570 frame, CanvasLogined panel 287x130 at x300/bottom 40,
  "Vào game" title, ID/Pass `InputBox` fields, "Lưu" remembers the account name (localStorage `mc.loginName`, never the
  password), Đăng nhập / Đăng ký widened to 90px and centred ("Bắt buộc" force login and proxy not ported).
- Skins: `client/public/ui/LoginStage_LoginStage/*` extracted with `swfui -match '_embed_css_.*LoginStage_'` into a scratch
  dir, folder copied and its entries appended to `ui/index.json` (swfui rewrites index.json, never point it at public/ui).

- M9 phase G: see `settings.md` (tray Thiết lập / Bản đồ / Trợ giúp, keys P / M / H, chat emotion popup and typed emotion codes).
- Minimap location strip: no "Đổi kênh" / clock buttons and no "1 - " channel prefix (H5 has one line): "<map> <x>,<y>".
