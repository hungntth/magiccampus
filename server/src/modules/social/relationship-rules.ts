// Pure rules for relationships (friend / black / enemy by name, couple / tutor / brother by their features): name validation,
// caps, one-row-per-pair exclusivity with the Go refusal texts, delete guard and the intimacy math. No Mongo or sockets here so
// it is unit-tested directly (relationship-rules.test.ts).

import {
  ADDABLE_RELATION_TYPES, RelationLimits, RelationType, isBondRelation, isManagedRelation, type RelationTypeId,
} from '@mc/shared';

export interface RelationRow {
  id: number;
  targetId: number;
  type: number;
  intimacy?: number;
}

export type AddRefusal = 'invalid-type' | 'self' | 'duplicate' | 'taken' | 'full';

export type AddPlan =
  | { ok: true; replaceId: number | null }
  | { ok: false; reason: AddRefusal; type?: RelationTypeId };

export type DeletePlan =
  | { ok: true; row: RelationRow }
  | { ok: false; reason: 'missing' | 'managed' };

export const TAKEN_TEXT = 'Người này đã có quan hệ khác với bạn, hãy xóa quan hệ cũ trước!';
export const MANAGED_DELETE_TEXT = 'Hãy giải trừ quan hệ ở chức năng tương ứng';

export function isRelationType(value: unknown): value is RelationTypeId {
  return ADDABLE_RELATION_TYPES.some((t) => t === value);
}

/** Cap of a list (friend 120, black 30, enemy 100); Infinity for the feature-owned types. */
export function limitFor(type: number): number {
  switch (type) {
    case RelationType.FRIEND: return RelationLimits.FRIEND;
    case RelationType.BLACK: return RelationLimits.BLACK;
    case RelationType.ENEMY: return RelationLimits.ENEMY;
    default: return Infinity;
  }
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
 * Decides an `addRelationByName` for `rows` (all rows of the caller; at most one per target). `replaceId` is the black row of
 * the same target removed first when adding a friend or enemy (and the friend / enemy row when adding black): the legacy
 * client showed an alert, H5 swaps. Couple / tutor / brother rows and friend <-> enemy refuse with TAKEN_TEXT.
 */
export function planAdd(rows: RelationRow[], selfId: number, targetId: number, type: unknown): AddPlan {
  if (!isRelationType(type)) return { ok: false, reason: 'invalid-type' };
  if (targetId === selfId) return { ok: false, reason: 'self' };
  const existing = rows.find((r) => r.targetId === targetId);
  if (existing && existing.type === type) return { ok: false, reason: 'duplicate', type };
  if (existing && existing.type !== RelationType.BLACK && type !== RelationType.BLACK) return { ok: false, reason: 'taken' };
  if (existing && isManagedRelation(existing.type)) return { ok: false, reason: 'taken' };
  if (rows.filter((r) => r.type === type).length >= limitFor(type)) return { ok: false, reason: 'full', type };
  return { ok: true, replaceId: existing ? existing.id : null };
}

/** Player-visible refusal text of a failed add (Go `relationshipErrorMessage`). */
export function refusalText(reason: AddRefusal, type?: RelationTypeId): string {
  switch (reason) {
    case 'self': return 'Không thể thêm chính mình';
    case 'invalid-type': return 'Loại quan hệ không hợp lệ';
    case 'taken': return TAKEN_TEXT;
    case 'duplicate':
      if (type === RelationType.BLACK) return 'Danh sách đen đã tồn tại!';
      return type === RelationType.ENEMY ? 'Kẻ thù đã tồn tại' : 'Bạn bè đã tồn tại!';
    case 'full': {
      const n = type === undefined ? RelationLimits.FRIEND : limitFor(type);
      return `Danh sách đã đạt giới hạn ${n} người, vui lòng xóa bớt trước khi thêm!`;
    }
  }
}

/** `delRelationship(id)`: only the caller's rows; tutor / couple / brother rows belong to their features. */
export function planDelete(rows: RelationRow[], id: number): DeletePlan {
  const row = rows.find((r) => r.id === id);
  if (!row) return { ok: false, reason: 'missing' };
  return isManagedRelation(row.type) ? { ok: false, reason: 'managed' } : { ok: true, row };
}

/** True when `rows` (the caller rows only) contain a row with this id. */
export function canDelete(rows: RelationRow[], id: number): boolean {
  return rows.some((r) => r.id === id);
}

/** True when `rows` hold a friend / couple / tutor / brother row toward `targetId`. */
export function hasBond(rows: RelationRow[], targetId: number): boolean {
  return rows.some((r) => r.targetId === targetId && isBondRelation(r.type));
}

/** New intimacy after `delta` (floor 0) and the delta really applied. */
export function applyIntimacy(current: number, delta: number): { value: number; applied: number } {
  const value = Math.max(0, Math.floor(current) + Math.trunc(delta));
  return { value, applied: value - Math.floor(current) };
}

/** `onSetClose` third argument: a drop is sent as the negative delta, anything else as the new total (0 = reset). */
export function setCloseNum(applied: number, total: number): number {
  return applied < 0 ? applied : total;
}
