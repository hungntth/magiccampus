# Character Core (M1): stats, equipment, item use, buffs, bag ops — Implementation Plan

**Date**: 2026-11-04 · **Status**: Approved (2026-11-04, including the H5 decisions marked in §1)
**Goal**: the player opens a character panel (C key / HUD button) showing real stats computed with the legacy formula,
allocates free attribute points, equips and unequips gear (double-click or drag) that changes the stats, drinks HP/MP
potions (bag double-click or clicking the HUD HP/MP bar), sees buffs on the HUD, and manages the bag (drag to move,
swap or merge stacks, split a stack, discard, sort). Today stats are a placeholder formula (`100 + stamina*10`), the bag is
view-only (buy/sell), nothing can be equipped or used, and buffs do not exist.

Research base:
- `docs/research/2026-11-04_02_CHARACTER_CORE_SERVER_RESEARCH.md` — Go rules: formula + constants (§3.1), level/points
  (§3.2), changeProperty (§3.3), final assembly (§3.4), gear props (§3.5), buffs (§3.6, §3.11), HP/MP (§3.7), equip (§3.8),
  useItem (§3.9), bag ops (§3.10), push sequences (§6). **The implementer reads this file.**
- `docs/research/2026-11-04_01_CHARACTER_CORE_CLIENT_RESEARCH.md` — Flash contract: panel fields and labels (§1.2), changeProperty
  args (§1.3), manual lvUp (§1.4), equip slots (§1.6), equip args (§2.1), useItem gates and strings (§3.1), HUD potion click
  (§3.2), buff bar (§4), bag op args (§5). **The implementer reads this file.**
- `docs/memory/inventory.md` — current bag/shop implementation this plan extends.
- `docs/plans/2026-11-04_01_FEATURE_GAP_ROADMAP.md` — M1 scope.

## 1. Confirmed mechanics

Facts confirmed by Go code and the Flash client, unless marked *(H5 decision)*.

### 1.1 Stats
- Single formula for all classes; class differs only by `data_tbl_class` `att_*` (starting attributes) and `apt_*` (per-mille).
  Formula, constants and the 6-class Lv1 test-vector table: server research §3.1. Class 1 Lv5 vector: maxHp 472, maxMp 185, atk 112, def 165.
- Attribute value fed to the formula = base `att*` (class start + 1 per level gained) + distributed points `apt*`.
- Level-up: +5 free points and +1 to each of the 5 base attributes; HP/MP are **not** restored, only clamped to the new max.
  Auto level-up only while level < 20. From 20 on, the client sends `lvUp(level, md5pass|null)` and gets a boolean back. The client shows
  "Xác nhận thăng cấp?" first. Requires `level < 160` and enough exp. *(H5 decision)*: ignore the password arg (H5 has no secondary password).
- `changeProperty({addStrength, addAgility, addStamina, addIntelligence, addEnergy})` takes string values, and `""`, invalid or negative count as 0.
  - total ≤ 0: return `null` with no push.
  - total > free points: push `onSystemMidMsgOrNote('Không đủ điểm thuộc tính!')` and return `null`; all-or-nothing.
  - otherwise: increment the distributed counters, push the stat-refresh `onUPP`, and return `null`. No cost and no cap. Fire-and-forget on the client.
- Final assembly order (server research §3.4):
  1. Base stats.
  2. Gear and buff flat attribute bonuses are added to the attributes, then the base formula is recomputed.
  3. Other flat bonuses.
  4. Percent bonuses (`v + trunc(v*pct/100)`), only on maxHp/maxMp/maxSp/attack/magicAttack/defense/magicDefense/speed.
  5. `final*` aliases.
- Equipment prop ids 1–29 map to stats as listed in server research §3.5; 21 = Stamina, and only 24/25 are percent.
  - Template lines `main_prop1/2`+`main_prop_num1/2` and `prop1/2`+`prop_num1/2`; star multiplier 1 (no stars in M1).
  - `bind_prop_num` is added to the main line's prop whenever it is > 0, without checking whether the item is bound (Go code). *(H5 decision: keep legacy.)*
  - Durability never affects stats.
