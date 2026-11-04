---
name: vip-phase-b
description: M8 phase B (VIP/PM + VIP shop) layout, wiring and test tips
metadata:
  type: project
---

- `modules/vip/`: `VipCoreModule` (PmStateService: doc, rights cache, `levelOf`, scene `decorate`) is imported by chat and scene; `VipModule` holds PmService/PmRewardService/VipShopService and registers `addLoginExtra`. All state updates use a `rev` CAS (`PmStateService.update`), mark-first then reward.
- Client: `VipController` is owned by `ActivityController` (GameScene is at its line cap: extend existing lines only; `HudActions.onVip`, `ActivityHost.refreshHud`).
- Test: scratchpad `vip_e2e.mjs` (+ `gbot.mjs`); fake audit with `character_vip.auditDay:'2000-01-01'` to raise findback; browser: register in-page, set `gold` via mongosh, DOM selectors `.hud-vip`, `.vip-card[data-card]`, `.vip-claim[data-right]`, `.vip-tabs [data-tab=shop]`, `[data-act=refresh]`.
