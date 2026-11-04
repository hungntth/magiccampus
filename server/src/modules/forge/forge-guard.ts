// RPC wrapper of the upgrade calls: a refusal (RpcException thrown by a service with the player-visible reason) becomes the
// legacy failure reply plus an onSystemMidMsgOrNote toast; anything else (a real error) still propagates.

import type { UpgradeRequest } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';

export async function guarded<T>(session: Session, fail: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof RpcException) {
      session.callback('onSystemMidMsgOrNote', e.message);
      return fail;
    }
    throw e;
  }
}

/** Throws the refusal when `note` is set. */
export function refuseIf(note: string | null | false | undefined): void {
  if (note) throw RpcException.forbidden(note);
}

export const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** Positive integer RPC argument or invalidArgs. */
export function idArg(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw RpcException.invalidArgs(name);
  return n;
}

/** changePrefix / changeLevel argument {e, i1: {idx, flag|tempBagFlag}, i2, i3}. */
export function parseUpgradeRequest(v: unknown): UpgradeRequest {
  if (typeof v !== 'object' || v === null) throw RpcException.invalidArgs('request');
  const o = v as Record<string, unknown>;
  const ref = (k: string): { idx: number; flag: boolean } => {
    const r = o[k] as { idx?: unknown; flag?: unknown; tempBagFlag?: unknown } | null | undefined;
    const idx = Number(r?.idx);
    if (typeof r !== 'object' || r === null || !Number.isInteger(idx)) throw RpcException.invalidArgs(k);
    return { idx, flag: r.flag === true || r.tempBagFlag === true };
  };
  return { e: idArg(o.e, 'e'), i1: ref('i1'), i2: ref('i2'), i3: ref('i3') };
}