- Buff props use the common-feature dictionary (server research §3.6), with `percent_flag` 1 = percent.
- Panel labels (client research §1.2): Lực Strength, Xảo Agility, Nhẫn Stamina, Trí Intelligence, Thần Energy, Điểm free points.
- HP/MP current values are persisted. There is no out-of-battle regeneration.
- *(H5 decision)*: on load, clamp current HP/MP to the **effective** max (with gear and buffs), not the base max (legacy lossy quirk).

### 1.2 Equipment
- Equipped item: `slotType 1`, `slotIndex = position - 1`, `sid = position` (1..22). Slot table: server research §3.8 and client §1.6.
- `position > 22` (pet equipment, 50–57) is rejected.
- `equipOn(itemId)` takes one arg; the target slot is ignored. An occupied slot sends its occupant to the first free bag slot (swap).
  Fails when the bag is full and an occupant must move.
- Legacy has no level/class gate on the server. *(H5 decision)*: enforce on the server with the client strings
  `'Cấp độ bạn chưa đủ!'` / `'Nghề nghiệp bạn không phù hợp!'` (push `onSystemMidMsgOrNote`, then reject).
- `durability <= 0 && maxDurability > 0` blocks equipping.
- Do **not** port the "ring" 7→8 special case.
- `equipOff(itemId, toSid)`: `toSid = -1` sends the item to the first free bag slot; a bag sid sends it to that slot, which must be empty.
  *(H5 decision)*: an occupied target is rejected instead of the legacy silent swap.
- `useItem` on an equipment item = equip (same path as `equipOn`).
- Push order for equip/unequip (server research §3.8, H5 subset):
  1. `onMoveItem(oldSid, newSid, itemId)`.
  2. If an occupant was displaced: `onMoveItem(equipSid, bagSid, displacedId)`. *(H5)*: use the real equip sid, not legacy 0.
  3. Clamp `onUPP{currentHp,currentMp}`, only when clamped.
  4. Stat-refresh `onUPP`.
  - Reply: equipOn `{success:true, equipItems}`, equipOff `null`.
- `getInitSlot` returns equipped (slotType 1) and bag items in one map keyed by item id (client research §1.6).

### 1.3 Item use
- `useItem(targetType 1|2, petId (-1), itemId)` is fire-and-forget. Only `targetType 1` is in M1; 2 is rejected (no pets).
- Server gates: `req_level` (push `onSystemMidMsgOrNote('Cấp độ bạn chưa đủ!')`), `use_type == 4`, and `use_type 2` (pet only) → `'Vật phẩm này bạn không dùng được!'`.
- HP/MP potions are template `type 501`. Amounts are hardcoded, keyed by template id (server research §3.9 table); `i1/i2` must not be read as amounts.
  - Healed = `min(amount, effectiveMax - current)`.
  - *(H5 decision)*: if 0 (already full), push `onSystemMidMsgOrNote('HP đã đầy!' / 'MP đã đầy!')` and do **not** consume (legacy consumed it).
- Food (`type 502`): heal `i1` HP / `i2` MP with the same cap.
- Other item types: push `'Vật phẩm này chưa dùng được'`; the item is not consumed.
- Order: decrement the stack (conditional update), then credit HP/MP.
- Pushes: `onUPP{currentHp,currentMp}`, then `onAddCharactorSlot(item)` or `onDelCharactorSlot(itemId, sid)`.
- `fullHpRecoverByItem` / `fullMpRecoverByItem(targetType, targetId, entries[{sid: itemId, priority}])` (server research §3.9 item 10):
  - Sort ascending by `(priority, itemId)`. With no entries, scan the bag with `priority = amount - (bound?1:0)`.
  - Per entry consume `min(stack, ceil(deficit/amount))`, stop when the deficit ≤ 0, and cap at the effective max.
  - Pushes: per entry a slot push, then `onUPP{currentHp,currentMp}`. Reply `null`.
  - The client sends it when the HP/MP bar is clicked (client research §3.2).

