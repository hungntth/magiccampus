# System settings, unstuck, world map, help, emotions (M9 phase G)

Plan: `docs/plans/2026-11-04_12_CORE_LOOP.md` (phase G notes).

## Contract
- Shared `settings.ts`: `SystemSettingKey`, `SYSTEM_SETTING_DEFAULTS` (merged into login `interfaceData`), `validSystemSetting`
  (maxView 1..200, others bool or 0/1), `settingOn`, `PERMISSION_TEXT`, `SYSTEM_TEXT`, `UNSTUCK_WAIT_MS` / `UNSTUCK_LIMIT_MS`,
  `EMOTION_CODES` (panel order) / `EMOTION_RES` (resource codes) / `emotionOf`.
- `us(map)` -> `{success:true}`: whitelist `ubl` + system keys (`settings/us-value.ts`), unknown keys ignored, bad value -> invalid args.
- `toMovable()` (`scene/unstuck.rpc.ts`): safe point of the current map, `onSceneEnter`; in battle `onMidNote`; busy / < 18.1 s ignored.
- Gates (H5 decision 13, Go never enforced them): `ag` -> groupInvite note, `achat` -> wisper / p2pWisper note, `at` -> newTrade reply,
  texts `<name> không nhận lời mời nhóm.` / `... tin nhắn riêng.` / `... giao dịch.` (`settings/permission.service.ts`, own module).

## Client
- `ui/systemSettingsPanel.ts` (P, minimap Thiết lập), `ui/worldMap/worldMapPanel.ts` + `pins.ts` (M, Earth; art `public/ui/world`),
  `ui/helpPanel.ts` (H, Help; `public/help/help.json` from `pnpm --filter @mc/server help:xml`), `ui/unstuck.ts` (Tín hiệu / Tự cứu),
  `ui/emojiPopup.ts` (chat ☺) + `game/EmotionBubble.ts` (`sheets/emotion`, 3 s), `game/ViewSettings.ts` (hc / hn / maxView / ac).
- All panels are owned by `MainHud` (`panels`), keys through the `SystemBar` key map.

## Inert / deferred
- Shown but inert: am, he, hm, dressHide, flyEffect, hpmf, nlws, cf, image quality (localStorage `mc.quality`), bfr (hidden).
- Deferred: Thiết lập chat, the local map (~), the help GM tab and forum link, emotions 05 / 22 / 23 (SWF does not render).
