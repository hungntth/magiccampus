---
name: item-use-client-map
description: Where bag item use is decided in the decompiled client (Player.useItem) and the invisible parts
metadata:
  type: reference
---

- All bag use goes through `object/Player.as:792 useItem(targetType, petId, slotId, ctrlToPet)`; it holds gating (useType 1/3 char, 2/3 pet, reqLevel, reqClass),
  type 509/520 branches and ~60 hard-coded `ItemConfig` template ids (special dialogs, `useMultiItem` quantity prompt). Only types 509 and 520 branch by `type`.
- `BagPanel.as` is aborted: the bag double-click wiring is inferred from `Slot.EVENT_SLOT_DCLICK` / `Slot.actionOnItem`. `remote.useItem` has no Responder.
- Choose-one bags: push `itemMultitoSel(payload{packItemList,packGetNum}, packItemSid)` -> `MultiItemPanel.as` -> `selMultiItemByIdx(packItemSid, idx)` (reply int: <0 refuse, 0 done, n left).
- Full contract: `docs/research/2026-11-07_03_ITEM_USE_CLIENT_RESEARCH.md`.
