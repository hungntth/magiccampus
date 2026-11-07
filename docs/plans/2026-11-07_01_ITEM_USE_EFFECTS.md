# Item Use Effects — Implementation Plan

**Date**: 2026-11-07 · **Status**: Approved (2026-11-07, incl. phase G) · **Implemented** (2026-11-07, phases A-G)
**Goal**: today `useItem` only handles equipment, flat HP/MP potions, skill books, page books, blood-bag refills
and a few hooks (Mật Đạo books, loop-boss orders); everything else answers "Vật phẩm này chưa dùng được". After this
plan the bulk of usable bag items work like the legacy game: gift bags/chests from `data_tbl_item_award`, money
chests and kim phiếu scrolls, choose-one gift boxes, buff foods, rule potions, pet-target items, exp/encounter books,
attribute reset, recipe books, and batch use (`useMultiItem`).

Legacy repo: **`E:\mcgame`** (CLAUDE.md says `D:\mcgame`; the checkout lives on E:). Read-only.

Research base (read these first; they hold the tables, Go line refs and pseudocode this plan cites):
- `docs/research/2026-11-07_01_ITEM_USE_CONTAINERS_RESEARCH.md` — dispatch order, award handler, gift box wire,
  money chest / kim phiếu / mystery key, push order, template counts, overlay gaps.
- `docs/research/2026-11-07_02_ITEM_USE_TYPED_RESEARCH.md` — per-type handlers (500/501/502/505/506/516, template
  handlers), our status per handler, `BuffService` changes, food table, refusal strings.
- `docs/research/2026-11-07_03_ITEM_USE_CLIENT_RESEARCH.md` — Flash `Player.useItem` decision tree, `useMultiItem`,
  `itemMultitoSel` / `selMultiItemByIdx` / `MultiItemPanel`, Language strings, gaps in our client.

## 1. Confirmed mechanics

- Dispatch (`internal/application/item/service.go:1215-1251`): id 719 no-op → `use_type == 4` refused → pet-grow ids
  → template-id handlers → type handlers (508/509/550 → quest-item handler, terminal) → award handler. Fallbacks
  (box/wallet/buff/default) are unreachable with current data — **not ported**.
- `use_type`: 1 = character, 2 = pet, 3 = both, 4 = never. Types 503/504/507/512/513 and stubs 510-527/551/552 are all
  `use_type` 4 in data.
- Refusal strings: generic "Vật phẩm này hiện chưa sử dụng được."; level "Cấp độ không đủ!"; gift bag unknown "Túi quà
  này hiện chưa mở được."; full bag "Không đủ ô trống."; food without effect "Vật phẩm này chưa có hiệu quả sử dụng."
  Refusals push a note and consume nothing.
- Award bag (CanHandle = template has ≥1 `data_tbl_item_award` row incl. overlays): filter by `payload.married`, then
  `payload.class` (class-gated rows exist but none match → refuse); cost = max `payload.costGold` (non-bound gold,
  short → keep box); pick (guaranteed rows + weighted pick, `payload.picks: N` = N distinct draws); room check for all
  picked rows **before** spend/grant; spend cost; grant rows; items/equipment inherit the bag's `isBound`. Row types:
  12 pet (quality = `quality`), 19 equipment (colorCode `(q+4)/5`), 29 item, 30 basic currency, 31 exp, 33 title,
  35 game currency (32 buff / 34 skill / 36 medal / 37 dress material: absent from data except 37 in un-imported
  activity chests). Message "Đã mở %s."; exp "Nhận được %d kinh nghiệm."; title "%s nhận được danh hiệu %s!".
- Money chest (`effect_money_chest.go`): 2271/2272/2273 → 100 000 / 1 000 000 / 10 000 000; 1132/2520 → 100 000 /
  1 000 000 (1063 is equipment, skip). Unbound → bạc (`money`), bound → ngân phiếu (`moneyBind`).
- Kim phiếu scroll (`effect_kimphieu_scroll.go:25-39`): 13 fixed ids → goldBind; copy the map verbatim. "Nhận được %d
  kim phiếu."
