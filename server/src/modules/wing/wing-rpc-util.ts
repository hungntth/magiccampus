// RPC glue of the wing module: a service result (reply + ordered pushes) is sent as pushes first, then the reply; a refusal (RpcException with
// the player-visible reason) becomes the legacy failure reply plus an onSystemMidMsgOrNote toast (forge-guard.guarded).

import type { Session } from '../../gateway/session';
import { guarded } from '../forge/forge-guard';
import type { Out } from '../forge/refine.service';
import { sendPushes } from '../inventory/pushes';

export function out<R>(session: Session, fail: R, fn: () => Promise<Out<R>>): Promise<R> {
  return guarded(session, fail, async () => {
    const r = await fn();
    sendPushes(session, r.pushes);
    return r.reply;
  });
}

/** Item id argument (`idx` of a {idx, flag} reference or a plain id); 0 when it is not an integer. */
export function idOf(v: unknown): number {
  const raw = typeof v === 'object' && v !== null ? (v as { idx?: unknown }).idx : v;
  const n = Number(raw);
  return Number.isInteger(n) ? n : 0;
}

export const intArg = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
