// Maps a persisted buff row + its data_tbl_buff template to the LongBuff wire shape (legacy BuildLongBuffPayload).

import type { LongBuff } from '@mc/shared';
import type { CharacterBuff } from './buff.schema';

type Tpl = Record<string, unknown>;

export function toLongBuff(doc: CharacterBuff, tpl: Tpl | undefined, now = Date.now()): LongBuff {
  const out: LongBuff = {
    id: doc._id,
    bid: doc.buffId,
    type: doc.buffType,
    name: tpl?.name ? String(tpl.name) : `#${doc.buffId}`,
    iconCode: tpl?.icon_code ? String(tpl.icon_code) : '0',
    info: String(tpl?.description ?? ''),
    removable: Number(tpl?.buff ?? 0) === 1,
  };
  if (doc.battlesLeft > 0) out.battleLeft = doc.battlesLeft;
  if (doc.expiresAt) {
    const end = doc.expiresAt.getTime();
    out.timeAll = doc.durationTotal;
    out.addTime = Math.floor(doc.createdAt.getTime() / 1000);
    out.timeLeft = Math.max(0, Math.ceil((end - now) / 1000));
    out.ineffectiveTime = end;
  }
  return out;
}

/** A row is active while it has no expiry or the expiry is still ahead (lazy expiry, like the legacy ListActive). */
export function isActive(doc: Pick<CharacterBuff, 'expiresAt'>, now = Date.now()): boolean {
  return !doc.expiresAt || doc.expiresAt.getTime() > now;
}
