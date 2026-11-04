# Mail, Auction, Bags (M11) — Implementation Plan

**Date**: 2026-11-04 · **Status**: Draft
**Goal**: port the legacy Thùng Thư (mail with gift / COD / one attachment, system mail as a reward channel), the
auction house (list items and pets, bid, buy-out, cancel, expiry, PM batch), the Túi Tiện Dụng temp bags (normal + Ma Tâm),
the volatile Túi tạm thời, bank sort / quick move, pets in trade, and the remaining shop RPCs (credit point shops, guild
shop currency, NPC proxy buy, mall cart, limit-time stubs). Today none of the mail / auction / temp-bag RPCs exist, NPC
types 3 and 5 do nothing, trade refuses pets (`petIds: []`), `bankSort` is not registered and special-currency shop slots
are refused with "chưa hỗ trợ loại tiền này".

Research base (legacy repo `E:\mcgame`, read-only; CLAUDE.md says `D:\mcgame`, the checkout is on E:):
- Legacy memory: `docs/memory/mail-system.md`, `auction-system.md`, `temp-bag.md`, `bag-bank-tabs.md`, `trade-system.md`,
  `shop-system.md`, `vip-shop.md`, `guild-system.md` § shop, `h5-bank-mail.md`, `h5-trade-auction-callboard.md`.
- Legacy research: `docs/research/2026-10-22_02_MAIL_AND_TEMP_BAG_RESEARCH.md` (Part 1 mail contract, Part 2 temp bags),
  `docs/research/2026-10-22_06_TUI_TIEN_DUNG_RESEARCH.md` (TempBagSlot wire contract).
- Go: `internal/domain/{mail,auction}/`, `internal/application/{mail,auction,item,shop}/`,
  `internal/presentation/rtmp/handlers/{mail,auction,item,shop,npc,trade}/`, migrations `20261022132107_mail_system_and_marriage_wedding.sql`,
  `20261024150000_auction_house.sql`.
- Flash: `docs/client/view/view/compDragable/{MailManagerPanel,MailPanel,AuctionPanel,PMAuctionPanel,TempBagSlot,TemporaryBagPanel,BankPanel,NpcShopPanel,SystemShopTrolleyPanel,NumPanel}.as`,
  `config/Language.as`, `predef/GamePredef.as`, `view/ViewManager.as`.
- H5 today: `docs/memory/inventory.md`, `economy.md`, `shop.md`, `trade.md`, `npc-dialog.md`, `vip.md`; code in
  `server/src/modules/{inventory,shop,trade,npc,pet,vip}`, `client/src/ui/{bagPanel,bankPanel,tradePanel,mallPanel,npcDialog}.ts`.

## 1. Scope

| # | Sub-feature | Legacy RPCs (verbatim) | Pushes | Data | Legacy memory |
|---|---|---|---|---|---|
| 11.1 | Mail (Thùng Thư), NPC type 3 | `showMailP` `addMail` `closeMail` `delMail` `delMails` `setReadDate` `takeMail` | `initViewMailMngP`, `onAddMail`, `onDelMail`, `onDelCharactorSlot`, `onDelPet`, `onAddPet`, `onAddCharactorSlot`, `onAddItem`, `onUPP` | new `mails` | mail-system |
| 11.2 | Auction (Đấu giá), NPC type 5 | `auctionSearch` `addAuction` `addAuctionMoreByPM` `auctionBid` `auctionBidMax` `cancelAuction` `closeAuction` | `onInitViewAuctionP`, `onAddAuction`, `onDelAuction`, `onAddMoney`, `onUPP`, mail pushes | new `auction_listings`; `data_tbl_creature.class_id`, `data_tbl_pm_right` id 19 | auction-system |
| 11.3a | Túi Tiện Dụng (normal + Ma Tâm) | `getTBag` `tempToBag` `mxtempToBag` `addItemFromTemp` `addMXFromTemp` `addtItemFromBag` `addmxFromBag` `moveItemBtwTemp` `movemxBtwTemp` `openTempSlot` `openmxTempSlot` `delTempSlot` `delmxTempSlot` `tempBagSort` `mxBagSort` `setTempBag` `setmxTempBag` `setTbagDire` `oneKeyOpenAllMXTemp` | `updateTempBags`, `onMoveToTBag`, `onMoveMXToTBag`, `onMoveTempBtw`, `onMoveMXBtw`, `onAddItemDelTemp`, `onAddItemDelmx`, `onAddTempDirect`, `onAddMXTempDirect` | `data_tbl_item_template` type 517 (12 rows), `data_tbl_pm_right` id 5 | temp-bag |
| 11.3b | Túi tạm thời (volatile overflow) | `addSingleItemToBag` `addAllToBag` | `warnTemporaryBag`, `updateTemporaryBag`, `closeWarnTemporaryBag`, `onAddTemporaryItem` | in memory | temp-bag § Túi tạm thời |
| 11.3c | Bank sort / quick move / multi delete | `bankSort` `bagToBank` `delBagItems` (`changeBagGroup` non-goal) | `onBankSort`, `onDelCharactorSlot`, `onAddCharactorSlot` | — | bag-bank-tabs, item-inventory |
| 11.4 | Trade leftovers: pets | (`tradeAddItem` `tradeRemoveItem` `tradeSetMoney` are dead in Flash) | `onTargetLock.petIds`, `onDelPet`, `onAddPet` | `pets` | trade-system |
| 11.5 | Shop leftovers | `exchangeItem` `updateLimit` `buyItemClient` `buySystemItemMulti` `getShopAwardStr` `openShopDirect` `shopClosePanel` `getLimitTimeShop` `buyLimitTimeItem` | `openShopById`, `onOpenShop`, `onAddItem`, `onAddCharactorSlot`, `onUPP`, `onAddMoney`, `onGetLimitTimeItem` | `data_tbl_credit` (252 rows, shops 1–9), `data_tbl_shop` 83 + slots | shop-system, vip-shop, guild-system |

Already done and out of this plan: quest bag "N.vụ" and pet-item page (`economy.md`), VIP shop (`vip.md`).

## 2. Confirmed mechanics

### 2.1 Mail

- **Constants** (`internal/domain/mail/mail.go:16-37`): box cap 100, subject ≤ 100 runes, text ≤ 1000 runes (clipped,
  trimmed: `application/mail/send.go:57-63`), unread lifetime 30 days, read lifetime 10 days, system sender name
  `Hệ thống`. Attachment client types: 9 = bag item instance, 39 = pet. Display tables: 29 item template, 19 equipment
  template, 12 creature.
- **Mail object** (`handlers/mail/dto.go:18-52`): `id, senderId ("0" string for system, number otherwise), receiverId, sn
  (sender name), receiverName, subject, text (player text HTML-escaped, system text raw HTML), money, gold, codMoney,
  codGold, codFlag (1 | -1), itemType (29 | 19 | 12 | -1), itemId (template id), stackNum, date (ms), readDate (ms | -1)`.
  Error object `{id: -1, type: "noSuchReceiver" | "overMaxMail"}`.
- **`showMailP()`** → `{mailList: {"<id>": mail}, currentTime: ms}` after purging expired mail (`rpc.go:44-59`).
- **`addMail(name, obj, delPassMD5)`**, proxy call, no reply (`rpc.go:93-127`). `obj = {subject, text, codFlag, codMoney,
  codGold, money, gold, type (9 | 39 | -1, absent when no slot touched), id, readDate: -1}` (research 02 §1.3).
  Order: amounts ≥ 0 → receiver by name (`ErrNoSuchReceiver`) → not self → sender has money/gold → receiver box < 100 →
  attachment valid (unbound bag-tab item: bag / quest bag / pet-item bag, not trade-locked; pet: unbound, resting, no gear,
  not busy) → COD kept only if the mail carries something (`send.go:136-138`) → consume item/pet + debit → insert → refund
  on failure (`send.go:65-162`). **No postage fee.** Gold is moved, not a gold sink.
  Pushes to the sender: `onDelCharactorSlot(id, sid)` | `onDelPet(id)`, `onUPP{money, gold}` when gift > 0, then
  `onAddMail(mail with receiverName)` (the client treats it as "sent"); receiver online gets `onAddMail(mail)`.
  Errors: `onAddMail({id:-1,type})` for the two codes, else `onSystemMidMsgOrNote(text)` with (`rpc.go:26-40`):
  `Không thể tự gửi thư cho mình!`, `Lỗi số vàng điền vào!`, `Vật phẩm này không thể gửi qua thư!`,
  `Không thể gửi bưu kiện pet đã khóa!`, `Pet đang xuất chiến, đi theo hoặc được cưỡi, hãy cho pet nghỉ ngơi trước khi gửi!`,
  `Pet đang mang trang bị, hãy tháo trang bị pet trước khi gửi!`, `Đang giao dịch, không thể thao tác vật phẩm!`,
  `Hệ thống bận, vui lòng thử lại sau!`. Level gate (Open Beta patch): `Cần đạt cấp 60 để gửi thư.`.
