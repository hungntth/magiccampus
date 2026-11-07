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
- [Auto battle](memory/auto-battle.md) — client-side auto chain, uif/skillSetBattle settings (modules/settings), PvE no round cap.
- [Skills](memory/skills.md) — skill window, learn/upgrade/books, Luyện training bonus, class rank cl, expSkill pool.
- [Hotbar](memory/hotbar.md) — 30-slot st/sid interfaceData keys, skillSetUserBar, uif/us, keys 1-0, battle bridge.
- [Relive & blood bag](memory/blood-bag.md) — relive modes 1/2/3, Hình Nhân, toSafe durability penalty, Túi cứu thương pools.
- [Character stats, equip, potions, buffs](memory/character-stats.md) — legacy stat formula, changeProperty/lvUp, equipOn/equipOff, useItem + HP/MP recover, character_buffs, Nhân vật panel.
- [System settings, unstuck, world map, help, emotions (M9 G)](memory/settings.md)
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
- [Appearance + flying (M13 A)](memory/appearance.md) — avatar resolver (`av`), costume / flyer / mount layers, beginFlying / stopFlying / fixFlyState, setDressHide, AvatarView + AppearanceController.
- [Activities](memory/activities.md) — UTC+7 day keys, activity strip, sign-in, diary + DiaryEvents, online/offline exp, festivals, daily boss, lotto, prabuff, mount.
- [VIP](memory/vip.md) — PM packages and levels, daily rights (mark-first), findback, VIP shop rotation.
- [Loop quests](memory/loop-quest.md) — TBL_QUEST_LOOP take/cancel/repair, playable round pools, round rewards, [Vòng] NPC entries.
- [Pets](memory/pets.md) — pets collection, growth-scale stats, quest award, panel, map follow, battle pet at slot+5, catch, kind-3 objectives, pet skills/equipment/slots.
- [M12 pet depth handoff](memory/pet-depth.md) — implemented M12 slices, verified status, remaining parity work and safe continuation order.
- [Trade](memory/trade.md) — newTrade/tradeLock/tradeConfirm/stopTrade, saga swap under two char locks.
- [Mail (M11)](memory/mail.md) — Thùng Thư, escrow by row move, public sendSystemMail API, quiz / world boss mail.
- [Temp bags + bank extras (M11)](memory/temp-bag.md) — Túi Tiện Dụng (normal + Ma Tâm), Túi tạm thời, loot routing, bankSort / bagToBank / delBagItems.
- [Auction (M11)](memory/auction.md) — Đấu giá: listing / bid / buy-out / cancel / expiry sagas over escrow + system mail, PM batch, panel.
- [Map portals](memory/portal.md) — transport gates: createSceneItems, legacy sceneChange(gateId) + onSceneEnter, destination/landing rules, swfanim gate art.
- [Movement](memory/movement.md) — click-to-move A* over the hit mask (legacy SingleAstarRoute + key points), walkTo helper.
- [Dungeons (M10)](memory/dungeons.md) — seed overlays, NPC script menus + hooks, instance NPCs, battle ctx/hooks, daily quests, boss mechanics, phụ bản framework + all nine dungeons, quick complete (auto-task).
- [Star instance (M10)](memory/star-instance.md) — Tinh Giới Thập Nhị Cung war map, star battle report, task sweep.
- [Maze (M10)](memory/maze.md) — Mê Trận copy rooms, board/events, push order.
- [Daily answer + quiz (M10)](memory/quiz.md) — NPC 9001 daily answer, Đố Vui Có Thưởng event.
- [Training (M10)](memory/training.md) — HMTXL room, Ảo Ma Tháp, TXKC, Vô Danh Động, Mật Đạo.
- [Boss towers (M10)](memory/boss-towers.md) — nine boss, corridor, trials (VDRL), flop pass; character_towers state.
- [World boss (M10)](memory/world-boss.md) — world boss event, schedule-boss respawn, boss loot.
- [Item use effects](memory/item-use.md) — useItem dispatcher + ItemUseRegistry, award bags, money chests / kim phieu / mystery key, description-bag parser, currency / stone / pet bags, choose-one gift boxes, buff foods, rule potions, pet-target items, useMultiItem, exp / encounter books, attribute reset, mount dress bags, gacha boxes (phases A-G, complete).
