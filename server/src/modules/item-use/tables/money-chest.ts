// Money chests and kim phieu scrolls (template-id handlers, checked before the type handlers). Constant tables copied from Go
// application/item/effect_money_chest.go (moneyChestAmounts) and effect_kimphieu_scroll.go (kimPhieuScrollAmounts).
// An unbound chest credits bac (`money`), a bound one ngan phieu (`moneyBind`). Bach Ngan Le 1063 shares its id with an
// equipment template that equips first, so only 1132 / 2520 are item chests here (the Go map also lists 1063).

/** templateId -> silver amount (Go moneyChestAmounts without 1063). */
export const MONEY_CHESTS: Readonly<Record<number, number>> = {
  2271: 100_000,
  2272: 1_000_000,
  2273: 10_000_000,
  1132: 100_000,
  2520: 1_000_000,
};

/** templateId -> kim phieu (goldBind) amount (Go kimPhieuScrollAmounts; 1064 stays on its item_award row). */
export const KIM_PHIEU_SCROLLS: Readonly<Record<number, number>> = {
  642: 100,
  653: 500,
  849: 500,
  2693: 888,
  2790: 5000,
  2791: 80000,
  3436: 300,
  3840: 88,
  3841: 188,
  3842: 288,
  3843: 588,
  3844: 1888,
  5341: 600,
};