- **`takeMail(id[, delPass])`** → id or 0 (`rpc.go:164-186`, `application/mail/take.go:29-113`). COD needs the second
  argument. Order: owner + has content → COD confirmed → COD funds → bag / pet room → atomic claim → grant (restore claim on
  failure) → debit COD, credit gift → COD payment system mail to the sender, title `Thu phí thư`, text
  `%s đã nhận thư "%s" và trả phí cho bạn.` (`take.go:16-19`). Pushes: `onAddItem` notice, `onCreateItemInstance`,
  `onAddCharactorSlot` per changed slot (or `onAddPet`), then `onUPP{money, gold}` if money moved (`push.go:58-95`).
  Errors (`rpc.go:188-204`): `Bạn không có đủ chỗ trống trong túi đồ!`, `Bạn không có đủ chỗ trống trong túi pet!`,
  `Bạn không có đủ tiền để trả thư này!`, `Thư không tồn tại hoặc đã được nhận!`.
- **`setReadDate(id)`** → `{id, newDate}` (`rpc.go:206-217`). **`delMail(id)`** → id | 0; **`delMails(ids)`** → ids
  (`rpc.go:219-274`). **`closeMail`** no-op.
- **Delete / expiry return**: deleting or expiring an unclaimed player mail with money, gold or an attachment re-mails it
  to the sender as system mail title `Thư bị trả lại`, text `Thư "<title>" gửi cho <receiver> đã bị trả lại, vật phẩm
  và tiền được hoàn cho bạn.`, `returned = true` (never returned twice, COD dropped); system attachments are destroyed
  (`20261022132107_mail_system_and_marriage_wedding.sql:111-120`). Hourly sweep, first at boot; online owner gets
  `onDelMail(id)`.
- **Login notice**: 6 s after login, up to 5 unread mails as `onAddMail`, oldest first (`push.go:20-56`).
- **NPC**: type 3 click → `initViewMailMngP()` no args (`handlers/npc/mail_npc.go:13-24`). H5 NPCs: 351 (map 1), 357
  (map 9), 374 (map 10), 505 (map 38), 525 (map 31).
- **Flash strings** (`Language.as:1611-1641, 3862-3873, 4360-4365`): `MAILMANAGERPANEL_S[0]` `Trạng thái hiện tại không
  thể mở hệ thống bưu kiện!`, `[3]` `Điền tên người nhận!`, `[4]` `Gửi thất bại: Không có người chơi này!`, `[5]` (delete
  player mail with content, returns to sender), `[6]` (system mail with content, lost), `[7]` `Xác nhận xóa thư này?`,
  `[8..12]` `Người gửi` `Tiêu đề` `Còn lại` `Tặng` `Thu phí`, `[13]` `Hộp thư người nhận đã đầy!`, `[14]` `{remainDate} ngày`,
  `[15]` anti-scam note, `[16]` `Gửi thư`, `[17]` `Xác nhận xóa thư đã chọn?`, `[18]/[19]` batch variants, `[20]/[21]`
  `Có đính kèm`/`Không đính kèm`, `[22]` `Chưa chọn thư`, `[23]` box nearly full; `MAILPANEL_S[0..5,101]`; tabs
  `MAILMANAGERPANEL_U` `Gửi` `Hệ thống` `Người chơi` `Viết thư` `Hộp thư` `Người nhận` `Tiêu đề` `Kèm` `Chọn hết` … `Xóa`
  `Nhận nhanh`; COD confirms `MAIL_PANEL_U[1..3]` (`Đây là thư {lanCost}, vui lòng đọc kỹ để tránh bị lừa. \nXác nhận trả
  [{goldValue}] vàng …`), `[4]` `Thu phí`, `[5]`. Remaining days = `30 - age` unread / `10 - since read` (int truncation).
  12 rows per page (h5-bank-mail.md).
- **`SendSystemMail`** (`application/mail/send.go:43-55`): `{RecipientID, SenderName, Title, Content, Money, Gold,
  TemplateID, Table (29 | 19), Count, Bound, Quality}`, ignores the box cap, pushes `onAddMail` to an online receiver.

### 2.2 Auction

- **Constants** (`internal/domain/auction/auction.go:15-50`, `GamePredef.as:959-962`): auctionType 1 Bạc (money), 2 Vàng
  (gold); duration 1..48 h; fee per hour 5; max 20 active per seller; price cap 999,999,999; search limit 500; PM batch
  needs PM ≥ 3 (also `data_tbl_pm_right` id 19 "Mở chức năng đấu giá hàng loạt"), max 10 goods; client suggested raise
  `AUCTION_BIDADD [10 silver, 1 gold]`.
- **Fee** (`auction.go:121-130`): `round(avg(start, buyout) × 0.1 % (money) or × 0.2 % (gold) + hours × 5)` in silver,
  charged from the preferred silver (moneyBind unless `selectedMoneyType` is money), **never refunded**. No sale commission.
- **Pet classification** (`auction.go:132-138`): itemKind 7, itemType `700 + class_id − 1`, clamped to 700..705 (else 701).
- **Row** (`application/auction/view.go:25-53`): `id, ownerId, type (28 | 18 | 39), itemId, stackNum, name, color,
  auctionType, nowMoney/nowGold (current), maxMoney/maxGold (buy-out, 0 none), itemKind, itemType, reqLevel, duration,
  wn (seller), pn (top bidder), lastTime` with `lastTime` = `Hết hạn` | `<ceil h> giờ` (≥ 1 h) | `<ceil m> phút`
  (`view.go:65-75`).
- **`auctionSearch({kind, type, levelLow, levelHigh, name, npcId, version})`** → `{arg, version: now ms, list: {"<id>": row}}`;
  the server filters by kind only, the client filters type / name / level (pets skip level) and keeps its buffer when
  `version` is not newer (`AuctionPanel.as:1459-1504`). Page size 30 (`AuctionPanel.as:106`). Search tree = every
  `ITEM_KIND_TYPE` kind with its types, kinds from index 4 first, then the first four (`AuctionPanel.as:1885-1930`).
- **`addAuction(obj)`** (proxy): `{auctionType, slotId (item id | -1), petId (pet id | -1), stackNum, type, itemId,
  nowMoney, maxMoney, nowGold, maxGold, duration}` (`handlers/auction/payload.go:62-80`). Whole stack listed. Pushes
  `onDelCharactorSlot(id, sid)` | `onDelPet(id)`, `onUPP{money, moneyBind}`, `onAddAuction(row)`, note `Rao bán thành công!`
  (`handlers/auction/rpc.go:88-100`). **`addAuctionMoreByPM(obj)`**: entries keyed `"0".."4"` items, `"10".."14"` pets,
  each like `addAuction` (`payload.go:82-99`).
- **`auctionBid(id, amount)`** → `{flag, info, auctionData: row}`; **`auctionBidMax(id)`** → `{flag, info, auctionId}`.
  Bid must be `> current` and `< buyout` (when buyout > 0); not own listing; not already top bidder; money or gold only,
  no bound currency. Debit at once; the previous top bidder is refunded by system mail `Có người ra giá cao hơn cho %s.
  Hoàn lại %s %s.` (`20261024150000_auction_house.sql:257-269`). Wallet pushes `onAddMoney(cid, key, -price, total)` then
  `onUPP{money, gold}` (`rpc.go:134-150`). Buy-out: goods mail to the buyer, price mail to the seller `%s đã được %s mua
  ngay với giá %s %s.`, bidder refund `%s đã được mua ngay. Hoàn lại %s %s.`; seller online gets `onDelAuction(id)`
  (`.sql:312-323`). All mail titles `Đấu giá: <name>`, sender `Đấu Giá`.
- **`cancelAuction(id)`** (proxy): only without a bid; goods back by mail `Bạn đã hủy rao bán %s. Vật phẩm được trả lại.`
  (`.sql:353-354`); pushes `onDelAuction(id)` + note `Đã hủy rao bán, vật phẩm được gửi trả vào hộp thư.`.
  **`closeAuction`** no-op.