### 1.4 Buffs
- Persisted per character, unique per (character, buffId). Types: 1 per-battle, 2 timed, 3 permanent, 10 unique per `code_name`.
- Pushes:
  - `initLongBuff({rowId: LongBuff})` once after entering the game, `{}` when empty.
  - `upLongBuff(LongBuff)` on grant.
  - `delBuff(rowId)` on removal.
  - `LongBuff` keys (client research §4.3): `id, bid, type, battleLeft?, timeAll?, addTime?, timeLeft?, ineffectiveTime?` (epoch ms).
- `delBuffClient(rowId)` is fire-and-forget:
  - Unknown id: push `delBuff(id)`.
  - Template `buff == 0`: no push (the client shows "BUFF xấu không thể bị xóa.").
  - Otherwise delete, push `delBuff(id)`, then the stat-refresh `onUPP`.
- Expiry is lazy (dropped when listed); the client removes timed buffs on its own timer and sends `delBuffClient`.
- No M1 gameplay source grants buffs (item awards / VIP are later). *(H5 decision)*: dev command `gmAddBuff(buffId, seconds)`
  like `gmGoMap`, for testing.

### 1.5 Bag operations (server research §3.10, client research §5)
- `moveItem(fromSid, toSid)`:
  - Empty target: move, push `onMoveItem(fromSid, toSid, itemId)`.
  - Same stackable (template, bound, colour) and the merged count ≤ max stack: merge, push `onAddCharactorSlot(dest)` then
    `onStackItemInto(fromSid, toSid, srcId, destId, mergedCount)`.
  - Merged count over the max stack: fail.
  - Otherwise swap, push `onSwapItem(fromSid, toSid)`.
  - Reply `{success:true}`.
  - *(H5)*: both sids must be bag sids in the open page (2101..2130); equip slots go through equipOn/equipOff.
- `moveItemNum(fromSid, toSid, n)`, with `1 ≤ n < stack` *(H5: validated)*:
  - Empty target: new row with `n` (inherits bound **and colour**, *H5 fix*).
  - Same stack: merge (max-stack check).
  - Different item: fail.
  - Pushes: `onAddCharactorSlot(dest)`, then `onMoveItemNum(fromSid, srcId, remaining)`.
- `dropItem(itemId[, md5])`: delete any owned bag item; the password arg is ignored. Push `onDelCharactorSlot(itemId, sid)`, reply `{success:true}`.
  The client confirms with "Xác nhận hủy vật phẩm này?". *(H5)*: equipped items cannot be dropped (unequip first).
- `bagSort()`: sort bag rows by `(tid, itemType, unbound first, colour, slotIndex, id)`, merge stacks up to max stack, repack from 0.
  - Pushes: `onDelCharactorSlot` per merged-away row, then `onItemSort([{oldId: oldSid, newId: newSid, stackNum}])`.
  - Reply `{success:true}`. Confirm text "Xác nhận sắp xếp túi đồ?".
- Client throttles (`RPC_DELAY`): useItem/recover 800 ms; equip/move/drop 1100 ms; bagSort 3000 ms.

## 2. Shared contract

New file `packages/shared/src/character.ts` (re-exported from `index.ts`; `protocol.ts` is already over the size cap).
Exact types; the implementer may add fields only if §1 demands them.

