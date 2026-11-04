// Pure title rules (legacy application/title + the client's TitleSelectPanel): owned lists (ct / cts), which titles are
// special, the title buff row (data_tbl_title.b, NOT the always-NULL buff_id) and the wire views. No Nest / Mongo here.

import { BuffType, joinCt, joinCts, type LongBuff, type TitleView } from '@mc/shared';

export type Row = Record<string, unknown>;

/** Long-buff row key reserved for the title buff (TitleSelectPanel upLongBuff(bd) / delBuff(0)). */
export const TITLE_BUFF_ROW = 0;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Special titles (s in 1, 2) form the "timed / active" tab and can be set with setActTitle. */
export function isSpecialTitle(tpl: Row | undefined): boolean {
  const s = num(tpl?.s);
  return s === 1 || s === 2;
}

export interface OwnedTitle {
  titleId: number;
  expiresAt?: Date | null;
}

export const isOwnedNow = (o: OwnedTitle, now: number): boolean => !o.expiresAt || o.expiresAt.getTime() > now;

/**
 * gtl lists. `ct` holds every owned title that has a template (the Go SQL has no `s` filter, so owned special titles are
 * in both lists); `cts` holds the owned special ones. Expired grants are hidden; `owned` is already newest first.
 */
export function titleLists(owned: readonly OwnedTitle[], tplOf: (id: number) => Row | undefined, now: number): { ct: number[]; cts: number[] } {
  const live = owned.filter((o) => isOwnedNow(o, now) && tplOf(o.titleId));
  return {
    ct: live.map((o) => o.titleId),
    cts: live.filter((o) => isSpecialTitle(tplOf(o.titleId))).map((o) => o.titleId),
  };
}

export const titleListStrings = (l: { ct: number[]; cts: number[] }): { ct: string; cts: string } => ({
  ct: joinCt(l.ct), cts: joinCts(l.cts),
});

/** Buff templates the active titles grant: `b` resolved through data_tbl_buff (448 of 472 titles resolve, `b = 0` has none). */
export function titleBuffTemplates(
  activeIds: readonly number[], tplOf: (id: number) => Row | undefined, buffOf: (id: number) => Row | undefined,
): Row[] {
  const out: Row[] = [];
  for (const id of new Set(activeIds)) {
    if (id <= 0) continue;
    const b = num(tplOf(id)?.b);
    const buff = b > 0 ? buffOf(b) : undefined;
    if (buff) out.push(buff);
  }
  return out;
}

export function titleView(tpl: Row, buff: Row | undefined, expiresAt?: Date | null): TitleView {
  return {
    id: num(tpl.id), n: String(tpl.n ?? ''), a: String(tpl.a ?? ''), i: String(tpl.i ?? ''), k: num(tpl.k), s: num(tpl.s),
    bt: String(buff?.description ?? ''),
    ...(expiresAt ? { exp: expiresAt.getTime() } : {}),
  };
}

/** Title buff as a long-buff row with the reserved key 0 (permanent, not removable by the player). */
export function titleLongBuff(tpl: Row, buff: Row): LongBuff {
  return {
    id: TITLE_BUFF_ROW,
    bid: num(buff.id),
    type: BuffType.PERMANENT,
    name: buff.name ? String(buff.name) : String(tpl.n ?? ''),
    iconCode: buff.icon_code ? String(buff.icon_code) : '0',
    info: String(buff.description ?? ''),
    removable: false,
  };
}