- **Expiry** (sweeper every minute + at boot): with a bid → goods to the bidder, price to the seller `%s đã được %s đấu giá
  thành công với giá %s %s.`; without → goods back `%s hết thời gian rao bán mà không có người mua. Vật phẩm được trả lại.`
  (`.sql:383-393`).
- **NPC**: type 5 → `onInitViewAuctionP{flag, npcId, myAuctionList: {"<id>": row}}` (`handlers/npc/auction_npc.go`). H5
  NPCs: 283 (map 9), 507 (map 38), 524 (map 31).
- **Refusals** (`application/auction/errors.go:15-52`, verbatim): `Vui lòng đặt vật phẩm cần rao bán!`, `Vui lòng điền số
  tiền chính xác!`, `Vui lòng điền thời gian chính xác!`, `Giá rao bán không được vượt quá giá mua ngay, vui lòng điền lại`,
  `Không thể rao bán vật phẩm đã khóa!`, `Chỉ có thể rao bán vật phẩm trong túi đồ!`, `Không thể rao bán pet đã khóa!`,
  `Pet đang xuất chiến, đi theo hoặc được cưỡi, hãy cho pet nghỉ ngơi trước khi rao bán!`, `Pet đang mang trang bị, hãy tháo
  trang bị pet trước khi rao bán!`, `Đang giao dịch, không thể rao bán hoặc đấu giá!`, `Không đủ Bạc để trả phí rao bán!`,
  `Bạn đang rao bán quá nhiều vật phẩm, hãy đợi bán xong hoặc hủy bớt!`, `Vật phẩm này đã được bán hoặc đã hết hạn rao bán!`,
  `Không thể đấu giá vật phẩm của chính mình!`, `Ra giá quá thấp!`, `Bạn đang là người ra giá cao nhất!`, `Giá đấu đã đạt
  giá mua ngay, hãy dùng Mua ngay!`, `Không thể mua ngay!`, `Bạc không đủ!`, `Vàng không đủ!`, `Đã có người đấu giá, không
  thể hủy rao bán!`, `Cần đặc quyền PM cấp 3 trở lên để đấu giá hàng loạt!`, `Mỗi lần chỉ được rao bán tối đa 10 vật phẩm /
  pet!`; success `Ra giá thành công!`, `Mua thành công! Vật phẩm đã được gửi vào hộp thư.`.
- **Flash UI strings** (`Language.as:868-906, 3295-3311, 498`): column headers `AUCTIONPANEL_S[18..33]`, `[35]` `Bạn xác
  nhận hủy rao bán?`, `[36]` bid over buy-out asks to buy out, `[38]` `Đang tải dữ liệu rao bán, vui lòng chờ...`; buttons
  `AUCTIONPANEL_U` `Đấu giá` `Mua ngay` `Dò tìm` `Rao bán` `Thiết lập lại` `Hủy` `Nhóm rao bán` `Bạc` `Giá rao bán` `Vàng`
  `Thời gian rao bán` `Phí rao bán` `Loại` `Tên` `Cấp` `Giờ` `Đấu giá hàng loạt`; `ITEMSLOTAUCTION_S[0]` `Không thể rao bán
  pet đã khóa!`.

### 2.3 Túi Tiện Dụng (TempBagSlot) and Ma Tâm bag

- **Layout** (`application/item/tempbag_layout.go:1-42`): rows in slot type 3 (`SlotTypeTempBag`). Client addresses items
  by 1-based `posId`; normal posId p → slotIndex `p−1` (≤ 99) / `100+p`; Ma Tâm → `99+p` / `1000+p`; max posId 500. Five
  holder slots per sub-bag (client sids 80–84 normal, 100–104 Ma Tâm). Holders bought with `openTempSlot` /
  `openmxTempSlot` for `COST_ARR = [10, 50, 100, 200, 500]` gold (confirm `TEMP_BAG_U[1]` `Xác nhận trả {cost} vàng để mở ô
  túi mới?`), then a type-517 item is placed with `setTempBag(bagSid, holderSid)` (item consumed).
- **Capacity** = Σ `propl_num` of placed, non-expired holders; template `t` minutes (43200 = 30 days, -1 forever). Seed rows
  (Mongo, 12): 2831 4 Ô (30 ngày), 2832 6, 2833 8, 2834 20 Ô, 2835 30 Ô, 2836 N 4 Ô (14), 2837 N 1 Ô (25), 2838 N 2 Ô (30),
  2805 30 (30 ngày), 2830 50 (30 ngày), 2839 Túi Long Lân 50, 3704 Túi Tiện Dụng VIP 6. Ma Tâm bag +12 base; normal bag 0
  base. VIP right 5 (`data_tbl_pm_right` id 5 value2..9 = 6..48) adds to the normal bag while PM is active.
  Replacement needs more slots, or equal slots over a timed holder (`Chỉ có thể dùng túi tương tự hoặc có số ô nhiều hơn
  để đổi.`).
- **Accept rules** (`tempbag_layout.go:83-110`): normal = non-equipment, not Ma Tâm, kind 6 or 14 or type 503 or 552;
  Ma Tâm = template 5375–5697 / 5770–5841 or type 506. Notes: `Vật phẩm đã vượt quá giới hạn.`, `Chỉ cần đặt vật phẩm nguyên
  liện( Bảo Thạch, Lông Vũ, Nguyên Liệu Chế Tạo, Nguyên Liệu Kỹ Năng Sống).`, `Chỉ có thể đặt Ma Tâm.`, `Túi đồ đã đầy.`,
  `Ô đích đã có vật phẩm khác.` (`handlers/item/tempbag_moves.go:30-35`).
- **Payload** `tBag = {tempList: {posId: {t, n, b, c}}, tempBag: {1..5: {tid, t (expiry ms), ot}}, tempSlotNum, tempbagNum,
  curNum, ot, dire, mx: {same minus dire}}` (research 06 § Data model). Sent at login, by `getTBag`, `updateTempBags(tBag)`
  and as the **reply of `tempBagSort` / `mxBagSort`** (`handlers/item/tempbag.go:1-45`).
- **RPCs** (no reply, pushes only; research 06 table): `addtItemFromBag` / `addmxFromBag(bagSid, posId)` →
  `onMoveToTBag` / `onMoveMXToTBag(bagSid, posId, slotData, curNum)`; `moveItemBtwTemp` / `movemxBtwTemp(from, to)` →
  `onMoveTempBtw` / `onMoveMXBtw(pos1, data1, pos2, data2, curNum)`; `tempToBag` / `mxtempToBag(posId)` and
  `addItemFromTemp` / `addMXFromTemp(posId, bagSid[, num])` → `onAddItemDelTemp` / `onAddItemDelmx(data | null, posId,
  curNum)` + `onAddCharactorSlot`; `delTempSlot` / `delmxTempSlot(posId, md5)` → same with null; `setTempBag` /
  `setmxTempBag(bagSid, holderSid)` → `onDelCharactorSlot` + `updateTempBags`; `setTbagDire(bool)` stores the
  `Trực tiếp đặt vào túi tiện dụng` flag. Whole stacks move rows; merges lower the source before raising the target.
- **`oneKeyOpenAllMXTemp`** opens every Ma Tâm into the Monster Heart bag (`monster-heart.md`) — needs M13.5.
- **Direct routing**: Ma Tâm loot tries the Ma Tâm bag first (`TEMP_BAG_U[10]`); with `dire` on, eligible loot goes to the
  normal temp bag → `onAddTempDirect(effect, posId, slotData, curNum)`, `effect = {s, tt, i, c, t: 29, n, q}`, chat prefix
  `CALLBACK_S[195]` `(Túi Tiện Dụng)Nhận:`.
- UI strings `TEMP_BAG_U[0..14]` (`Language.as:4953-4967`): `Mở`, `Sắp xếp`, `Mở nhanh`, `Mở rộng túi tiện dụng`, `Túi Ma
  Tâm tạm thời`, … 24 slots per page.

### 2.4 Túi tạm thời (TemporaryBagPanel)

- Volatile per-connection list, max 30; Flash warns items vanish on logout / channel / character change
  (`TEMPORARYBAGWARNCANVAS_U[0..3]`, `Language.as:5188-5191`). Title `Túi tạm thời`, `Nhận toàn bộ`, `*Nhấp đôi vào vật
  phẩm để bỏ vào túi tạm thời` (`:5185-5187`).
- `addSingleItemToBag(index)` (0-based in the last list), `addAllToBag()`; pushes `updateTemporaryBag(list)` /
  `warnTemporaryBag(list)` with entries `{itemType (29 | 19), itemId, binded, stackNum, quality}`, `closeWarnTemporaryBag()`
  when empty, `onAddTemporaryItem({t, i, n, c, q, tt, s})` chat line `(Túi tạm thời)nhận được:` (research 02 §2.2).
