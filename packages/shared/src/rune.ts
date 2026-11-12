// Phù Văn (rune) contract (M13 phase E1, legacy RuneBag / RuneSlot / DecoratePanel). RPCs (Flash names): getRuneBagData(cid) -> RuneBag,
// runeMove(from, to, bagType) and arrangeRuneBag(cid, bagType) -> null + push onRuneBagUpdate, runeSet(bagPos, holePos, bagType, decoPosition) and
// runeRemove(holePos, bagPos, bagType, decoPosition) -> DecoInfo, runeUpLvl() -> RuneBag, runeResolve(runeObj, bagType) -> null + push,
// exchangeRune() -> null + pushes updateRuneChipBag / onRuneBagUpdate; H5 catalog reads getRuneCatalog() -> RuneCatalog and getRuneChipBag().
// Pushes: onRuneBagUpdate (RuneBag), updateRuneChipBag (RuneChipBag), onUPP (runeExp balance / character stats), onRefreshPetProp (pet page).

/** bagType of the rune RPCs: runes of kind 1 live in the character bag, kind 2 in the pet bag. */
export const RUNE_BAG = { CHA: 0, PET: 1 } as const;
export type RuneBagType = (typeof RUNE_BAG)[keyof typeof RUNE_BAG];
export const RUNE_BAG_SLOTS = 100;
export const RUNE_CHIP_BAG_SLOTS = 100;
export const RUNE_CHIP_MAX = 99_999;
/** Staged slot of the up-level hole in runeMove. */
export const RUNE_UP_HOLE = -1;
/** deco_rune.kind values. */
export const RUNE_KIND = { CHA: 1, PET: 2 } as const;
export const RUNE_HOLE_MIN = 1;
export const RUNE_HOLE_MAX = 16;
export const RUNE_PETS_PER_PAGE = 8;

export interface RuneSlot {
  /** Stack size and the deco_rune id. */
  n: number;
  r: number;
}

export interface RuneBag {
  chaBag: Record<string, RuneSlot>;
  petBag: Record<string, RuneSlot>;
  /** Rune staged in the up-level hole (0 = empty). */
  upLvlHole: number;
}

export interface RuneChipSlot {
  chipId: string;
  num: number;
}

/** Chip bag keyed from "1". */
export type RuneChipBag = Record<string, RuneChipSlot>;

/** Compact deco_rune row of the catalog (`nm` indexes RuneCatalog.names). */
export interface RuneRow {
  i: number;
  k: number;
  /** Rune family (`type`): the prop type, 14 / 61 / 59 / 60 / 62 / 63 are the rare families. */
  ty: number;
  lv: number;
  /** Colour 0..4 (`qulity`). */
  q: number;
  nx: number;
  e: number;
  ue: number;
  pt: number;
  pn: number;
  ic: string;
  nm: number;
}

export interface RuneChipRow {
  id: number;
  kind: number;
  name: string;
  /** Chips per rune and the rune id they make. */
  num: number;
  rid: number;
  iconCode: string;
}

export interface RuneCatalog {
  names: string[];
  runes: RuneRow[];
  chips: RuneChipRow[];
}

/** exchangeRune summary (H5 extra: the legacy replied null). */
export interface RuneExchangeReply {
  converted: number;
  refusedRare: number;
}

/** deco_rune.type of the rare families: they only come from rare chests, never from chips (owner rule 2026-11-08, Go rare_runes.go). */
export const RARE_RUNE_TYPES: ReadonlySet<number> = new Set([14, 61, 59, 60, 62, 63]);
export const isRareRuneType = (type: number): boolean => RARE_RUNE_TYPES.has(type);

/** Panel divisor of a rune prop type (TipDecoRune.as), 0 = the type has no label and gives nothing. */
export function runePanelScale(propType: number): number {
  switch (propType) {
    case 1: case 4: case 5: case 6: case 7: case 11:
      return 1;
    case 8: case 9: case 13: case 14: case 31: case 32: case 58: case 61:
      return 10_000;
    case 34: case 59: case 60: case 62: case 63: case 71:
      return 100;
    default:
      return 0;
  }
}

/** Panel value of a rune line (what the tooltip prints and the stat receives), 0 for an unlabelled type. */
export function runeStatValue(propType: number, raw: number): number {
  const scale = runePanelScale(propType);
  return scale === 0 ? 0 : raw / scale;
}

/** Text of a panel-unit value (what the tooltip prints): percent types get a "%". */
export function runePanelText(propType: number, value: number): string {
  const v = Math.round(value * 10_000) / 10_000;
  return [34, 59, 60, 62, 63, 71].includes(propType) ? `${v}%` : String(v);
}

/** Tooltip text of a raw column value. */
export const runeValueText = (propType: number, raw: number): string => runePanelText(propType, runeStatValue(propType, raw));

/** The rune bag kind of a rune row (kind 2 = pet bag). */
export const runeBagOfKind = (kind: number): RuneBagType => (kind === RUNE_KIND.PET ? RUNE_BAG.PET : RUNE_BAG.CHA);

/** Slot parity: character runes on odd holePos 1,3..15, pet runes on even 2..16. */
export const runeHoleBag = (holePos: number): RuneBagType => (holePos % 2 === 1 ? RUNE_BAG.CHA : RUNE_BAG.PET);

export const emptyRuneBag = (): RuneBag => ({ chaBag: {}, petBag: {}, upLvlHole: 0 });
