// Pure chat-ban decisions (M14 phase G, Go handlers/chat/ban_chat.go): whether a ban may be bought, whether a ban may be lifted and the
// note that refuses a banned player's message. No Nest, no Mongo; the service gathers the facts.

import { CHAT_BAN, CHAT_BAN_TEXT, formatBanLeft } from '@mc/shared';

export type Verdict = { ok: true } | { ok: false; note: string };

export interface BanFacts {
  actorId: number;
  targetId: number;
  targetName: string | null;
  /** Null when no such character exists. */
  targetExists: boolean;
  targetOnline: boolean;
  /** Milliseconds of ban the target still has (0 = none). */
  targetBanLeftMs: number;
  actorGold: number;
}

/** First failure wins: not found, self, offline, already banned, not enough gold. */
export function banVerdict(f: BanFacts): Verdict {
  if (!f.targetExists) return { ok: false, note: CHAT_BAN_TEXT.NOT_FOUND };
  if (f.targetId === f.actorId) return { ok: false, note: CHAT_BAN_TEXT.SELF };
  const name = f.targetName ?? '?';
  if (!f.targetOnline) return { ok: false, note: CHAT_BAN_TEXT.OFFLINE(name) };
  if (f.targetBanLeftMs > 0) return { ok: false, note: CHAT_BAN_TEXT.ALREADY(name, formatBanLeft(f.targetBanLeftMs)) };
  if (f.actorGold < CHAT_BAN.priceGold) return { ok: false, note: CHAT_BAN_TEXT.NEED_GOLD };
  return { ok: true };
}

/** `/huycam`: needs an active ban and 100 gold. */
export function liftVerdict(banLeftMs: number, gold: number): Verdict {
  if (banLeftMs <= 0) return { ok: false, note: CHAT_BAN_TEXT.NOT_BANNED };
  if (gold < CHAT_BAN.priceGold) return { ok: false, note: CHAT_BAN_TEXT.LIFT_NEED_GOLD(formatBanLeft(banLeftMs)) };
  return { ok: true };
}

/** The refusal shown to a banned player who tries to speak (before any Loa is spent); null when free to speak. */
export function mutedNote(banLeftMs: number): string | null {
  return banLeftMs > 0 ? CHAT_BAN_TEXT.BANNED(formatBanLeft(banLeftMs)) : null;
}