```ts
// Character stats, attribute allocation, buffs and level constants (M1 character core).

export const AUTO_LEVEL_CAP = 20;
export const MAX_LEVEL = 160;
export const ATTR_POINTS_PER_LEVEL = 5;

/** Final stats shown on the character panel (legacy `player.property`, final* keys). */
export interface CharProperty {
  finalHp: number; finalMp: number; finalSp: number;
  finalAttack: number; finalMAttack: number; finalDefence: number; finalMDefence: number;
  finalHit: number; finalDodge: number; finalCritical: number; finalSpeed: number; finalCriticalDamage: number;
  finalStrength: number; finalAgility: number; finalStamina: number; finalIntelligence: number; finalEnergy: number;
  lastPoint: number; // free attribute points
  aptStrength: number; aptAgility: number; aptStamina: number; aptIntelligence: number; aptEnergy: number; // distributed
}

/** changeProperty arg (strings like the Flash client; "" = 0). */
export interface ChangePropertyArg {
  addStrength: string; addAgility: string; addStamina: string; addIntelligence: string; addEnergy: string;
}

/** getCharDetailData reply: the 26 secondary rates (all 0 without gear/buff rates in M1). */
export type CharDetailData = Record<string, number>;

export const BuffType = { BATTLE: 1, TIMED: 2, PERMANENT: 3, UNIQUE: 10 } as const;

/** initLongBuff value / upLongBuff payload. */
export interface LongBuff {
  id: number; // row id
  bid: number; // data_tbl_buff id
  type: number;
  name: string; // H5 extension
  iconCode: string; // H5 extension (resource code string)
  info: string; // H5 extension: description for the tooltip
  removable: boolean; // H5 extension: template buff == 1
  battleLeft?: number;
  timeAll?: number; // seconds
  addTime?: number; // unix seconds
  timeLeft?: number; // seconds
  ineffectiveTime?: number; // epoch ms
}
export type InitLongBuff = Record<string, LongBuff>;

/** onItemSort entry (sids). */
export interface ItemSortEntry { oldId: number; newId: number; stackNum: number; }

/** fullHpRecoverByItem / fullMpRecoverByItem entry: sid is the item id (legacy naming). */
export interface RecoverEntry { sid: number; priority: number; }

export interface EquipOnReply { success: boolean; equipItems: import('./inventory.js').BagItem[]; }
export interface OkReply { success: boolean; }
```

Changes to existing shared types:
- `packages/shared/src/inventory.ts`:
  - `SlotType = { BAG: 0, EQUIP: 1 }`.
  - `EQUIP_SLOT_COUNT = 22`.
  - `BagItem` gets `position: number` (template position, 0 for items) and `reqLevel: number` (for tooltip colouring).
  - `ItemKind` unchanged.
- `PlayerData` gets `property: CharProperty`. The login payload carries it, so the panel needs no extra call on open.
- `PlayerUpdate` additionally accepts `currentHp`, `currentMp`, `maxHp`, `maxMp`, `attStrength`..`attEnergy` and `property`.
  The stat-refresh `onUPP` = `{level, exp, attrPoints, currentHp, currentMp, maxHp, maxMp, att*, property}`.
- `LEVEL_EXP` extended to all 161 cumulative entries copied from `D:\mcgame\internal\domain\character\player_level_exp.go:5-167`
  (data copy). `quest.rules.ts` must keep working (its `AUTO_LEVEL_CAP` / `ATTR_POINTS_PER_LEVEL` move to the shared constants).

## 3. Design

### 3.1 State
- `characters` (character.schema.ts): add `aptStrength, aptAgility, aptStamina, aptIntelligence, aptEnergy` (default 0).
  - `strength..energy` stay as the **base** attributes.
  - `maxHp/maxMp` remain stored as a cache only, rewritten whenever stats are recomputed; never read as truth.
- `character_items`: no schema change. Equipped items use `slotType 1`, `slotIndex = position-1`; the unique index (char, slotType, slotIndex) already covers it.
- New `character_buffs` collection (`modules/buff/buff.schema.ts`):
  - Fields: `_id` (counter `buffs`), `characterId`, `buffId`, `buffType`, `durationTotal`, `expiresAt: Date|null`, `battlesLeft`, `createdAt`.
  - Unique `(characterId, buffId)`.
- Existing characters were created with all attributes = 10 and the placeholder HP. Fix them with the idempotent script `server/tools/fix-char-attributes.ts`:
  - base attributes = class `att_*` + (level − 1);
  - `attrPoints = max(attrPoints, (level−1)*5 − sum(apt*))`;
  - recompute `maxHp/maxMp`, and clamp current HP/MP to them.
  - Run it with `pnpm --filter @mc/server exec tsx tools/fix-char-attributes.ts` and add a script entry like `import:seeds`.
- Restart story: everything is persisted. Derived stats are recomputed on every read; there is nothing in memory.

