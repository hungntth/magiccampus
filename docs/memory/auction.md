# Auction (Đấu giá) (M11 phase B)

Plan: `docs/plans/2026-11-04_14_MAIL_AUCTION_BAGS.md` (phase B). Legacy: `E:\mcgame\docs\memory\auction-system.md`, Go `internal/application/auction`, `internal/domain/auction`, `handlers/auction`, migration `20261024150000_auction_house.sql`, Flash `AuctionPanel` / `PMAuctionPanel`. Implemented 2026-11-05.

## Contract (shared `auction.ts`)
- RPCs (none quiet): `auctionSearch({kind,type,levelLow,levelHigh,name,npcId,version})` -> `{arg, version: now ms, list: {"<id>": AuctionRow}}`; `addAuction(obj)` and `addAuctionMoreByPM(obj)` (proxy, no reply, notes + pushes); `auctionBid(id, amount)` -> `{flag, info, auctionData}`; `auctionBidMax(id)` -> `{flag, info, auctionId}`; `cancelAuction(id)` (proxy); `closeAuction` no-op; GM dev tool `devAuctionEnd(id[, seconds=0])` (`requireGm`, sets `endsAt = now + seconds`, the sweeper then settles it within a minute).
- Pushes: `onInitViewAuctionP({flag, npcId, myAuctionList})` (NPC type 5 click or `npcFuncClick`), `onAddAuction(row)` / `onDelAuction(id)` to the seller, `onDelCharactorSlot` / `onDelPet` + `onUPP{money, moneyBind}` after a listing, `onAddMoney(cid, 'money'|'gold', -price, total)` then `onUPP{money, gold}` after a bid / buy-out, notes through `onSystemMidMsgOrNote` (Go strings in `AUCTION_TEXT`). Deliveries and refunds arrive as system mails (`onAddMail`, sender `Đấu Giá`, title `Đấu giá: <name>`).
- `AuctionRow` = Go keys (`id, ownerId, type 28|18|39, itemId = instance / pet id, stackNum, name, color, auctionType, nowMoney/nowGold, maxMoney/maxGold, itemKind, itemType, reqLevel, duration, wn, pn, lastTime`) + H5 `iconCode`, `item: BagItem` / `pet: PetWrapper` (tooltips, read from the escrowed rows in bulk).
- Helpers: `auctionFee(start, buyout, type, hours)` (Go `Fee`, same float order), `auctionLastTime`, `petAuctionType`, `AUCTION_KINDS` (search tree), `AUCTION` constants, `AUCTION_TEXT`.

## Rules (verified in Go)
- Fee in silver, never refunded: `int(avg(start,buyout) * 0.1% (Bạc) | 0.2% (Vàng) + hours*5 + 0.5)`; preferred silver first (moneyBind unless `selectedMoneyType` is money), then the other. No sale commission. 20 active per seller, price 1..999,999,999, buy-out 0 or >= start, 1..48 h, exactly one currency pair.
- Bid order: gone/ended -> own listing -> already top -> `amount <= current` (the FIRST bid must beat the start price) -> `amount >= buyout` (use Mua ngay). Bid money is spent at once from money / gold (bound currencies never used). Outbid / bought-out previous bidder is refunded by system mail `Có người ra giá cao hơn cho X. Hoàn lại N Bạc.` / `X đã được mua ngay. Hoàn lại N Bạc.`.
- Buy-out: goods mail to the buyer (`Bạn đã mua ngay …`), price mail to the seller (`X đã được <buyer> mua ngay với giá …`), seller online gets `onDelAuction`. Expiry with a bid: goods to the bidder, price to the seller; without: goods back (`… hết thời gian rao bán mà không có người mua. Vật phẩm được trả lại.`). Cancel only without a bid and not gated by level / trade (`Bạn đã hủy rao bán …`).
- Gates on list / bid / buy-out: `TradeManager.isLocked` -> `Đang giao dịch, không thể rao bán hoặc đấu giá!`, `PLAYER_EXCHANGE_MIN_LEVEL` (0). PM batch: `PmStateService.levelOf >= 3`, max 10 entries (Flash keys "0".."4" items, "10".."14" pets).

