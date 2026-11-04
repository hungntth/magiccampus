// Ordered server pushes built by inventory services and sent by the RPC layer (keeps push order next to the logic).

import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';

export interface Push {
  m: string;
  a: unknown[];
}

export const push = (m: string, ...a: unknown[]): Push => ({ m, a });

export function sendPushes(session: Session, pushes: readonly Push[]): void {
  for (const p of pushes) session.callback(p.m, ...p.a);
}

/** Runs `fn`; a rejection by RpcException is shown to the player through onSystemMidMsgOrNote, then rethrown. */
export async function midNoteOnFail<T>(session: Session, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof RpcException) session.callback('onSystemMidMsgOrNote', e.message);
    throw e;
  }
}