- Legacy server choice (temp-bag.md): battle loot that does not fit the bag becomes a Túi tạm thời entry instead of being lost.

### 2.5 Bank sort, quick move, multi delete

- `bankSort()` no args, no reply; client disables the button 30 s (`BankPanel.as:2775-2784`). Pushes: pre-sort
  `onAddCharactorSlot` per bank item, `onDelCharactorSlot(id, -1)` per merged-away stack, then `onBankSort([{oldId, newId,
  stackNum}])` keyed by bank sid (`handlers/item/bank_sort.go:1-93`). Same contract as H5 `onItemSort`.
- `bagToBank(sid, dir)` dir 1 bag → bank, 2 bank → bag, only while the bank is open; pushes `onDelCharactorSlot(id, fromSid)`
  + `onAddCharactorSlot(dto)`; full → `onMidNote`; already empty slot → silent (`bank_quick_move.go:1-15`,
  `BankPanel.as:5304`).
- `delBagItems(ids, md5)` and `changeBagGroup(group)` exist only for the **patched** Flash client (`patch_bagclear.go`,
  bag pages > 7). H5 has 7 pages: `changeBagGroup` is a non-goal; `delBagItems` is ported as the multi-select of the
  existing Vứt bỏ mode.

### 2.6 Trade pets

- `tradeAddItem` / `tradeRemoveItem` / `tradeSetMoney` were Go stubs; the Flash client never calls them (trade-system.md
  line 1): it sends everything with `tradeLock`.
- Lock payload pets: `petIds: [5 ids, -1 empty]`. Rules (trade-system.md § Pets): owner; ≤ 5, no duplicates; unbound,
  resting (not battle / follow / mounted), no pet gear; receiver `pets + incoming ≤ petMaxNum`. Pets move before items.
  Success pushes per side: `onDelPet(id)` to the giver, `onAddPet(wrapper)` to the receiver, before `onUPP` and
  `onTradeSuccess`. Refusals `Không thể giao dịch pet đã khóa!`, `Không đủ Ô Pet!`.

### 2.7 Shop leftovers

- **Credit point shops** (`TBL_CREDIT`, NpcShopPanel): `openShopById(shopId)` push opens the panel
  (`handlers/npc/credit_shop_npc.go:31`, `npc_script.go:358,374,443`); the panel calls `updateLimit()` → `{dayDict,
  weekDict, monthDict, totalDict}` (`NpcShopPanel.as:304,372-383`); `exchangeItem(creditId, num)` → the counter dict of the
  credit's limitType (`NpcShopItemDisplay.as:241`, `shop-system.md` § Point Shops). Order: bag fits whole amount → limit
  reserve → charge → grant → refund + release on failure. limitType 0 none, 1 day, 2 week (Monday), 3 month, 4 lifetime.
  Bound per `bind`, colour `ceil(quality/5)`. Shops (Mongo `data_tbl_credit`, `c_type1` → `NPCSHOP_CONFIG[shopId].prop`,
  `ViewManager.as:379-440`): 1 Shop Kết Tinh 96 rows cType 32 `wisdonCrystal` (no limits); 2 Shop Dũng Khí 27 rows 34
  `couragePoint` (week / month); 3 (70) 41 `heroScore2507`; 4 (6) 49 `anni2017`; 5 (18) 66 `xmCandy24`; 6 Điểm thưởng (22)
  67 `xcds2403p`; 7 (5) 68 `txkc2508p`; 8 Truy tìm kho báu (3) 70 `dmbk2509p`; 9 Lễ hội (5) 72 `tkyyhpointV2`. NPC 2318
  "Shop Dũng Khí" → shop 2. Strings `NPC_SHOP_PANEL[0..3,100..106]` (`Language.as:7883-7901`).
- **Guild shop 83** (NPC 1117, map 49): `p_type1 20` / `p_type2 21` (normal / donate contribution, e.g. slot 3449: 300 +
  5000). Gate: member of a guild level ≥ 3, notes `Chỉ thành viên bang hội mới có thể mua ở Shop Bang Hội.` /
  `Bang hội cần đạt cấp %d mới có thể sử dụng Shop Bang Hội.` (`handlers/npc/guild_shop_gate.go:15-45`); after a buy
  `onUPP{guildContrib, donateContrib}`.
- **`buyItemClient(shopSlotId, num)`**: proxy variant of `buyAmountItemClient` from NumPanel TYPE_BUY (`NumPanel.as:315`):
  no reply; pushes `onBlueMsg "Mua thành công x%d! Mất %d %s."`, `onAddItem`, slot pushes, balance; refusal `onRedMsg
  "Mua thất bại: …"` (`handlers/shop/purchase.go:46-76`).
- **`buySystemItemMulti(buyList, carStyle)`**: `buyList` = `{shopSlotId: num}` dictionary (`SystemShopTrolleyPanel.as:846-853`,
  `:337`); confirm `SYSTEMSHOPPANEL_U[40]` `Bạn cần trả tổng cộng {totalGold} vàng, xác nhận mua?`. Reply `{success, items}`;
  pushes `onAddItem` per item, `onAddCharactorSlot` per slot, `onUPP{key: total}` (`purchase.go:183-257`). Whole cart is
  capacity-checked and paid first; a failure part way refunds the rest (shop-system.md § Mall purchase).
- **`getShopAwardStr()`** → string; Go returns `""` (`application/shop/service.go:523-528`); the client then shows
  `SYSTEMSHOPPANEL_U[45]` `Tạm thời không có`.
- **`openShopDirect(shopId)`** → pushes `onOpenShop(shopId)` (`handlers/shop/misc.go:69-90`); Flash callers: pet arena
  panels with shops 98 and 115 (`PetArenaPanel.as:1948`, `PetArenaActivityPanel.as:1920`). **`shopClosePanel()`** no-op
  (`misc.go:14-17`, `ShopPanel.as:1252`, RPC_DELAY 1100 ms).
- **`getLimitTimeShop`** must reply non-null (`{}` = nothing on sale); **`buyLimitTimeItem(id, num)`** proxy. The data is a
  dashboard-managed Postgres table (`limit_time_shop_entry`, migration `20261030120000`): **no seed rows**.

## 3. Decisions for H5

1. **Single process, always available**: NPC types 3 and 5 are spawned and usable on every map they sit on (no auction line).
2. **No secondary password** (as elsewhere in H5): `addMail` ignores arg 3, `delTempSlot` ignores the md5. `takeMail(id,
   confirm)` keeps the Flash shape; for COD mail any truthy 2nd argument is the player's confirmation (the client sends
   `'cod'` after the `MAIL_PANEL_U` confirm); without it the server answers 0 + `MAIL_PANEL_U[5]`.
3. **Level gate**: one shared constant `PLAYER_EXCHANGE_MIN_LEVEL` used by `addMail`, `addAuction*`, `auctionBid*` (and
   available to trade). **Default 0** (stock Flash behaviour, same as current H5 trade); the legacy Open Beta value was 60.
4. **Escrow by row move, not snapshots**: H5 items and pets keep their id when they change owner (trade already does this).
   An attached / listed item row moves to `characterId 0, slotType ESCROW (90), slotIndex = itemId, escrowRef
   'mail:<id>' | 'auction:<id>'` with a conditional `updateOne`; a pet gets `characterId 0, escrowRef`. Delivery = one
   conditional `updateOne` into the receiver's free slot. Equipment rolls, star and durability survive for free; nothing is
   ever cloned, so a crash cannot duplicate goods (worst case: goods stay in escrow, visible to an admin script).
5. **Money without transactions**: the trade saga pattern (`trade-swap.ts runSaga`): conditional `spendMoney` first,
   then the document write, `addMoney` undo on failure. Mail / listing state changes are conditional `findOneAndUpdate`s
   (`claimed: false → true`, `status: 'active' → …`), so double clicks and the sweeper cannot settle twice.
6. **Locks**: per-character `withCharLock` for sender / taker; a new generic `withKeyLock('auction:<id>')` (same file) for
   bids / buy-out / cancel / expiry of one listing. Two-character operations lock in ascending id order (trade rule).
7. **Deliveries are system mails** (auction, COD payment, returns, events) through one `MailService.sendSystemMail` API
   that supports (a) template attachments created on take and (b) an escrowed item / pet reference. Idempotency key
   `source` (unique sparse index), e.g. `auction:17:goods`, so a retried settlement never sends twice.
