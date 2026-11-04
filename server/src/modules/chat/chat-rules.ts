// Pure chat rules (no Nest, no Mongo): channel routing, world-chat cost decision, shared rate limiter, message
// normalisation and whisper target lookup. All time-dependent logic takes `now` so tests inject the clock.

import { ChatChannel, ChatLimits } from '@mc/shared';

export type ChatRoute = 'local' | 'world' | 'team' | 'guild' | 'unsupported';

export function routeChannel(channelId: number): ChatRoute {
  switch (channelId) {
    case ChatChannel.LOCAL: return 'local';
    case ChatChannel.WORLD: return 'world';
    case ChatChannel.TEAM: return 'team';
    case ChatChannel.GUILD: return 'guild';
    default: return 'unsupported';
  }
}

export type WorldCost = 'free' | 'loa' | 'refuse';

export interface WorldChatState {
  level: number;
  now: number;
  /** Epoch ms of this character's last free world message (undefined = never). */
  lastFreeAt: number | undefined;
  loaCount: number;
}

/** Free (level >= 10 and one per 5 min) first, then one Loa, otherwise refuse. */
export function worldChatCost(s: WorldChatState): WorldCost {
  const windowOver = s.lastFreeAt === undefined || s.now - s.lastFreeAt >= ChatLimits.WORLD_FREE_WINDOW_MS;
  if (s.level >= ChatLimits.WORLD_FREE_LEVEL && windowOver) return 'free';
  return s.loaCount > 0 ? 'loa' : 'refuse';
}

/** One shared limiter for say / wisper / p2pWisper per character. */
export class ChatRateLimiter {
  private readonly last = new Map<number, number>();

  constructor(private readonly intervalMs: number = ChatLimits.INTERVAL_MS) {}

  /** True (and records the call) when the character may send now. */
  tryAcquire(characterId: number, now: number): boolean {
    const prev = this.last.get(characterId);
    if (prev !== undefined && now - prev < this.intervalMs) return false;
    this.last.set(characterId, now);
    return true;
  }

  forget(characterId: number): void {
    this.last.delete(characterId);
  }
}

// Control (Cc) and format (Cf: zero-width, bidi overrides) characters: newlines, invisible text and right-to-left spoofing
// in chat. Rendering is text-only on the client, so this is about display abuse, not markup.
const HIDDEN_CHARS = /[\p{Cc}\p{Cf}]/gu;

/** Strips hidden characters, collapses whitespace, trims and caps (in code points); null when not a string or empty. */
export function normalizeMessage(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.slice(0, max * 4).replace(HIDDEN_CHARS, ' ').replace(/\s+/g, ' ').trim();
  const text = Array.from(clean).slice(0, max).join('').trim();
  return text ? text : null;
}

export interface NamedSession {
  characterName: string | null;
}

/** Exact-name lookup among online sessions (Go used a longest-prefix match; exact is safer). */
export function findOnlineByName<T extends NamedSession>(sessions: Iterable<T>, name: string): T | undefined {
  const wanted = name.trim();
  if (!wanted) return undefined;
  for (const s of sessions) if (s.characterName === wanted) return s;
  return undefined;
}