### 3.2 Static data (`GameDataService`)
- `getClass(id)` exists; it needs `att_*` and `apt_*`, so verify they are loaded.
- Extend `TEMPLATE_FIELDS` with `type, use_type, req_level, req_class, i1, i2, position, kind, main_prop1, main_prop2,
  main_prop_num1, main_prop_num2, prop1, prop2, prop_num1, prop_num2, bind_prop_num, bind_type`.
- New cached `getBuff(id)` over `data_tbl_buff` (3182 rows: `id, name, code_name, type, buff, percent_flag, prop1..6,
  prop_num1..6, icon_code, description`), loaded at startup like shops.

### 3.3 Server

Pure modules first, each with `node:test` tests:
- `modules/character/character-stats.ts`:
  - `buildBaseStats(profile)` (formula §3.1 of the server research);
  - `assembleStats(baseProfile, bonuses)` (assembly order §1.1);
  - `toCharProperty(...)`;
  - prop dictionaries `EQUIP_PROP` and `BUFF_PROP` → stat key + percent flag.
- `modules/inventory/equip-stats.ts`: `equipBonuses(templates[])` → `{attrFlat, flat, pct}`.
- `modules/buff/buff-stats.ts`: `buffBonuses(buffTemplates[])`.
- `modules/inventory/potion.ts`: `HP_POTION`, `MP_POTION` tables, `healAmount(tpl)`, `planRecover(entries, deficit)`.
- `modules/inventory/bag-rules.ts`: add `planMove`, `planSplit`, `planSort` (pure, on plain slot arrays).

Services:
- `CharacterStatsService` (in the character module, injected where needed): `compute(charId)` loads the doc, class, equipped templates and active buffs and returns
  `{property, maxHp, maxMp}`.
  - `refreshPush(session)` sends the stat-refresh `onUPP` and writes the `maxHp/maxMp` cache.
  - `clampHpMp(charId)` returns whether HP/MP were clamped.
  - Build one aggregator; to avoid a circular DI between character ↔ inventory ↔ buff, put it in a small `stats` module that
    depends on all three repositories' models directly.
- `CharacterService.create`: base attributes from the class row, max HP/MP from the formula, current = max.
- Login (`chooseCharactor` → `PlayerData`): include `property`, clamp current HP/MP to the effective max, and fix `maxHp/maxMp` to the real values.
- Quest exp flow: on level-up add +1 to each base attribute (already in `applyExp`'s `statGain`? Verify; legacy also does
  this) and send the stat-refresh `onUPP` instead of the partial one; keep `onPlayerLevelUp`.
- RPCs, all un-quieted, gate `requireCharacter`:

| RPC | Module file | Notes |
|---|---|---|
| `getCharAttributes()` | `character/character-stats.rpc.ts` | returns and pushes the stat-refresh payload |
| `getCharDetailData(cid?)` | same | 26 keys of `CharDetailData`, zeros except derivable ones |
| `changeProperty(arg)` | same | atomic `updateOne({_id, attrPoints: {$gte: total}}, {$inc})` |
| `lvUp(level, pass)` | same | level ≥ 20 and < 160, `exp >= LEVEL_EXP[level]`; +1 level, +5 points, +1 attributes; stat `onUPP`, `onPlayerLevelUp`; returns boolean |
| `equipOn(itemId)` | `inventory/equipment.rpc.ts` + `equipment.service.ts` | §1.2 |
| `equipOff(itemId, toSid)` | same | §1.2 |
| `useItem(targetType, petId, itemId)` | `inventory/use-item.rpc.ts` + `use-item.service.ts` | §1.3; equipment → equipOn path |
| `fullHpRecoverByItem` / `fullMpRecoverByItem` | same | §1.3 |
| `moveItem` / `moveItemNum` / `dropItem` / `bagSort` | `inventory/bag-ops.rpc.ts` + `bag-ops.service.ts` | §1.5 |
| `delBuffClient(id)` | `buff/buff.rpc.ts` | §1.4 |
| `gmAddBuff(buffId, seconds)` | same | dev only, like `gmGoMap` |

