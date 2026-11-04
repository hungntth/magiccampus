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
- [Combat](memory/combat.md) — cbom encounters, battleUpdateCmd rounds, Go V1 damage, settle/loot/kill credit, quest-battle NPCs, revive, skills (character_skills).
- [Character stats, equip, potions, buffs](memory/character-stats.md) — legacy stat formula, changeProperty/lvUp, equipOn/equipOff, useItem + HP/MP recover, character_buffs, Nhân vật panel.
- [NPC dialog](memory/npc-dialog.md) — clickNpc RPC, npcFuncInit push, speech bubble vs Đối thoại dialog, client walk-to flow.
- [Quests](memory/quest.md) — newbie/main quest chain: take/finish/cancel/initQuestManager, NPC markers, tracker, exp/level-up, quest_pre import.
- [Main HUD](memory/main-hud.md) — legacy MainLayer HUD from extracted Flex skins: portraits, minimap strip + checkNetDelay, chat tabs, menu/shortcut bars.
- [Chat](memory/chat.md) — legacy channel ids, say/onSay, world chat Loa rule, team channel, CSS chat box, PopupText speech bubble.
- [Social](memory/social.md) — whisper/p2pWisper, player menu, showChaInfo, friends and blacklist (relationships, initViewImC).
- [Party and group battle](memory/party.md) — PartyBook invites/leave/AFK, follower lock and trail, map follow, group battle roster/readiness/reward split.
- [Economy](memory/economy.md) — bank and bag pages (sid map, page books), repair, payment radios, mall, transport scrolls, rename card.
- [Forge](memory/forge.md) — equipment instance properties, crafting, material/gem mixing, star, sockets/gems, refine two-step, tier upgrade, resolve.
- [Guild](memory/guild.md) — guilds/members/ranks with enforced permissions, contribution, guild chat, bank + withdraw, extensions, buildings on map 49, guild skills.
- [PK](memory/pk.md) — uif apvp, PVPStartClient gates (forced pk maps, safe areas), PvP battle with guest slot swap, no rewards.
- [Rankings](memory/ranking.md) — rankGet top-100 lists (exp, money), 5-min cache, empty categories.
- [Progression foundation, titles, achievements](memory/progression.md) — stat provider registry, currencies, character_features, gmGrant, titles with buffs, achievement hooks and claims.
- [Stat-feature panels](memory/stat-features.md) — train soul, awakening, war sprite, magic crystal, heiyaoshi, zodiac stars (Tu luyện window).
- [Magic weapon](memory/magic-weapon.md) — Thần Khí slots 15-20, data_tbl_artifact upgrades, repair/resolve/transfer/reset.
- [Activities](memory/activities.md) — UTC+7 day keys, activity strip, sign-in, diary + DiaryEvents, online/offline exp, festivals, daily boss, lotto, prabuff, mount.
- [VIP](memory/vip.md) — PM packages and levels, daily rights (mark-first), findback, VIP shop rotation.
- [Loop quests](memory/loop-quest.md) — TBL_QUEST_LOOP take/cancel/repair, playable round pools, round rewards, [Vòng] NPC entries.
- [Pets](memory/pets.md) — pets collection, growth-scale stats, quest award, panel, map follow, battle pet at slot+5, catch, kind-3 objectives, pet skills/equipment/slots.
- [Trade](memory/trade.md) — newTrade/tradeLock/tradeConfirm/stopTrade, saga swap under two char locks.
- [Map portals](memory/portal.md) — transport gates: createSceneItems, legacy sceneChange(gateId) + onSceneEnter, destination/landing rules, swfanim gate art.
- [Movement](memory/movement.md) — click-to-move A* over the hit mask (legacy SingleAstarRoute + key points), walkTo helper.
