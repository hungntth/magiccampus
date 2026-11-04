// Pure rules for friends / blacklist: name validation, type check, caps and the friend <-> black mutual exclusion.
// No Mongo or sockets here so it is unit-tested directly (relationship-rules.test.ts).

import { RelationLimits, RelationType, type RelationTypeId } from '@mc/shared';

export interface RelationRow {
  id: number;
  targetId: number;
  type: number;
}

export type AddPlan =
  | { ok: true; replaceId: number | null }
  | { ok: false; reason: 'invalid-type' | 'self' | 'duplicate' | 'full' };

export function isRelationType(value: unknown): value is RelationTypeId {
  return value === RelationType.FRIEND || value === RelationType.BLACK;
}

export function limitFor(type: RelationTypeId): number {
  return type === RelationType.FRIEND ? RelationLimits.FRIEND : RelationLimits.BLACK;
}

/** Legacy name check: non-empty, at most 30 bytes, no control characters. Returns the trimmed name or null. */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if (!name || Buffer.byteLength(name, 'utf8') > 30) return null;
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f]/.test(name) ? null : name;
}

/**
 * Decides an `addRelationByName` for `rows` (all rows of the caller). `replaceId` is the row of the opposite type for the
 * same target that must be removed first; that removal never frees room in the list being added to.
 */
export function planAdd(rows: RelationRow[], selfId: number, targetId: number, type: unknown): AddPlan {
  if (!isRelationType(type)) return { ok: false, reason: 'invalid-type' };
  if (targetId === selfId) return { ok: false, reason: 'self' };
  const existing = rows.find((r) => r.targetId === targetId);
  if (existing && existing.type === type) return { ok: false, reason: 'duplicate' };
  if (rows.filter((r) => r.type === type).length >= limitFor(type)) return { ok: false, reason: 'full' };
  return { ok: true, replaceId: existing ? existing.id : null };
}

/** True when `rows` (the caller rows only) contain a row with this id. */
export function canDelete(rows: RelationRow[], id: number): boolean {
  return rows.some((r) => r.id === id);
}