- `initLongBuff` is pushed after `chooseCharactor` succeeds (or on `sceneLogin`, whichever H5 uses for the first scene; pick the one the client handles after its callbacks are bound).
- Failure style: same as `inventory.md`, a red/mid message push plus `RpcException`, so the client ignores the rejection. `onSystemMidMsgOrNote` is new:
  the client shows it as the existing toast.
- Swaps and sorts must survive the unique index: move the occupant first (equip swap), use a temporary `slotIndex` (−1 / +10000 offset) for bag swap and sort,
  as in server research §7.

### 3.4 Client
- `ui/characterPanel.ts` + `characterPanel.css` (CSS-drawn like `bagPanel`; draggable with `panelBehavior.makeDraggable`):
  - Left: equipment grid of the 22 sids (labels from client research §1.6; sids 15–20 magic weapons shown as locked).
  - Right: HP/MP `current/max`, attack, M.attack, defence, M.defence, hit, dodge, crit, speed, the 5 attributes with `+` buttons (step 1, or 10 with a checkbox),
    "Điểm" remaining and an OK button → `changeProperty`.
  - Opened by the HUD character button and the **C** key (`systemBar.ts` currently toasts).
- `game/CharacterController.ts`: owns `player.property`; handles `onUPP` property/HP/MP fields (after `QuestController`, like `BagController`) and
  `onSystemMidMsgOrNote` (toast).
  - Auto `lvUp` prompt: when level ≥ 20 and the exp bar is full, show "Xác nhận thăng cấp?" (portrait level-up button or chat system line + confirm dialog).
- `BagController` / `bagPanel`:
  - Equipped items are kept apart from bag slots.
  - Double-click: equipment → `useItem` (equip); a usable item → `useItem`; client-side gates with the strings from §1.3.
  - Drag & drop between bag slots → `moveItem`; Shift-drop → amount dialog → `moveItemNum`; drag a bag slot onto the character panel → `equipOn`;
    drag an equipped slot onto a bag slot → `equipOff(id, sid)`; double-click an equipped slot → `equipOff(id, -1)`.
  - Toolbar buttons "Sắp xếp" (confirm → `bagSort`, 3 s throttle) and "Vứt bỏ" mode (click → confirm → `dropItem`).
  - Handlers: `onMoveItem`, `onSwapItem`, `onStackItemInto`, `onMoveItemNum`, `onItemSort` (or re-fetch `getInitSlot` after `onItemSort` if simpler).
- HUD `portrait.ts`:
  - Clicking the HP bar → `fullHpRecoverByItem(1, -1, entries)`, built from bag potions of the known tid tables, `priority = amount - (binded?1:0)`, sorted ascending.
    Same for MP.
  - HP/MP bars use `property.finalHp/finalMp` as max.
- `ui/hud/buffBar.ts`: buff icons 16×16 at left 2, top 115 (stage pixels). Tooltip name + time left.
  - Click a removable buff → `delBuffClient`. A 10 s timer removes expired timed buffs and calls `delBuffClient`.
  - Handles `initLongBuff`, `upLongBuff` (type 10 replaces same-name entries), `delBuff`.
- Client throttles (§1.5) in `GameClient` call sites or a tiny `throttle(method, ms)` helper in `net/`.
- Chat dev command `/buff <id> [seconds]` → `gmAddBuff` (like `/go`).

### 3.5 Touch points

