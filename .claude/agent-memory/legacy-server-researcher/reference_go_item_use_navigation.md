---
name: reference-go-item-use-navigation
description: Go useItem dispatch order, use_type 4 gate, which typed handlers are dead, where each effect family lives, data quirks
metadata:
  type: reference
---

`application/item/service.go` `initEffectHandlers` (~160) + `applyItemEffect` (~1215). Dispatch: id 719 no-op -> **`use_type==4` => ErrCannotUseItem** -> petGrow ids -> `templateHandlers[id]` -> `typeHandlers[type]` (terminal) -> award -> fallbacks. RPC layer `handlers/item/use.go` runs `use_template_hooks.go`, pet-equip route, `use_books.go` (life skill / recipe books, type 516 learned there) before the service.

- Dead typed handlers because all templates are use_type 4: 503, 504, 507, 512, 513, stubs 510-527/551/552. 506 (199 "Yếu Quyết") all have I1=0 -> refused. 520 has 0 templates. 521 (22) is use_type 2 stub.
- Type 500 handler: only expand books 324-326, 9 encounter books, 9 exp books, title-only awards do something; the other ~165 (Hồi Phù, 132 Bí Điển Tốn Phí) are consumed no-ops.
- 502 foods: 84 in `food_buff_table.go` + 4 wedding candies; 51 refused "chưa có hiệu quả sử dụng". I1..I3 of food/potion = recipe ids, never heals.
- Refusals are `keepItem(msg)` (ConsumeItem=false, message via onMidNote) or error notices via `use_notices.go` (onSystemMidMsgOrNote).
- Handlers for 550-type point/talent/spirituality/merit/soul/rune/pet-skill items are all inside `effect_quest_item.go` chain.
- Item and equipment template ids collide (41, 42, 128, 1063, 2137); hooks skip equipment instances.
- Buff stacking convention: `AddOrRefresh` with Duration = base + remaining time of same buffId; battle foods BattlesLeft = base + remaining.
- Full spec: docs/research/2026-11-07_02_ITEM_USE_TYPED_RESEARCH.md in magiccampus repo.