8. **Display data**: H5 has no static client tables, so mail and auction rows carry a resolved view (`name`, `iconCode`,
   `color`, `tplType`, `reqLevel`, optional `item: BagItem` / `pet: PetWrapper` for tooltips) next to the legacy keys.
   `itemType/itemId/stackNum` keep legacy meaning (template table + template id) for traceability.
9. **Auction search**: server filters kind **and** type / level / name (H5 client cannot resolve templates); reply keeps
   `{arg, version, list}`. 10 rows per page in H5 (smaller panel), 500 newest max.
10. **Temp bag storage**: slot type 3 (`TEMP_BAG`) rows in `character_items`, legacy slotIndex layout; holders and `dire`
    in a new `Character.tempBag` sub-document (not in `character_items`, holders are consumed). VIP right 5 bonus read from
    `data_tbl_pm_right` id 5 through `PmStateService.levelOf`.
11. **Routing into temp bags** (phase C): battle loot only (Ma Tâm → Ma Tâm bag first; `dire` → normal temp bag; bag full →
    Túi tạm thời). Shop / quest / mail grants keep going to the bag (legacy's global rewriter is not ported).
12. **`oneKeyOpenAllMXTemp`**: registered, answers `onSystemMidMsgOrNote("Chức năng Mở nhanh chưa hỗ trợ.")` until M13.5.
13. **Dead trade RPCs** `tradeAddItem` / `tradeRemoveItem` / `tradeSetMoney`: **not registered** (Flash never calls them;
    Go only stubbed them). 11.4 is closed by pets in `tradeLock`.
14. **Credit point balances**: new `Character.points: Map<string, number>` keyed by the `NPCSHOP_CONFIG.prop` names, sent
    at login as `PlayerData.points`, with `CharacterService.addPoints / spendPoints` for later events. Balances start at 0;
    shops open and are browsable now, sources arrive with their features (M14–M16).
15. **Limit-time shop**: no seed data → `getLimitTimeShop` returns `{}` and `buyLimitTimeItem` answers `onRedMsg("Mua thất
    bại: đợt bán đã kết thúc")`. Engine deferred to M16.
16. **`openShopDirect`** whitelists shop ids 98 and 115 (pet arena shops) and pushes the H5 `onOpenShop` payload; others →
    `notFound('shop')`. No proximity check (pet arena is not on a map NPC).
17. New RPCs are registered **without `quiet`**.

## 4. Shared protocol additions

New files re-exported from `packages/shared/src/index.ts`: `mail.ts`, `auction.ts`, `tempBag.ts`, `creditShop.ts`; edits
to `trade.ts`, `inventory.ts`, `protocol.ts`, `payment.ts`.

```ts
// mail.ts — Thùng Thư: showMailP / addMail / takeMail / setReadDate / delMail / delMails / closeMail;
// pushes initViewMailMngP(), onAddMail(MailView | MailError), onDelMail(id).
export const MAIL = { BOX_MAX: 100, SUBJECT_MAX: 100, TEXT_MAX: 1000, UNREAD_DAYS: 30, READ_DAYS: 10, PAGE: 12,
  LOGIN_NOTICE: 5, LOGIN_DELAY_MS: 6000 } as const;
export const MailAttachType = { ITEM: 9, PET: 39, NONE: -1 } as const;      // addMail obj.type
export const MailItemTable = { ITEM: 29, EQUIP: 19, PET: 12, NONE: -1 } as const; // MailView.itemType
export const SYSTEM_SENDER = 'Hệ thống';
export interface MailView {
  id: number; senderId: number | '0'; receiverId: number; sn: string; receiverName: string;
  subject: string; text: string; money: number; gold: number;
  codMoney: number; codGold: number; codFlag: 1 | -1;
  itemType: number; itemId: number; stackNum: number; date: number; readDate: number; // ms, -1 unread
  returned: boolean;
  attachment?: MailAttachmentView; // H5: resolved display (name, iconCode, color, item?: BagItem, pet?: PetWrapper)
}
export interface MailError { id: -1; type: 'noSuchReceiver' | 'overMaxMail' }
export interface ShowMailReply { mailList: Record<string, MailView>; currentTime: number }
export interface AddMailArg { subject: string; text: string; codFlag: 1 | -1; codMoney: number; codGold: number;
  money: number; gold: number; type?: number; id?: number; readDate?: -1 }
export interface SetReadDateReply { id: number; newDate: number }
export const MAIL_TEXT = { SELF: 'Không thể tự gửi thư cho mình!', MONEY: 'Lỗi số vàng điền vào!', /* … §2.1 verbatim */ } as const;
export function mailRemainingDays(m: Pick<MailView, 'date' | 'readDate'>, now: number): number; // Flash int() truncation
export function mailHasContent(m: Pick<MailView, 'money' | 'gold' | 'itemType'>): boolean;

// auction.ts — auctionSearch / addAuction / addAuctionMoreByPM / auctionBid / auctionBidMax / cancelAuction / closeAuction;
// pushes onInitViewAuctionP, onAddAuction(AuctionRow), onDelAuction(id).
export const AuctionType = { MONEY: 1, GOLD: 2 } as const;
export const AUCTION = { MIN_HOURS: 1, MAX_HOURS: 48, FEE_PER_HOUR: 5, MAX_ACTIVE: 20, MAX_PRICE: 999_999_999,
  SEARCH_LIMIT: 500, PM_BATCH_LEVEL: 3, PM_BATCH_MAX: 10, PET_KIND: 7, PET_TYPE_BASE: 700, BID_ADD: [10, 1] } as const;
export interface AuctionRow {
  id: number; ownerId: number; type: 28 | 18 | 39; itemId: number; stackNum: number; name: string; color: number;
  auctionType: 1 | 2; nowMoney: number; nowGold: number; maxMoney: number; maxGold: number;
  itemKind: number; itemType: number; reqLevel: number; duration: number; wn: string; pn: string; lastTime: string;
  iconCode: string; item?: BagItem; pet?: PetWrapper; // H5 display
}
export interface AuctionSearchArg { kind: number; type: number; levelLow: number; levelHigh: number; name: string;
  npcId: number; version: number }
export interface AuctionSearchReply { arg: AuctionSearchArg; version: number; list: Record<string, AuctionRow> }
export interface AddAuctionArg { auctionType: number; slotId: number; petId: number; stackNum: number; type: number;
  itemId: number; nowMoney: number; maxMoney: number; nowGold: number; maxGold: number; duration: number }
export interface AuctionBidReply { flag: boolean; info: string; auctionData?: AuctionRow }
export interface AuctionBidMaxReply { flag: boolean; info: string; auctionId?: number }
export interface InitViewAuction { flag: boolean; npcId: number; myAuctionList: Record<string, AuctionRow> }
export function auctionFee(start: number, buyout: number, type: number, hours: number): number; // §2.2, unit-tested
export function auctionLastTime(endsAt: number, now: number): string;
export function petAuctionType(classId: number): number;

// tempBag.ts — Túi Tiện Dụng + Túi tạm thời contracts (§2.3, §2.4).
export const TEMP_BAG = { HOLDERS: 5, HOLDER_TYPE: 517, MX_BASE: 12, MAX_POS: 500, PAGE: 24,
  HOLDER_COST: [10, 50, 100, 200, 500], NORMAL_HOLDER_SID: 80, MX_HOLDER_SID: 100, TEMPORARY_MAX: 30 } as const;
export interface TempSlotData { t: number; n: number; b: 0 | 1; c: number }
export interface TempHolder { tid: number; t: number; ot: 0 | 1 } // t = expiry ms (0 forever)
export interface TempSubBag { tempList: Record<string, TempSlotData>; tempBag: Record<string, TempHolder>;
  tempSlotNum: number; tempbagNum: number; curNum: number; ot: 0 | 1 }
export interface TBag extends TempSubBag { dire: 0 | 1; mx: TempSubBag }
export interface TemporaryEntry { itemType: 29 | 19; itemId: number; binded: 0 | 1; stackNum: number; quality: number;
  name: string; iconCode: string } // last two H5 display
export function tempIndex(mx: boolean, pos: number): number;   // legacy layout, unit-tested both ways
export function tempPos(slotIndex: number): { pos: number; mx: boolean } | null;
export function acceptsNormalTemp(tpl: { kind: number; type: number }, templateId: number): boolean;
export function isMaTam(tpl: { type: number }, templateId: number): boolean;

// creditShop.ts — openShopById(OpenCreditShop), updateLimit() -> CreditLimits, exchangeItem(creditId, num) -> Record<string, number>.
export const CREDIT_SHOPS: Readonly<Record<number, { name: string; prop: string; hint: string; score: string }>>; // NPCSHOP_CONFIG copy
export const CREDIT_CTYPE_PROP: Readonly<Record<number, string>> = { 32: 'wisdonCrystal', 34: 'couragePoint',
  41: 'heroScore2507', 49: 'anni2017', 66: 'xmCandy24', 67: 'xcds2403p', 68: 'txkc2508p', 70: 'dmbk2509p', 72: 'tkyyhpointV2' };
export const CreditLimitType = { NONE: 0, DAY: 1, WEEK: 2, MONTH: 3, TOTAL: 4 } as const;
export interface CreditSlotView { creditId: number; tab: number; position: number; type: 29 | 19; itemId: number;
  name: string; iconCode: string; color: number; bind: 0 | 1; cType1: number; cNum1: number; limitType: number; limitNum: number }
export interface OpenCreditShop { shopId: number; name: string; prop: string; score: string; hint: string;
  balance: number; tabs: string[]; slots: CreditSlotView[] }
export interface CreditLimits { dayDict: Record<string, number>; weekDict: Record<string, number>;
  monthDict: Record<string, number>; totalDict: Record<string, number> }
export function creditPeriodKey(limitType: number, now: number): string; // game-timezone buckets, unit-tested
```

Edits:
- `inventory.ts`: `SlotType.TEMP_BAG = 3`, `SlotType.ESCROW = 90` (server-only meaning, never sent as a sid).
- `trade.ts`: `TradeOffer.pets: number[]` (≤ `TRADE_MAX_PETS = 5`), `TargetLock.petIds` filled + `petList: PetWrapper[]`.
- `protocol.ts`: `PlayerData.tBag: TBag`, `PlayerData.points: Record<string, number>`, `PlayerData.mailUnread: number`;
  `PLAYER_EXCHANGE_MIN_LEVEL = 0`; `PlayerUpdate` accepts `points`, `guildContrib`, `donateContrib`.
- `payment.ts`: `BuySystemItemMultiReply { success: boolean; items: AddItemNotice[] }`; `SHOP_DIRECT_IDS = [98, 115]`.

## 5. Server design

### 5.1 Escrow and locks (phase A, `modules/inventory/`)

- `char-lock.ts`: add `withKeyLock(key: string, fn)` (same tail-map technique; `withCharLock` delegates to it).
- `escrow.service.ts` (new, ~120 lines): `escrowItem(cid, itemId, ref, rules)` (conditional move of an unbound bag-tab row
  into `ESCROW`), `releaseItem(itemId, ref, toCid)` (first free bag slot of the receiver via `InventoryService.capacity`
  and `planAdd`; equipment never stacks; stackables merge only if a matching stack exists, else a new slot), `escrowPet`,
  `releasePet(petId, ref, toCid)` (checks `petMaxNum`), `destroy(ref)`. Every step is one conditional `updateOne`.
- `CharacterItem` schema: `escrowRef?: string` (`@Prop({ index: true, sparse: true })`). `Pet` schema: `escrowRef?: string`.
- Pet transfer rule shared by mail / auction / trade: `pet/pet-transfer.ts` (pure): unbound, `state === REST`, not
  following, no `equ` entries, not mounted → `{ok} | {reason}` with the Vietnamese texts per caller.

### 5.2 Mail (phase A, new `modules/mail/`)

| File | Content |
|---|---|
| `mail.schema.ts` | `Mail` (`mails`): `_id` (counter `mails`), `receiverId` (index), `senderId` (0 system), `senderName`, `subject`, `text`, `money`, `gold`, `codMoney`, `codGold`, `attachment?: {kind: 'item' \| 'pet' \| 'template', itemId?, petId?, templateId?, table?, count?, bound?, quality?}`, `itemType`, `itemId`, `stackNum` (legacy display), `claimed` (false), `returned` (false), `readAt` (null), `source?` (unique sparse), timestamps. Indexes `{receiverId: 1, createdAt: -1}`, `{createdAt: 1}`, `{readAt: 1}`. |
| `mail-rules.ts` (+test) | arg parsing/validation of `AddMailArg`, clip, HTML escape, expiry predicate, return-mail text builder, COD rules. |
| `mail-view.ts` | doc → `MailView` (resolves template name / icon, item `BagItem` from escrow, pet wrapper). |
| `mail.service.ts` | `list`, `send` (saga: debit gift → escrow attachment → insert; undo reverse), `take` (claim → COD spend → release / create → credit gift → COD payment mail; undo reverse), `markRead`, `delete(ids)` (return mail for player content, destroy system attachments), `unread(n)`. |
| `mail-system.service.ts` | **public API** `sendSystemMail({receiverId, title, text, senderName?, money?, gold?, item?: {templateId, table: 29 \| 19, count, bound, quality}, escrow?: {itemId} \| {petId}, source?})` → `MailView \| null`; `broadcast({minLevel, maxLevel}, mail)` for events. Pushes `onAddMail` to an online receiver via `SceneManager.findByCharacter`. Exported by `MailModule`. |
| `mail-sweep.service.ts` | `onModuleInit` sweep + `setInterval` 1 h: expired mails in batches of 500 → same path as delete; `onDelMail` to online owners. |
| `mail.rpc.ts` | the 7 RPCs (`requireCharacter`; `addMail`, `takeMail` `forbidInBattle`). |
| `mail.module.ts` | imports Inventory, Character, Pet, GameData; `addLoginExtra` → `{mailUnread}` and schedules the 6 s login notice. |

- `takeMail` grant for a template attachment uses `InventoryService.canFit` + `add` (bound / colour from the mail); for
  `item` / `pet` attachments `EscrowService.release*`. Pushes as §2.1 (H5 has no `onCreateItemInstance`: skip it).
- Refuse `addMail` / `takeMail` of items while the caller has a locked trade offer (`TradeManager.isLocked(cid)`, new
  helper) with `Đang giao dịch, không thể thao tác vật phẩm!`.
- NPC: `npc.rpc.ts` `clickNpc` and `npcFuncClick` → `NpcType.MAIL` → `session.callback('initViewMailMngP')`.

### 5.3 Auction (phase B, new `modules/auction/`)

| File | Content |
|---|---|
| `auction.schema.ts` | `AuctionListing` (`auction_listings`): `_id` (counter `auctions`), `sellerId`, `sellerName`, `goods: {kind: 'item' \| 'pet', id}`, display (`clientType`, `name`, `color`, `iconCode`, `itemKind`, `itemType`, `reqLevel`, `stackNum`, `templateId`), `auctionType`, `startPrice`, `buyoutPrice`, `currentPrice`, `bidderId` (0), `bidderName`, `fee`, `durationHours`, `endsAt`, `status` (`active` \| `sold` \| `expired` \| `cancelled`). Indexes `{status: 1, itemKind: 1, endsAt: 1}`, `{sellerId: 1, status: 1}`, `{status: 1, endsAt: 1}`. |
| `auction-rules.ts` (+test) | arg parsing, price / duration validation, fee, bid checks, refusal texts, row mapping. |
| `auction-listing.service.ts` | list one / batch: cap 20 (count active) → fee `spendMoney(preferred silver)` → `escrow*('auction:<id>')` → insert (undo: release + refund fee). PM batch: `PmStateService.levelOf ≥ 3`. |
| `auction-bid.service.ts` | under `withKeyLock`: bid = spend → conditional update `{_id, status: active, currentPrice: seen, bidderId: seen}` → outbid refund via `sendSystemMail(source 'auction:<id>:refund:<n>')`; buy-out = spend → status `sold` → goods + price mails; undo refunds. |
| `auction-settle.service.ts` | cancel (no bid) and expiry sweeper (`setInterval` 60 s + boot), each `findOneAndUpdate` on `status: 'active'` first, then the mails (escrowRef moves from `auction:<id>` to `mail:<mailId>`), seller `onDelAuction`. |
| `auction.rpc.ts` | the 7 RPCs; proxy ones return `null` and push notes via `onSystemMidMsgOrNote`. |

NPC type 5 → `onInitViewAuctionP{flag: true, npcId, myAuctionList}`. Refuse every auction mutation while trading.

### 5.4 Bags (phase C, `modules/inventory/` + new `modules/tempbag/`)

- `Character` schema: `tempBag: {n: {opened: 0, holders: [{tid, num, exp}]}, mx: {...}, dire: false}` (defaults on read).
- `tempbag/tempbag-rules.ts` (+test): capacity (holders + VIP right 5 + Ma Tâm base), accept rules, holder replacement,
  move / merge / split planning over posIds (pure, like `bag-rules.ts planMove`).
- `tempbag/tempbag.service.ts` (< 300 lines; split `tempbag-moves.service.ts` for the bag ↔ temp moves): payload builder,
  every RPC of §2.3 under `withCharLock`, gold through `spendMoney('gold')` for holders (`openTempSlot`).
- `tempbag/tempbag.rpc.ts` (19 RPCs) + `tempbag.module.ts`; login `tBag` through `addLoginExtra`.
- `tempbag/temporary-bag.service.ts`: per-session list (`Session` field `temporaryBag: TemporaryEntry[]`, dropped on
  disconnect / character change), `offer(session, entries)`, `addSingleItemToBag`, `addAllToBag`.
- `combat/battle-loot.service.ts` `credit()`: route Ma Tâm → Ma Tâm bag (`onAddMXTempDirect`), `dire` + eligible → normal
  temp bag (`onAddTempDirect`), bag full → Túi tạm thời (`warnTemporaryBag` + `onAddTemporaryItem`) instead of `bagFull`.
- `inventory/bank.service.ts` (new): `bankSort` (reuse `planSort` over bank sids, staging offset like `bagSort`) and
  `bagToBank(sid, dir)` (both need `session.bankOpen`); `bag-ops.service.ts` `delBagItems(ids)` (owned bag / quest / pet
  page rows only, `onDelCharactorSlot` each + one `onMidNote`).

### 5.5 Trade pets (phase D, `modules/trade/`)

- `trade-rules.ts`: validate `offer.pets` (owner, ≤ 5, distinct, `pet-transfer.ts`); receiver room `petCount + incoming −
  outgoing ≤ petMaxNum`. `tradeLock` accepts Flash `petIds` (filter -1) as well as H5 `pets`.
- `trade-swap.ts`/`.service.ts`: pet move steps (conditional `updateOne` on `{_id, characterId: from, binded: 0, state:
  REST}` → `characterId: to`, `following: false`), placed **before** item moves; undo moves them back.
- `trade.service.ts` `pushSuccess`: `onDelPet(id)` to the giver, `onAddPet(wrapper)` to the receiver, before `onUPP`.
  `onTargetLock` carries `petIds` + `petList`.

### 5.6 Shop leftovers (phase E, `modules/shop/`)

- `credit-shop.schema.ts`: `CreditPurchase` (`character_credit_limits`): `{characterId, creditId, period, count}` unique
  `{characterId: 1, creditId: 1, period: 1}`; `$inc` with `count + n ≤ limit` filter as the reservation.
- `credit-shop.service.ts` + `credit-shop.rpc.ts`: `exchangeItem`, `updateLimit`, `buildOpen(shopId)`; `GameDataService`
  accessors `creditRows(shopId)`, `credit(id)` (cached at `reload()` like shops).
- `CharacterService.addPoints / spendPoints(id, prop, n)` (conditional `$inc` on `points.<prop>`), pushes `onUPP{[prop]: total}`.
- NPC routing (`npc.rpc.ts`): `CREDIT_SHOP_NPCS = {2318: 2}` → `openShopById(OpenCreditShop)`; guild shop gate for shop 83
  using `GuildService` member + level; `shop-buy.ts` `resolvePrice` gains special currencies 20/21 (guild contributions via a
  `GuildService.spendContribution(cid, normal, donate)` conditional update) — other special types stay refused.
- `shop.rpc.ts`: `buyItemClient` (same as `buyAmountItemClient`, returns null), `shopClosePanel` (null), `openShopDirect`.
- `mall.rpc.ts`: `buySystemItemMulti(buyList)` (cart: parse dictionary, `canFitAll`, one total `spendMoney`, adds, refund
  of unadded remainder), `getShopAwardStr` → `''`, `getLimitTimeShop` → `{}`, `buyLimitTimeItem` → red note.

### 5.7 Seeds and data

No new seed import: `data_tbl_credit`, `data_tbl_item_template` (517 rows), `data_tbl_pm_right`, `data_tbl_creature`,
`data_tbl_shop(_slot)` are already imported by `pnpm import:seeds`. New counters `mails`, `auctions` (created on first use).
No migration script: new character fields default on read.

## 6. Client design

| Area | Files | Notes |
|---|---|---|
| Mail | `game/MailController.ts`, `ui/mail/mailPanel.ts` (tabs Hệ thống / Người chơi / Viết thư, list 12/page, Chọn hết, Xóa), `ui/mail/mailRead.ts` (body via a tag whitelist like legacy `safeMailHtml`, Nhận, Trả lời, Xóa, COD confirm), `ui/mail/mailCompose.ts` (receiver, subject, text, Tặng money/gold, Thu phí, attachment picker: unbound bag-tab items + resting pets), `ui/mail/mail.css` | `initViewMailMngP` opens it; `onAddMail` to self → toast + badge, sender echo → "Gửi thư thành công cho [name]" and reset; `{id:-1}` → `MAILMANAGERPANEL_S[4]/[13]`. |
| Mail notice | `ui/hud/mailNotice.ts` | Blinking envelope above the minimap while `mailUnread > 0` (login field + pushes); click shows the latest sender/subject (Flash MailNoticePanel). Art: render `e_ICON_MAIL_*` / `MailNoticePanel` symbols with `swfui -match` (swf-asset-pipeline skill); CSS fallback until then. |
| Auction | `game/AuctionController.ts`, `ui/auction/auctionPanel.ts` (tabs Đấu giá / Rao bán, Đấu giá hàng loạt for PM ≥ 3), `auctionSearch.ts` (Loại/Phân loại from `ITEM_TYPE_NAME` + kind names, Tên, Cấp, Dò tìm, 10 rows, bid bar, Mua ngay), `auctionSell.ts` (goods picker, Bạc / Vàng, Giá rao bán, Giá mua ngay, Thời gian 1..48, live Phí rao bán via shared `auctionFee`, own listings + Hủy), `auction.css` | `onInitViewAuctionP` opens; `onAddAuction` / `onDelAuction` update own list; wallet from `onAddMoney`. |
| Temp bag | `game/TempBagController.ts`, `ui/tempBagPanel.ts` (tabs Túi Tiện Dụng / Túi Ma Tâm tạm thời, 24-slot pages, 5 holder slots with Mở + cost confirm, Sắp xếp, Mở nhanh, checkbox `Trực tiếp đặt vào túi tiện dụng`), `ui/tempBag.css` | Opened from a new bag-panel toolbar button `Túi tiện dụng` (H5 placement; open question). Drag bag ↔ temp, double-click temp → bag, drag type-517 item onto a holder, Shift-drop splits (amount dialog). |
| Túi tạm thời | `ui/temporaryBagPanel.ts` + HUD blinking icon in `hud/mainHud.ts` | `warnTemporaryBag` shows the icon; double-click / Nhận toàn bộ. Hidden during battle. |
| Bank | `ui/bankPanel.ts` | Sắp xếp button (confirm "Xác nhận sắp xếp kho?", 30 s disable), double-click bank item → `bagToBank(sid, 2)`; `BagController` deposit switches to `bagToBank(sid, 1)`; `onBankSort` handler. Bag Vứt bỏ mode gains multi-select → `delBagItems`. |
| Trade | `ui/tradePanel.ts`, `game/TradeController.ts` | 5 pet slots per side; own pets added from a pet picker (resting, unbound); partner pets rendered from `petList`. |
| Shops | `ui/creditShopPanel.ts` (+ css) for `openShopById` (tabs, 4x3 grid, balance line `score`, limit "còn lại", amount dialog → `exchangeItem`); `ui/mallPanel.ts` cart (Thêm vào xe, Xe hàng list, total + `SYSTEMSHOPPANEL_U[40]` confirm → `buySystemItemMulti`); `ui/shopPanel.ts` close → `shopClosePanel`; guild currencies in `ui/shopCell.ts` price labels. |
| NPC dialog | `ui/npcDialog.ts` | `FUNC_LABELS[MAIL] = 'Thùng thư'`; auction label stays `Rao bán`. |

## 7. Phases

### Phase A — Mail + escrow + system mail API

| Layer | Touch points |
|---|---|
| shared | `mail.ts` (+test), `inventory.ts` (`TEMP_BAG`, `ESCROW`), `protocol.ts` (`mailUnread`, `PLAYER_EXCHANGE_MIN_LEVEL`), `index.ts` |
| server | `inventory/char-lock.ts`, `inventory/escrow.service.ts`, `character-item.schema.ts`, `pet/pet.schema.ts`, `pet/pet-transfer.ts` (+test), `modules/mail/*`, `npc/npc.rpc.ts`, `trade/trade.manager.ts` (`isLocked`), `app.module.ts` |
| client | `game/MailController.ts`, `ui/mail/*`, `ui/hud/mailNotice.ts`, `ui/npcDialog.ts`, `main.ts` wiring |

- [ ] shared mail types + helpers + tests; rebuild shared
- [ ] escrow service + pet transfer rule (+tests on pure parts)
- [ ] mail schema, rules (+test), view, service, system API, sweeper, RPCs, NPC type 3, login notice
- [ ] client panel (list / read / compose / take / delete / batch), notice icon
- [ ] dev check: a GM `sendSystemMail` path exercised by a `requireGm` RPC `devSendMail(name, templateId, count)` (H5 dev tool)
- [ ] `docs/memory/mail.md` + index link

### Phase B — Auction (needs A)

| Layer | Touch points |
|---|---|
| shared | `auction.ts` (+test: fee, lastTime, pet type) |
| server | `modules/auction/*`, `npc/npc.rpc.ts` (type 5), `vip/pm-state.service.ts` (export `levelOf`), `gamedata` (`creature(id).class_id`) |
| client | `game/AuctionController.ts`, `ui/auction/*` |

- [ ] rules + tests (fee, validation, bid ordering, settle outcomes over a fake store)
- [ ] listing / bid / settle services, sweeper, RPCs, NPC hook
- [ ] client search / sell / bid / buy-out / cancel / PM batch
- [ ] `docs/memory/auction.md` + index link

### Phase C — Temp bags, Túi tạm thời, bank sort

| Layer | Touch points |
|---|---|
| shared | `tempBag.ts` (+test: index layout, accept rules), `protocol.ts` (`tBag`) |
| server | `character.schema.ts` (`tempBag`), `modules/tempbag/*`, `gateway/session.ts` (`temporaryBag`), `combat/battle-loot.service.ts`, `inventory/bank.service.ts`, `inventory/bag-ops.service.ts` + `.rpc.ts` (`delBagItems`), `inventory/inventory.service.ts` (exclude TEMP_BAG / ESCROW from `list`) |
| client | `game/TempBagController.ts`, `ui/tempBagPanel.ts`, `ui/temporaryBagPanel.ts`, `ui/bagPanel.ts`, `ui/bankPanel.ts`, `game/BagController.ts`, `ui/hud/mainHud.ts` |

- [ ] rules + tests; payload builder matches §2.3 keys
- [ ] 19 temp-bag RPCs (`oneKeyOpenAllMXTemp` refusal), login `tBag`, VIP right 5
- [ ] loot routing + Túi tạm thời (offer / take / take all, cleared on disconnect)
- [ ] `bankSort`, `bagToBank`, `delBagItems`
- [ ] client panels; update `docs/memory/inventory.md`, `economy.md`; new `docs/memory/temp-bag.md`

### Phase D — Trade pets

| Layer | Touch points |
|---|---|
| shared | `trade.ts` |
| server | `trade/trade-rules.ts` (+test), `trade-swap.ts` (+test), `trade-swap.service.ts`, `trade.service.ts`, `pet/pet-transfer.ts` |
| client | `ui/tradePanel.ts`, `game/TradeController.ts` |

- [ ] pet offer validation + room check (+tests), pet saga steps before items, pushes
- [ ] client pet slots + picker; update `docs/memory/trade.md`

### Phase E — Shop leftovers

| Layer | Touch points |
|---|---|
| shared | `creditShop.ts` (+test: period keys), `payment.ts`, `protocol.ts` (`points`, guild contrib in `PlayerUpdate`) |
| server | `shop/credit-shop.*`, `shop/shop-buy.ts` (+test special 20/21), `shop/shop.rpc.ts`, `shop/mall.rpc.ts` + `mall.service.ts`, `character.schema.ts`/`.service.ts` (`points`), `guild/guild.service.ts` (`spendContribution`, membership level), `gamedata.service.ts` (credit cache), `npc/npc.rpc.ts` |
| client | `ui/creditShopPanel.ts`, `ui/mallPanel.ts` (cart), `ui/shopPanel.ts`, `ui/shopCell.ts`, `game/MallController.ts` |

- [ ] credit shops (2318 → shop 2), `exchangeItem`, `updateLimit`, points API
- [ ] guild shop 83 gate + contribution prices
- [ ] `buyItemClient`, `shopClosePanel`, `openShopDirect`, `buySystemItemMulti`, `getShopAwardStr`, `getLimitTimeShop`, `buyLimitTimeItem`
- [ ] client credit panel, mall cart; update `docs/memory/shop.md`, `economy.md`

Order: A → B; C, D, E independent of each other and of A/B (D and C reuse the escrow-free saga only).

## 8. Non-goals

- Auction line / line change, cross-server mail, `allServerMailsWarning` (stays absent), admin dashboard and HTTP mail
  endpoint (only the in-process `sendSystemMail` API + a GM dev RPC).
- `changeBagGroup` (patched-client paging beyond 7 pages), `oneKeyOpenAllMXTemp` behaviour (M13.5 Monster Heart),
  global temp-bag routing of non-loot grants, temp-bag materials counting for crafting / quests (legacy limit too).
- `tradeAddItem` / `tradeRemoveItem` / `tradeSetMoney`, the trade "Đã mất / Đã nhận" chat summary, Discord audit.
- Limit-time shop engine and dashboard, sources of credit points (events), secondary password / money lock.
- Gathering routing (`onAddTempDirect` from fishing / herbs) — comes with M15 life skills.

## 9. Verification

- `pnpm --filter @mc/shared build`, `pnpm -r lint`, `pnpm -r test` green.
- Unit tests (node:test, no Mongo): `mail.test.ts` (remaining days, content, arg parse), `mail-rules.test.ts` (validation
  order, COD rules, return text), `auction.test.ts` (fee incl. rounding, lastTime, pet type), `auction-rules.test.ts`
  (bid refusals, settle outcomes over an in-memory fake), `tempBag.test.ts` (index ↔ pos round trip over 1..500 both bags,
  accept rules), `tempbag-rules.test.ts` (capacity with expired holders, VIP bonus, replacement, merge/split),
  `pet-transfer.test.ts`, `trade-rules.test.ts` (pets), `trade-swap.test.ts` (pet undo), `creditShop.test.ts` (period keys
  across midnight / Monday / month in GMT+7), `shop-buy.test.ts` (special 20/21).
- Browser (two tabs, dev server): send a mail with an item + gift + COD, take it on the other character, check bags,
  wallets, COD payment mail; delete an unread player mail → "Thư bị trả lại" arrives; list an item and a pet, bid from the
  other tab (outbid refund mail), buy out, cancel, short-duration expiry (dev env duration override); temp bag holder buy /
  place / move / sort / take; battle loot into Ma Tâm bag and Túi tạm thời with a full bag; bank sort; trade a pet both
  ways; credit shop opens from NPC 2318 (0 points → refusal text), guild shop 83 with contribution; mall cart.
- Data checks: `docker exec mcgame-mongo mongosh mcgame --quiet --eval 'db.character_items.countDocuments({slotType:90})'`
  equals open mails with item attachments + active listings with items (no orphan escrow).

## 10. Risks and open questions

1. **Level gate**: keep 0 (stock Flash, current H5 trade) or use the legacy Open Beta 60 for mail / auction / trade?
2. **Temp bag entry point**: Flash opens `TempBagSlot` from a control we could not locate in the decompile; proposal is a
   bag toolbar button `Túi tiện dụng`. Acceptable?
3. **Credit points have no sources in H5 yet** (Kết Tinh, Dũng Khí, event points): ship the shops now with 0 balances,
   or hide NPC 2318 / the panels until the earning features land?
4. **Guild shop currencies**: H5 guild stores `normalContrib` / `donateContrib` on members; confirm the slot `p_type1 20`
   = normal contribution and `p_type2 21` = donate contribution as in legacy, and that buying spends both (300 + 5000).
5. **Escrow visibility**: escrowed rows use `characterId 0`; any code that queries `character_items` without a
   `characterId` filter (none found today) must exclude `slotType 90`. A startup self-check log of orphan escrow refs is
   proposed.
6. **System mail destruction after 30 days** also destroys unclaimed auction wins (legacy behaviour). Keep, or exempt
   mails with `source` starting `auction:`?
7. **Mail art**: the envelope / MailManagerPanel skins are not converted yet (`client/public/ui` has no mail symbols);
   CSS until a `swfui` render is done.
8. **Mounted pets**: H5 mounts are a separate module; confirm no pet can be "mounted" so `pet-transfer.ts` needs no mount
   check.
