# VIP / PM (M8 phase B)

Plan: `docs/plans/2026-11-04_09_ACTIVITIES.md` (phase B notes). Shared `vip.ts`; server `modules/vip/`; client `game/VipController.ts`, `ui/vipPanel.ts`, `ui/vipShopView.ts`.
The panel opens from the HUD VIP button (static "VIP" label like Flash); strip icon 19 opens the shop window. No tab strip:
'vip' = the Flash PmPanel 500x340 layout in pure CSS (`vip.css`): avatar + "Thành viên <level colour name>:name" (PM_PANEL[11..19]),
"Giới thiệu" (toggles a points-per-level list), 9 CSS level gems (`ui/vipGem.ts`, shared with the HUD) at pmImage x positions (click = view that level, unreached grey),
segmented PM exp bar (8 glossy, visibly separated segments, one per gem gap in the colour of the level it leads to; hover reveals current/next VIP experience), 3 card slots Nửa Năm / Quý / Tháng + Mua positioned below the bar, rights box with "Dừng đến" and green
Nhận / Mở / red Đã nhận links; 'shop' keeps the .act-win look. The title bar has z-index above the full-size body (drag).
HUD portrait: `selfHeadPMFlag` = the level gem over the head's top-left corner (hidden at VIP 0). The same CSS gem evolves from a simple diamond at VIP 1 to increasingly faceted, angular badges through VIP 9; its segmented progress bar uses a continuous glossy gradient.

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
  - Right 13's transform lasts until the next UTC+7 midnight and is swapped live by `onSetRes` (handled in `DungeonController`).
    Like Go, it comes with buff 2730 "Biến Hình Kỳ Lạ" (`PM_TRANSFORM_BUFF_ID`, removable). Clicking it asks
    "Bạn có muốn hủy hiệu ứng biến hình không?" (`buffBar.ts`; the tooltip text is overridden because the template's is the Halloween one).
    Removal by click or by the buff bar's 10 s expiry timer goes through `delBuffClient` → `BuffService.onRemoved` hook →
    `PmTransformService` (rule `revertsTransform`) → transform cleared + `onSetRes` with the base look (self + map).
    `transform.pm = true` marks the right-13 slot so the hook never clears the Mê Huyễn curse, which borrows the slot.
    Transforms claimed before 2026-11-07 21:00 have no buff and no `pm` flag; they just end at midnight.
  - Right 24 (findback) pays yesterday's missed rights 1, 2 and 7; Go only cleared the flag.
  - Other rights are display only. The opener buttons for rights 18 and 25 are not done.
- Pushes: `flushProcesFlag`, `updateScenePmLevel`, `onSetRes`.
- VIP shop over shop 99: `getVipShopConfig`, `getVipShopCharConfig` (refresh 20 gold, 5 a day), `buyVipShopItem(slotId, num)` with `num` forced to 1.
  - The rotation is a weighted draw by slot `r`. It needs pmLevel > 0 and uses the shop buy pipeline.