- Mystery key 1361: one item ×1 uniform over `[4,125,158,261,264,267,9,10,11,12,13,14]`, inherits bind, room first.
- Gift box: server push `itemMultitoSel({packItemList:{"<idx>":{ti,ii,n,q}}, packGetNum}, itemId)`; client calls
  `selMultiItemByIdx(itemId, idx)` → int (-1 refused, 0 done, N>0 picks left). On pick: room check ("Túi đồ không đủ
  chỗ trống!") → charge `costGold` ("Không đủ Vàng để mở túi này!") → consume one box unit → grant (+`onAddItem`) →
  `onUPP` if gold charged. Paid chests 5710 (1500 gold → list of 4785) / 6665 (2120 gold → list of 4720) push
  "Chọn 1 vật phẩm để mở túi, sẽ trừ %d Vàng khi nhận." first. Pending choices are in memory only.
- `useMultiItem(targetType, petId, slotId, n)` — batch use; client opens a quantity dialog for ids 5375-5697 and
  `BATCH_ITEM_LIST` (`ItemConfig.as:121`), wallets, pet grow potions (max by level cap).
- Push order on success (`handlers/item/use.go:336-384`): slot update (`onDelCharactorSlot(id, sid)` /
  `onAddCharactorSlot(item)`) → `onMidNote(message)` → per granted item `onAddCharactorSlot` + `onAddItem` →
  `onAddPet` → title / buff / `onAddMoney` / skill pushes → `onUPP`.
- Foods (502): 84 buff foods in `food_buff_table.go`; timed foods **add** remaining time to the same buff; battle-count
  foods add remaining battles; the rest are refused and kept. `i1`/`i2` on 502 are cooking recipe ids, **not** heal
  amounts (our `potion.ts` heals from them — bug).
- Type 500: only 324/325 (done), 326 (+1 pet slot), 9 encounter books, 9 exp books do something; the rest are consumed
  with "Đã sử dụng %s." Exp books are refused while a stronger exp buff is active.
- 995 / 1475 Quy Nguyên Châu: refund allocated attribute points to `attrPoints`; 1475 only at level ≤ 39.
- 1581 Luyện Thú Đơn: buff 565 for 30 min. 3984 Tinh Hồn Chi Thực: +1 to the pet's lowest aptitude.
- 516 recipe books: learn the recipe (see research 02 for the table/column).

Details, ids and Go line refs for every bullet are in the research docs; the implementer copies constant tables from
the Go files cited there rather than retyping from this plan.

## 2. Shared contract

Add `packages/shared/src/item-use.ts` (re-export from `index.ts`):

```ts
// Item use contract: choose-one gift boxes (itemMultitoSel / selMultiItemByIdx) and batch use (useMultiItem).

/** One choice in a gift box; keys are the legacy short names. */
export interface PackItemChoice {
  ti: number; // award type (29 item, 19 equipment, 12 pet, ...)
  ii: number; // template id
  n: number;  // count
  q: number;  // quality
}

/** itemMultitoSel(payload, itemId) push payload. */
export interface ItemMultiToSelPayload {
  packItemList: Record<string, PackItemChoice>;
  packGetNum: number | 'all';
}

/** selMultiItemByIdx reply: -1 refused, 0 finished (close panel), N > 0 picks left. */
export type SelMultiItemResult = number;

export const ITEM_USE_TEXT = {
  CANNOT_USE: 'Vật phẩm này hiện chưa sử dụng được.',
  LEVEL: 'Cấp độ không đủ!',
  BAG_UNKNOWN: 'Túi quà này hiện chưa mở được.',
  NO_ROOM: 'Không đủ ô trống.',
  FOOD_NO_EFFECT: 'Vật phẩm này chưa có hiệu quả sử dụng.',
  OPENED: 'Đã mở %s.',
  USED: 'Đã sử dụng %s.',
  GOT_EXP: 'Nhận được %d kinh nghiệm.',
  GOT_KIM_PHIEU: 'Nhận được %d kim phiếu.',
  PICK_NO_ROOM: 'Túi đồ không đủ chỗ trống!',
  PICK_NO_GOLD: 'Không đủ Vàng để mở túi này!',
  PICK_PAID: 'Chọn 1 vật phẩm để mở túi, sẽ trừ %d Vàng khi nhận.',
} as const;
```

Verify `onAddItem`, `onMidNote`, `onAddPet`, `onAddMoney` payload types already exist in shared; add them there only
if missing (reuse whatever `GrantService` already sends).

## 3. Design

### 3.1 State
- No new player schema for bags/currencies. Gift-box pending choices: in-memory `Map<characterId, Pending>` in a
  `GiftBoxService` (legacy does the same; a restart drops the pending choice, nothing was consumed yet).
- `BuffService.grant` gains options `{ addRemaining?: boolean; battles?: number }` (stack remaining time / battles
  instead of overwriting). Battle-count buffs must be decremented at battle settle (see research 02 §BuffService).

### 3.2 Static data
- `server/src/modules/gamedata/overlays.ts`: add `data_tbl_item_award_guild_happy_bags`, `_pet_keys`,
  `_bicanh_rank_bags`, `_dragon_keys` to the `data_tbl_item_award` overlay list. Activity chests (3255-3259) are not
  imported — non-goal.
- Constant tables ported from Go into `server/src/modules/item-use/tables/*.ts` (money chest, kim phiếu, mystery key,
  food buffs, exp/encounter books, paid/choice chests, rule potions, pet grow items). Each file header cites the Go
  source file.

### 3.3 Server

New module `server/src/modules/item-use/` that plugs into the existing `UseItemService.addUseHook` (keeps
`use-item.service.ts` under 300 lines; inventory module must not import the new module — the new module imports
inventory/rewards/buff/pet/progression and registers hooks `onModuleInit`, like PetModule does).

Dispatcher order inside `UseItemService.useConsumable` must mirror Go: `use_type 4` refusal (with
`ITEM_USE_TEXT.CANNOT_USE`) moves **before** the hooks except the existing Mật Đạo / order hooks that rely on their
own gates (check each); level gate message becomes `ITEM_USE_TEXT.LEVEL`; final fallback note becomes
`CANNOT_USE`. Remove the `i1/i2` heal for type 502 (`potion.ts` `healAmount` must only read 501 rows).

Phases (each lands typecheck + tests green):

- **A — Award bags + currency items.** Overlay fix; extend `item-award.ts` (`class`, `married`, `costGold`, `picks`,
  `quality`); extend `GrantService.unpack` (inherit bind, types 12/31/33); `AwardBagHook` (room → cost → grant →
  consume one unit) for 508/509/550 with award rows; money chest, kim phiếu, mystery key hooks; retired bag 5708.
  Templates with no handler in 508/509/550 answer `BAG_UNKNOWN`.
- **B — Gift box choice.** `GiftBoxService` + `@Rpc('selMultiItemByIdx')`; push `itemMultitoSel`; data = explicit
  id → choices maps ported from Go (`effect_paid_choice_chest.go`, `effect_pet_choice_bags.go`, choice chests in
  `effect_quest_item.go`). Client `ui/multiItemPanel.ts` (3 slots/page, local `enoughBag(1)` / pet-slot gates,
  `MULTI_ITEM_PANEL` strings from research 03).
- **C — Foods and buffs.** `BuffService` stacking options; food table; battle-count decrement at settle; wedding
  candies only if trivial, else non-goal.
- **D — Potions, pet items, batch use.** Rule potions (%/per-level/revive etc., battle-only ones refused out of
  battle); pet-target potions (loyalty 425-427, life 1533/1534) through `PetItemHook`; pet grow items (fixed exp, cap
  owner level + 5) via `pet-growth.service.ts`; `@Rpc('useMultiItem')` (loop the single-use path n times, stop at
  first refusal, cap n by stack); client quantity dialog (reuse `askAmount`) for ids 5375-5697 + `BATCH_ITEM_LIST`.
- **E — Books and special templates.** Exp books (buffs 281/762/764/1538; stronger-buff refusal) wired into
  `combat/rewards.ts` exp; encounter books (1203/1365/314/313) into `encounter.service.ts`; 326 pet slot via
  `pet-slot.service.ts`; 995/1475 attribute reset via `CharacterStatsService`; 1581 catch buff into
  `pet-catch.service.ts`; 3984 aptitude fruit; other type-500 scrolls consumed with `USED`.
- **F — Recipe books and leftovers.** 516 recipe learning (forge/craft); vigor 2797 / actpoint 2021/2074/2077 if
  their resources exist in our port, else non-goal; mount dress bags via `MountService` (30-day dress, reborn only);
  gacha-box config pools (`data_gacha_box*`, 49 items) if the tables are imported.

- **G — Description bags (desc-bag parser).** Port `internal/application/item/effect_desc_bag.go`, `_parse.go`,
  `_rules.go`, `_index.go`, `_aliases.go`, `_text.go` and `effect_desc_title.go` (~1200 lines) faithfully to
  TS (`server/src/modules/item-use/desc-bag/`): accent folding, item-name index over `data_tbl_item_template`, aliases,
  rules, quantity parsing, title medals. Port the Go test cases from `effect_desc_bag*_test.go` (bundles, food, main) as
  `node:test` cases. Runs in the quest-item chain after award rows / choice chests (same order as
  `effect_quest_item.go`); unreadable descriptions answer `BAG_UNKNOWN`. Grants go through the same room-check → grant →
  consume path as phase A. Also wire the remaining quest-item id-map handlers of `effect_quest_item.go:41-183` whose
  target systems exist in our port (pet bags → pet service, soul/rune/talent bags if those systems exist); list the rest
  as skipped in the memory doc.
- Order of work: A → G → B → C → D → E → F.

### 3.4 Client
- `client/src/ui/bagActions.ts`: client-side gate like Flash `Player.useItem` — `use_type` 1/3 for character, 2/3
  for pet (`PLAYER_S[3]` / `[6]`), level, `reqClass`; route batch ids to the quantity dialog + `useMultiItem`.
- Handle pushes `itemMultitoSel` (open MultiItemPanel), `onMidNote`, `onAddItem`, `onAddPet` if not already bound
  (check `GameScene.bindCallbacks` and controllers first).

### 3.5 Touch points

| File | Change |
|---|---|
| `packages/shared/src/item-use.ts`, `index.ts` | new contract above |
| `server/src/modules/gamedata/overlays.ts` | 4 missing award overlays |
| `server/src/modules/rewards/item-award.ts` (+test) | class/married/costGold/picks/quality |
| `server/src/modules/rewards/grant.service.ts` | bind inherit, row types 12/31/33 |
| `server/src/modules/inventory/use-item.service.ts` | dispatch order, messages, drop 502 heal |
| `server/src/modules/inventory/potion.ts` (+test) | heal only from 501 |
| `server/src/modules/item-use/*` | new module: hooks, tables, gift box service + rpc, useMultiItem rpc |
| `server/src/modules/buff/buff.service.ts` | `addRemaining` / `battles` options |
| `server/src/modules/combat/*` | battle-count buff decrement, exp-buff multiplier, encounter buff |
| `server/src/modules/pet/*` | pet-target potions, grow items, aptitude fruit, slot book |
| `server/src/app.module.ts` | import `ItemUseModule` |
| `client/src/ui/bagActions.ts` | use_type/level/class gates, batch dialog |
| `client/src/ui/multiItemPanel.ts` (+css) | new choose-one panel |
| `client/src/game/BagController.ts` | `itemMultitoSel` and missing pushes |

## 4. Non-goals

- (Moved into scope as phase G by the user: "bản gốc mở được rất nhiều rồi".) Desc-bags the ported parser cannot read
  still answer `BAG_UNKNOWN`, exactly like Go.
- Box/wallet/buff/default fallback handlers: unreachable in legacy data.
- Event openers (Halloween, Christmas, VIP star bags), fishing tools/catches, transform cards, Linh Lung flasks:
  depend on systems not ported (events M16, fishing M15).
- Special-id RPCs (`useGoodCard`, `useSeek`, `useRadar`, `useTrack`, `useFootle*`, `useSnowBall`,
  `useIntimacyItem`, `useWeddingBag`, `useRedBag`, `changeCharSex`) and type 520 `itemToTarget`: separate features.
- Activity chests 3255-3259 (seed not imported).
- Pet-item button / Ctrl-to-pet tool mode in the client.

## 5. Verification

- `pnpm --filter @mc/shared build`, `pnpm -r lint`, `pnpm -r test` green after each phase.
- Unit tests: picker extensions (class filter, picks, cost), money/kim phiếu tables, food stacking math, rule-potion
  amounts, `useMultiItem` count capping.
- Smoke (GM give items, then double-click in bag):
  1. An award bag from `data_tbl_item_award` (e.g. a main-quest chest) → contents in bag, box −1, "Đã mở …".
  2. Same bag with a full bag → "Không đủ ô trống.", nothing consumed.
  3. Money chest 2271 → +100 000 bạc; kim phiếu 642 → +100 kim phiếu.
  4. Paid chest 5710 → note + MultiItemPanel; pick → item, −1500 gold, box −1.
  5. A buff food twice → buff time stacked.
  6. Exp book → buff shown; next battle exp multiplied.
  7. Quy Nguyên Châu 995 → attribute points refunded.
  8. Batch: kim phiếu ×5 via quantity dialog.
  9. A 508 quest item with `use_type` 4 → "Vật phẩm này hiện chưa sử dụng được.", kept.

## 6. Risks

- Many hook owners (pet, buff, combat, progression) — keep the inventory module free of reverse imports (hooks only).
- Desc-bag templates remain unopenable; set expectations with the user.
- Battle-count buffs touch combat settle; regression-test auto battle.

## 7. Implementation status (2026-11-07)

- **Plan complete: phases A, G, B, C, D, E and F are implemented** (see `docs/memory/item-use.md`; phases D-F landed in the last run, deviations 8-12 below). Extension points used: `ItemUseModule` exports
  `ItemUseRegistry` (`addTemplate` / `addType` / `addQuestItem`) and `DescBagService.setChoicePort()`; the inventory module only exposes
  `UseItemService.addConsumeHandler`.
- Deviations from the plan text:
  1. The quest-item chain ends in `CANNOT_USE` for names that are not bags (Go behaviour) and `BAG_UNKNOWN` only for bag-like names with
     unreadable text (the plan said `BAG_UNKNOWN` for every unhandled template).
  2. Pet awards and titles are granted by `AwardBagService` (item-use), not `GrantService.unpack` (rewards cannot import pet / title);
     `unpack` gained bind, exp (31) and basic wallet currencies (a new `money` grant kind).
  3. The dispatch reorder is done in `useConsumable` (`use_type 4` -> `CANNOT_USE` before the consume stage, level text
     `ITEM_USE_TEXT.LEVEL`); the 502 heal removal (`potion.ts`) is left for phase C.
  4. Phase G id maps ported: quest pet bag 178, expand pack 1201, Thu Thach bags, Anh Linh / Than Tu / point / nature-energy items; the rest
     are listed as skipped in the memory doc.
  5. Equipment prefix attributes (`pre_name_type`, quality stat rolls) and `payload.mwVong` are not applied to award equipment.
6. Phase B: choice lists are explicit id maps from Go (14 item chests, paid 5710 / 6665, pet bag 5266, feather 4924 / 5281, Than Khi 4873) plus the title
   choice bags 4961-4963 and the desc-bag choice port; the Go description-driven pet gift box and the wing boxes are not ported. `PackItemChoice` gained
   optional `nm` / `ic` (the H5 client has no template tables); choices keep their original index after a pick.
7. Phase C: `BuffService.grant` options `{ addRemaining, battles }`, the 84-food table (verified against the Go file), wedding candies, battle-count
   decrement at `battlePlayEnd` (`BattleEndService`), `potion.ts` heals only from 501. Food 382 shares buff 287 with 269 (Go uses an alias row): the later grant
   wins. Battle foods (`field` flag) stay unsupported.
8. Phase D: pet-target items run through a new `UseItemService.addPetHandler` (`PetUseService`); the pet logic is a new `pet/pet-item.service.ts` (not `pet-growth.service.ts`, which is the
   training service). Pet HP / MP and loyalty are not persisted in this port, so HP / MP potions answer "Pet không cần hồi phục." and loyalty potions "Độ trung thành của pet đã đầy." (kept). `useMultiItem`
   runs the single-use path per unit (no batched fast path for kim phiếu / point items / pet grow: the loop gives the same result). `BagItem` gained `useType` / `reqClass` for the client gate; the Linh Lung
   flasks 4015-4018 are kept instead of eaten (their flask handler is not ported).
9. Phase E: type 500 scrolls without a handler are consumed with "Đã sử dụng %s." like Go, except `KEPT_SCROLL_NAME` (teleport / treasure map / quest-start / Thần Tu / summon / exam scrolls whose real
   effect needs a hook this port lacks): those are kept. Type 500 templates with award rows (the 66 paid Bí Điển) open through the award handler (a Go gap). The 326 slot cap is `PetLimits.maxSlots` (180).
   Exp-rate buffs are applied at battle settle per surviving winner (character exp and pet share); the encounter "full roster" fills the 5 enemy slots of the board (Go: 10); buff 1203 has no consumer.
   Catch potion 1581 raises the `catchable` gate (`<= 1 + bonusPoints`) of the simplified catch rule instead of Go's points-vs-difficulty model.
10. Phase F: 516 recipe books skipped (no life-skill / learned-recipe system), vigor 2797 and actpoint 2021 / 2074 / 2077 skipped (no vigor / magic-estate resource). Mount dress bags (11 ids, only 5 have
    templates), gacha boxes (the `data_gacha_box*` tables are imported, 44 boxes with prizes) and the Christmas candy 6562 are done.
11. `docs/memory/item-use.md` earlier claimed the gacha tables are not imported: they are (`data_gacha_box`, `data_gacha_box_entry`, plus the mount_potion / wing_bags / activity_chests variants, which the
    Go cache does not read and this port ignores).
12. Not smoked live: battle-side consumers (exp multiplier, encounter buffs, catch bonus) have unit tests only.
