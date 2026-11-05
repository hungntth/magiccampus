// Progression foundation (M7 phase A): special currencies (string keys, Go ClientKey), titles (gtl / setTitle / setActTitle,
// onTitleUpdate / onActTitleUpdate / onAddTitle / onAddActTitle) and the dev command gmGrant. Pure helpers only.

import type { LongBuff } from './character.js';

// --- Currencies ---

/** Special per-character currencies. Keys are the Go `ClientKey` names; ids are the Go numeric currency ids (research 13). */
export const CURRENCY_IDS = {
  magiccystalrec: 73, magiccystalpre: 74, magiccystallimit: 75, mysteryCrystal: 215, runeExp: 217, yijieElement: 220,
  realSoulStone: 226, realSoulCrystal: 227, realSoulWater: 228, warSprite: 229, battleSprite: 230, monsterHeart: 231,
  heiyaoshiPoint: 233, heiyaoshiPoint2: 234, energyStone: 235, npPnt: 236, elementPnt: 237, pvePoint: 238,
  stoneSealPoint: 239, starPnt: 240, spirituality: 241,
  // M10 dungeons / towers / training (Go ClientKey ids)
  petguardout: 200, petguardin: 201, couragePoint: 214, txkc2508p: 69,
  // M12 pet arena: Diem Dau Pet (Go currency 19, client key paPnt)
  paPnt: 19,
  // M11 phase E credit shops (Go ClientKey ids): the point balances behind NPCSHOP_CONFIG[1..7].prop (couragePoint / txkc2508p above)
  wisdonCrystal: 213, heroScore2507: 219, anni2017: 49, xmCandy24: 221, xcds2403p: 222,
  // M10 world boss: Chiến tích (Go client key expBattle; basic currency id 2 = honor), no other H5 owner yet
  honor: 2,
  // M12 Mệnh Hồn: three distinct balances. soulChip 242 is the Go currency id (Mảnh Vỡ). soulExp (Go Character.SoulExp, Exp Mệnh Hồn) and
  // soulPnt (Go Character.SoulPoints, Pha Lê) have NO Go type id (client keys only), so 243 / 244 are H5-only ids; /grant accepts the keys.
  soulExp: 243, soulPnt: 244, soulChip: 242,
} as const;

export type CurrencyKey = keyof typeof CURRENCY_IDS;
export type Currencies = Partial<Record<CurrencyKey, number>>;
export const CURRENCY_KEYS = Object.keys(CURRENCY_IDS) as CurrencyKey[];
/** Upper bound of one balance (keeps $inc inside the safe integer range). */
export const MAX_CURRENCY = 2_000_000_000;

/** Resolves a currency key or a Go numeric id ("241") to a key, or null. */
export function resolveCurrency(raw: unknown): CurrencyKey | null {
  const s = String(raw ?? '').trim();
  if ((CURRENCY_KEYS as string[]).includes(s)) return s as CurrencyKey;
  const id = Number(s);
  return CURRENCY_KEYS.find((k) => CURRENCY_IDS[k] === id) ?? null;
}

// --- Titles ---

/** Wire view of a title (H5 extension: the client has no data_tbl_title). `a` is the raw "0xRRGGBB|prefix|suffix" style. */
export interface TitleView {
  id: number;
  n: string; // name
  a: string; // style
  i: string; // description (literal "\\n" line breaks)
  k: number; // kind: 1 forever, 2 activity (timed), 3 VIP
  s: number; // special flag (> 0 shows in the timed/active tab)
  bt: string; // buff description (data_tbl_buff.description of `b`), "" when none
  exp?: number; // epoch ms when a timed grant ends
}

/** gtl reply: `ct` = "|a|b|", `cts` = "a|b|" (special titles). `titles` is the H5 extension carrying the display data. */
export interface TitleList {
  ct: string;
  cts: string;
  titles?: TitleView[];
}

/** setTitle reply: `bd` is the title buff as a long-buff row (key 0). */
export interface SetTitleResult {
  f: boolean;
  t: number; // new title id, -1 when cleared
  bd?: LongBuff;
}

/** setActTitle reply: `t` is the new id, -1 when cleared (the client keeps the old value on a falsy t). */
export interface SetActTitleResult {
  f: boolean;
  t?: number;
}

/** onTitleUpdate / onActTitleUpdate map broadcast (Go shape {cid, tid}); `view` is the H5 display extension. */
export interface TitleBroadcast {
  cid: number;
  tid: number; // 0 / -1 = none
  view?: TitleView;
}

/** onAddTitle push (f 1 granted); `view` is the H5 extension so the toast can name the title. */
export interface TitleAdded {
  f: 1 | 2 | 3 | 4 | 5;
  t: number;
  ct: string;
  view?: TitleView;
}

/** Joins title ids as the Flash client expects: ct = "|a|b|", cts = "a|b|". */
export function joinCt(ids: readonly number[]): string {
  return ids.length === 0 ? '|' : `|${ids.join('|')}|`;
}
export function joinCts(ids: readonly number[]): string {
  return ids.length === 0 ? '' : `${ids.join('|')}|`;
}

/** data_tbl_title.a "0xd7e4bc|≮|≯" -> `{color: '#d7e4bc', prefix, suffix}` (CharactorView.setTitle). */
export function parseTitleStyle(a: string): { color: string; prefix: string; suffix: string } {
  const parts = String(a ?? '').split('|');
  const hex = (parts[0] ?? '').replace(/^0x/i, '').trim();
  const color = /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : '#ffffff';
  return { color, prefix: parts[1] ?? '', suffix: parts[2] ?? '' };
}

/** Text and color drawn over the head for a title view. */
export function titleLabel(view: Pick<TitleView, 'n' | 'a'>): { text: string; color: string } {
  const st = parseTitleStyle(view.a);
  return { text: `${st.prefix}${view.n}${st.suffix}`, color: st.color };
}

// --- gmGrant (H5 dev command: /grant <currency|item|title> <id> <n>) ---

export type GrantKind = 'currency' | 'item' | 'title' | 'equip';

export interface GmGrantResult {
  kind: GrantKind;
  id: string; // resolved currency key, item or title id
  n: number;
  total?: number; // currency balance after the grant
  note: string;
}
