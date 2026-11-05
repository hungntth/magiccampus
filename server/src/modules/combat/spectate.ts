// startWatch gates (M9 phase H, Go combat/watch.go:45): the refusal text for a watcher and its target, checked in Go order. Pure.

import { WATCH_ERR } from '@mc/shared';

export interface WatchFacts {
  self: boolean; // the watcher picked itself
  watcherInBattle: boolean;
  targetOnline: boolean;
  sameMap: boolean;
  targetInBattle: boolean;
  battleEnded: boolean;
  /** The battle kept its start payload (a battle without one cannot be shown). */
  hasStart: boolean;
}

export function watchRefusal(f: WatchFacts): string | null {
  if (f.self) return WATCH_ERR.INVALID;
  if (f.watcherInBattle) return WATCH_ERR.SELF_IN_BATTLE;
  if (!f.targetOnline) return WATCH_ERR.OFFLINE;
  if (!f.sameMap) return WATCH_ERR.OTHER_MAP;
  if (!f.targetInBattle) return WATCH_ERR.NOT_IN_BATTLE;
  if (f.battleEnded) return WATCH_ERR.ENDED;
  if (!f.hasStart) return WATCH_ERR.INVALID;
  return null;
}