## Server (`server/src/modules/auction/`)
`auction.schema.ts` (`auction_listings`, counter `auctions`, `endsAt` epoch ms, `status`, `bidSeq`, `buyout`, `mailed`, `refundDue`), `auction-rules.ts` (+test: parsing, price validation, `planBid/planBuyout/planCancel/planSettle` returning guard + patch, `mailPlans`, `searchFilter`, `listingRow`), `auction-gate.service.ts`, `auction-listing.service.ts` (saga under the seller's char lock), `auction-bid.service.ts` (saga under `withKeyLock('auction:<id>')`), `auction-settle.service.ts` (deliver mails, cancel, `settleOne`, `settleDue`, `retryPending`), `auction-sweep.service.ts` (boot + every 60 s, registers escrow owner `'auction'`), `auction-view.service.ts` (search, `mine`, rows + tooltips), `auction.rpc.ts`, `auction.module.ts`. NPC: `npc.rpc.ts` type 5 -> `AuctionViewService.mine`. `GameDataService.creatureClassId(id)` (pet search type).

## Sagas (why goods and money cannot be lost or duplicated)
- **list**: validate -> gate -> cap -> `EscrowService.escrowItem/escrowPet(ref 'auction:<id>')` (one conditional move) -> fee `spendMoney` -> insert; failure undoes in reverse (`UndoStack` from mail-saga).
- **bid / buy-out**: spend -> ONE conditional `findOneAndUpdate` (guard = the state the checks saw: status, bidderId, bidSeq, currentPrice, endsAt > now) -> mails. A guard miss refunds the bidder. The previous bidder's money sits in `refundDue` on the listing until its mail exists.
- **settle / cancel**: the status flips first (conditional update, `mailed: false`), then `deliver()` sends the mails derived from the listing state with idempotent sources `auction:<id>:goods`, `:price`, `:refund:<bidSeq>`; goods retag `auction:<id>` -> `mail:<mailId>` inside `sendSystemMail`. A crash or a failed mail leaves `mailed: false` / `refundDue`, and the sweeper (`retryPending`) finishes it, so nothing is mailed twice and the goods stay in escrow until their mail exists.

## Client
`game/AuctionController.ts` (state, calls, own-listing list), `ui/auction/auctionPanel.ts` (frame, tabs Đấu giá / Rao bán, wallet), `auctionSearch.ts` (kind / type tree, Tên, Cấp, Dò tìm, 10 rows, bid bar with the Flash over-buy-out prompt, Mua ngay with a confirm), `auctionSell.ts` (picker of unbound bag-tab items and resting unbound pets, Bạc / Vàng, 1..48 h, per-goods prices, live fee via `auctionFee`, own listings with Hủy + confirm, PM batch checkbox), `auctionUtil.ts`, `auction.css`. Art is CSS. `ui/itemTypeNames.ts` names the type nodes.

## Decisions / deviations
- Server filters kind, type, level (pets skip the level) and name (plan decision 9); the 500-row cap is kept, sorted soonest-ending first (Go order).
- Pet "garrison / arena" busy check of Go is skipped (no such state in H5). Pet escrow uses the shared `pet-transfer` rule (bound / active / equipped texts of the auction wording).
- The listing id is allocated before the goods are parked, so a refused listing burns one counter value (ids are not contiguous).
- `devAuctionEnd` only moves `endsAt`; settlement stays the real sweeper path (up to 60 s later).
- PM batch uses one currency / duration for all entries but a price pair per goods.
- No `onAuctionBid` style push: the replies carry `{flag, info}` like Go.

## Deferred
Mail / auction art from the SWF symbols, price sort by column, auction line / channel, Discord audit. Quiet the RPCs only after the user confirms the feature works.
