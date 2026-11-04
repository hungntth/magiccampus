# Project Knowledge Base

Index only — one line per document, no content here. Per-feature knowledge lives in `docs/memory/`;
research in `docs/research/`, plans in `docs/plans/` (naming rules in `CLAUDE.md` § Docs Workflow).
Legacy (Go/Flash) knowledge: `D:\mcgame\docs\PROJECT_KNOWLEDGE_BASE.md`.

## Guides

- [Asset pipeline](assets-pipeline.md) — SWF → PNG atlas/JSON sheets and hit masks, `tools/swf` usage and formats.

## Feature memory

- [SWF tools](memory/swf-tools.md) — Go → TypeScript port of `tools/swf`: parity results, known output differences, gotchas.
- [NPC shop (view only)](memory/shop.md) — onOpenShop push, slot/price mapping, paged Shop window; buy/sell now in inventory.md.
- [Bag + shop buy/sell](memory/inventory.md) — character_items, getInitSlot, buyAmountItemClient, sellItem, Túi đồ panel, move/split/drop/sort.
- [Character stats, equip, potions, buffs](memory/character-stats.md) — legacy stat formula, changeProperty/lvUp, equipOn/equipOff, useItem + HP/MP recover, character_buffs, Nhân vật panel.
- [NPC dialog](memory/npc-dialog.md) — clickNpc RPC, npcFuncInit push, speech bubble vs Đối thoại dialog, client walk-to flow.
- [Quests](memory/quest.md) — newbie/main quest chain: take/finish/cancel/initQuestManager, NPC markers, tracker, exp/level-up, quest_pre import.
- [Main HUD](memory/main-hud.md) — legacy MainLayer HUD from extracted Flex skins: portraits, minimap strip + checkNetDelay, chat tabs, menu/shortcut bars.
- [Chat](memory/chat.md) — say/onChat, CSS chat box, PopupText speech bubble over speakers and NPCs.
- [Map portals](memory/portal.md) — transport gates: createSceneItems, legacy sceneChange(gateId) + onSceneEnter, destination/landing rules, swfanim gate art.
- [Movement](memory/movement.md) — click-to-move A* over the hit mask (legacy SingleAstarRoute + key points), walkTo helper.