| File | Change |
|---|---|
| `packages/shared/src/character.ts` | new: §2 types and constants |
| `packages/shared/src/index.ts` | re-export `character.ts` |
| `packages/shared/src/inventory.ts` | `SlotType.EQUIP`, `EQUIP_SLOT_COUNT`, `BagItem.position/reqLevel` |
| `packages/shared/src/protocol.ts` | `PlayerData.property`, wider `PlayerUpdate`, full `LEVEL_EXP` (161) |
| `server/src/modules/character/character.schema.ts` | `apt*` fields |
| `server/src/modules/character/character-stats.ts` (+`.test.ts`) | new: formula, assembly, prop dictionaries |
| `server/src/modules/stats/` (`stats.module.ts`, `character-stats.service.ts`) | new: aggregator (char + equipped + buffs), refresh push, clamp |
| `server/src/modules/character/character-stats.rpc.ts` | new: getCharAttributes, getCharDetailData, changeProperty, lvUp |
| `server/src/modules/character/character.service.ts` | create with class attributes + real formula; PlayerData.property |
| `server/src/modules/quest/quest.rules.ts`, `quest.rpc.ts` | shared constants; level-up sends the stat-refresh onUPP |
| `server/src/modules/gamedata/gamedata.service.ts` | template fields, `getBuff` cache |
| `server/src/modules/inventory/equip-stats.ts` (+test), `potion.ts` (+test), `bag-rules.ts` (+tests) | new pure helpers |
| `server/src/modules/inventory/equipment.service.ts`, `equipment.rpc.ts` | new: equipOn/equipOff |
| `server/src/modules/inventory/use-item.service.ts`, `use-item.rpc.ts` | new: useItem, fullHp/MpRecoverByItem |
| `server/src/modules/inventory/bag-ops.service.ts`, `bag-ops.rpc.ts` | new: moveItem, moveItemNum, dropItem, bagSort |
| `server/src/modules/inventory/inventory.service.ts`, `bag-mapping.ts` | list includes slotType 1; `position`, `reqLevel` |
| `server/src/modules/buff/` (`buff.schema.ts`, `buff.service.ts`, `buff-stats.ts` + test, `buff.rpc.ts`, `buff.module.ts`) | new |
| `server/src/app.module.ts` | import `StatsModule`, `BuffModule` |
| `server/tools/fix-char-attributes.ts`, `server/package.json` | new idempotent migration + script |
| `client/src/game/CharacterController.ts` | new |
| `client/src/ui/characterPanel.ts`, `characterPanel.css` | new |
| `client/src/game/BagController.ts`, `client/src/ui/bagPanel.ts`, `bag.css` | equip/use/drag/split/drop/sort |
| `client/src/ui/hud/portrait.ts` | HP/MP click recovery; max from property |
| `client/src/ui/hud/buffBar.ts` (+css), `mainHud.ts`, `systemBar.ts` | buff bar; C key / character button opens the panel |
| `client/src/game/GameScene.ts` | create `CharacterController`, bind new pushes |
| `client/src/ui/chat.ts` (or wherever `/go` lives) | `/buff` dev command |

Keep every file under ~300 lines; split rpc/service/pure helpers as listed.

## 4. Non-goals

- **Equipment appearance on the avatar** (`onEquipOn`/`onWingOn`/`onFlyerOn` broadcast, weapon/dress/wing layers): it needs the equipment sheet layering
  research. Stats work without it, so M2 or a follow-up can add it.
- Stars, sockets/gems, soul activation (`onEquipActiveList` all false), suits, maker sets, random property rolls, and element `ee/en/ef`: separate
  upgrade systems (roadmap 3.3). The instance has no such data yet.
- `getFinalPraDef` / `finalPraMagDef`: client call sites are unconfirmed and the values are 0 without gear rates.
- `useMultiItem`, pet targets, scrolls, gems, skill books, item awards (type 32 buffs), and every non-potion/food item type: these need pets, skills or other systems.
- Secondary password (`lvUp`/`dropItem` arg): H5 has no such feature; the arg is accepted and ignored.
- NPC healer (`npcFuncOther`): an NPC function panel, separate plan.
- Bank, temp/quest/pet bags, extra bag pages, repair: roadmap 3.1 / shop leftovers.
- Equipment tooltip parity (TipEquip): a basic tooltip with name/level/class/props is enough for M1.

## 5. Verification

1. Unit tests (`node:test`):
   - `buildBaseStats` against all six Lv1 class vectors and the class 1 Lv5 vector (server research §3.1).
   - Assembly order: a gear Strength flat goes through the formula; percent prop 24 applies after the flats.
   - `equipBonuses`: prop 21 → stamina, `bind_prop_num` added.
   - `changeProperty` arg parsing (`""`, `"-3"`, `"abc"`, numbers).
   - `planRecover`: ordering, bound first, ceil, stop at deficit.
   - `planMove` (move/merge/overflow/swap), `planSplit`, `planSort` (merge + repack + entries).
   - `lvUp` gate.
