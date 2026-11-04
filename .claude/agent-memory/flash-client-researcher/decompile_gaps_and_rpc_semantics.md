---
name: decompile-gaps-and-rpc-semantics
description: Which legacy Flash classes are empty (decompile aborted) and how RemoteObj sends RPCs/throttles; check before hunting push handlers
metadata:
  type: reference
---

- `system/CallBack.as` (all `on*` pushes except guild/login/shop in `CallBackGlobal.as`) and `view/view/compDragable/BagPanel.as`
  are **aborted stubs** ("trait count exceeds set limit"). Push payloads must be derived from consumers (panels reading
  `_core.player.*`, `_core.data.sList`) or from the Go server (`D:\mcgame\internal\presentation\rtmp\handlers\`). Don't waste greps on `onUPP`.
- RPC style: `_core.remote.foo(a,b)` = fire-and-forget (Proxy `callProperty`, `rpc/RemoteObj.as:89`); `_core.remote.call("foo", new Responder(fn), a, b)`
  = awaits reply. `config/RPCConfig.as` `RPC_DELAY` silently DROPS calls inside the window (useItem 800, equip/move/drop 1100, bagSort 3000).
- Slot identifiers: slots use global sid (`Slot.index`; equip 1..22, bag 2101..2370); item actions (equipOn/useItem/dropItem) use item instance id (`slotData.id`).
- Panels are MXML-compiled: UI labels are either `Language.*` constants or inline `"text":"..."` in `UIComponentDescriptor`s; map label->control by x/y coordinates.
- Language.as arrays are `NAME_S` / `NAME_U` (UI); index bindings are in `_X_bindingExprs()` of each panel.
- Feature research outputs live in `D:\mc-game-new\docs\research\` (e.g. 2026-11-04_01_CHARACTER_CORE_CLIENT_RESEARCH.md).
