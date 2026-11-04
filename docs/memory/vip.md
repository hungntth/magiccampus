# VIP / PM (M8 phase B)

Plan: `docs/plans/2026-11-04_09_ACTIVITIES.md` (phase B notes). Shared `vip.ts`; server `modules/vip/`; client `game/VipController.ts`, `ui/vipPanel.ts`, `ui/vipShopView.ts`.
The panel opens from the HUD VIP button (it shows `VIP<n>`, grey at 0); strip icon 19 opens the shop tab.

- `initPmData` → `{flag: pmLevel, date, findback, processFlag, data{pmExp, activeType, keepDay, activeTime}}`. `getPmRightList` is an H5 rights-table read.
- `buyPm(1|2|3)`: 688 / 1688 / 2888 gold for 30 / 90 / 180 days, paid with existing gold (there is no top-up). A downgrade is refused while a package is active.
  - pmExp after a purchase = `max(pmExp + cost, threshold[type-1])`. This is H5's reading of Go.
- Level and daily exp:
  - pmLevel = max(level from the pmExp thresholds `[0, 15000, ..., 1105000]`, vipType), clamped 1–9.
  - The daily login PM exp is 500 / 1000 / 2000 by type.
  - pmLevel rides on `PlayerData`, `PlayerUpdate`, `SceneCharacter` and chat `onSay`.
- `doPmOperation(rightId)` has real rules for rights 1, 2, 3, 7, 10, 13 and 24. Progress is marked **before** the reward is paid.
  - Right 1 is capped at one level's exp a day (H5; e.g. 122 400 at Lv 30). Tune it in `pm-rules.ts` `expRewardAmount`.
  - Right 2 pays goldBind. Right 3's buff lasts until the next UTC+7 midnight.
  - Right 13's transform shows from the next map entry (the client has no live `onSetRes`).
  - Right 24 (findback) pays yesterday's missed rights 1, 2 and 7; Go only cleared the flag.
  - Other rights are display only. The opener buttons for rights 18 and 25 are not done.
- Pushes: `flushProcesFlag`, `updateScenePmLevel`, `onSetRes`.
- VIP shop over shop 99: `getVipShopConfig`, `getVipShopCharConfig` (refresh 20 gold, 5 a day), `buyVipShopItem(slotId, num)` with `num` forced to 1.
  - The rotation is a weighted draw by slot `r`. It needs pmLevel > 0 and uses the shop buy pipeline.