2. `pnpm --filter @mc/shared build`, `pnpm -r lint`, `pnpm -r test`, all green.
3. `pnpm --filter @mc/server exec tsx tools/fix-char-attributes.ts`, twice. The second run changes nothing.
4. Manual smoke test (server log shows each RPC; none quiet):
   1. Log in with an existing character. HP/MP bars show the real max (class 1 Lv1 ≈ 377/104).
   2. Press C. The panel shows stats; allocate +2 Lực and OK. Attack rises and Điểm drops by 2; reallocating more than the free points shows "Không đủ điểm thuộc tính!".
   3. Buy gear at a newbie NPC shop (if none sells it, buy potions there and test equip after `/buff` and potion tests). Double-click it: it moves to its slot and the stats change.
      Double-click the equipped slot: it returns to the bag.
   4. Buy HP potions and drop HP (none can be lost without combat: use `/buff` with a % maxHp buff then remove it, or temporarily
      set `currentHp` via mongosh). Click the HP bar: potions are consumed and HP fills. Full HP → "HP đã đầy!" and nothing is consumed.
   5. Drag a bag item to an empty slot (move), onto the same stack (merge), onto another item (swap); Shift-drag to split; Sắp xếp; Vứt bỏ with confirm.
   6. `/buff 231 60` shows an icon; the stats change; clicking it removes it; relog shows it again via `initLongBuff` while it has not expired.
5. Docs: new `docs/memory/character-stats.md` (stats, equip, buffs, item use) + index line; update `docs/memory/inventory.md` (bag ops, equip slots, deferred list).

## Implementation notes (wave 1: shared + server, 2026-11-04)

Deviations from the plan, all following reality:
- `LEVEL_EXP` (161 entries) lives in `packages/shared/src/character.ts` together with `AUTO_LEVEL_CAP` / `MAX_LEVEL` /
  `ATTR_POINTS_PER_LEVEL`, not in `protocol.ts` (already over the size cap). It is still imported from `@mc/shared`.
- Extra pure files: `character/character-profile.ts` (class apt/att rows -> formula profile, shared with the migration) and
  `character/character-points.ts` (changeProperty parsing, lvUp gate). Extra inventory helpers: `char-lock.ts` (per-character
  async mutex used by equip/use/bag ops) and `pushes.ts` (ordered push list + `midNoteOnFail`).
- `getInitSlot` / `InventoryService.list` now return bag + equipped items (bag-mapping gives equipped items `sid = position`).
- `initLongBuff` is pushed from `sceneLogin` (the client binds callbacks before calling it), not from `chooseCharactor`.
- `planMove` treats templates with `stack_max <= 1` / `single_flag` as non-stackable (swap instead of "merge over limit" fail);
  equipment never merges.
- `fullHp/MpRecoverByItem` toasts `'HP đã đầy!'` / `'MP đã đầy!'` when already full and `'Không có vật phẩm này'` when no potion
  is available (legacy sent nothing); candidate potions skip items the character cannot use (req_level, use_type 2/4).
- `lvUp` pushes `onUPP` (stat refresh) then `onPlayerLevelUp` and replies a boolean; the legacy extra `lvUp({},1,null)` push is not sent.
- `getCharAttributes` returns the same payload it pushes; `PlayerUpdate` payload keeps cumulative `exp` (no `expSkill`).
- Migration script has a package.json entry `fix:char-attributes` (`pnpm --filter @mc/server fix:char-attributes`).
- New RPCs registered (15, none quiet): getCharAttributes, getCharDetailData, changeProperty, lvUp, equipOn, equipOff, useItem,
  fullHpRecoverByItem, fullMpRecoverByItem, moveItem, moveItemNum, dropItem, bagSort, delBuffClient, gmAddBuff.
