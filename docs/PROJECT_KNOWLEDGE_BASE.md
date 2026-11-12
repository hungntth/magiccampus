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
- [Social](memory/social.md) — whisper/p2pWisper, player menu, showChaInfo, friends, blacklist, enemies, friend request prompt, intimacy (relationships, initViewImC, useIntimacyItem; M14 A).
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
- [Wings - Cải tạo cánh (M13 C)](memory/wings.md) — 20 wing RPCs (join, stars, holes, feathers, prefix / bind / dye / look, advance), wing stats + pet feathers, wing layer + onWingOn / setWingHide, wing panel.
- [Dress system - Tủ Đồ (M13 B)](memory/dress.md) — 17 dress RPCs + getDressCatalog, draws / chips / transform / exchange, dress-book stats, fake look, forge gate, Tủ Đồ panel.
- [Mật Bảo + Lò luyện thần bí (M13 F)](memory/mystery-treasure.md) — 11 Mật Bảo RPCs + furnace (items / scores) + H5 catalog / info, 50 crafts a day, books 5042-5107 via item-use, collection stat provider, dissolve -> Bí Ngân + runes / chips, Mật Bảo tab + furnace window.
- [Tiểu Tinh Linh (M13 G, fairy)](memory/fairy.md) — 12 fairy RPCs, NPC 1726 adopt / shop 96 / gift bags, grow / feed / raise / skills / skins, guard look `av.fairy` + onFairyOn/Off, owner stat provider, G2 battle accessor (client pending).
- [Chân Hồn Thần Thú (M13 G, PRS)](memory/prs.md) — 14 PRS RPCs, soul tree + Thần Dụ forms on the battle pet, chips / exchange slots / crystal exchange, collects, map-wide form look, strip icon 58.
- [Năng Lượng Tự Nhiên (M13 F)](memory/astrology.md) — 4 astrology RPCs, noon-to-noon cycle, deterministic formulas, first-completion x11 + announcement, record feed, panel.
- [Ấn Chương (M13 E2)](memory/medal.md) — 5 medal RPCs + catalog, bag / worn slots, engrave lines, level up / dissolve, character + pet stat providers, medal exp items, medal window.
- [Ấn Thạch (M13 E2)](memory/stone-seal.md) — 7 stone seal RPCs (`{flag, data, view}`), bore / succinct costs, stone + add-line stats, stone seal window.
- [Ma Tâm (M13 E2)](memory/monster-heart.md) — 8 monster heart RPCs + catalog, Ma Tâm opener (type 550 / one-key temp bag), combines, fusion, container, stat provider, Ma Tâm window.
- [Hồn Khí + Phù Văn (M13 E1)](memory/rune-deco.md) — 10 deco RPCs + 8 rune RPCs, Bí Ngân / rune exp, deco + rune stat providers (character and pet page), deco look layers (onDeco*), Hồn Khí window.
- [Equipment depth (M13 D)](memory/equip-depth.md) — 11 RPCs: character Thăng hoa / Khắc chế, Kỳ Linh / Trùng Chú, jewel exchange, isEquSid; `properties.sublime` / `qiling`, set bonus stats, forge tabs + Kỳ Linh strip entry.
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
- [3v3 Chiến Trường Dũng Sĩ (M14)](memory/threepvp.md) — Friday arena on map 73: rooms, matching on system PvP, points / medals / titles, shop 85 price type 7, NPC 1860, GM window.
- [Mentor / Sư đồ (M14 B)](memory/mentor.md) — mentor_links + rank row, find / accept / report / upgrade / delete RPCs, NPC 49 menu (hub instance NPC) and quest 692 qualification, IM tab.
- [Sworn brotherhood / Kết bái (M14 C)](memory/brotherhood.md) — brotherhoods + members, ceremonies (swear / join / disband), title 153 + broT suffix, NPC 1637 menu, IM tab.
- [Marriage / Kết hôn (M14 D + E)](memory/marriage.md) — marriages + seek board + proposals, couple rows / skills, `onInitCouple`, couple rank, divorce card, Cupid / Nguyệt Lão NPC marriage, IM header + manager window; wedding hall (booking, scheduler, vows / rings, invitations, red envelope).
