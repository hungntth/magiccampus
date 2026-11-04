// Pure PK gate (PVPStartClient): who may attack whom. Legacy Go checked the target's apvp, same map and 20 px; H5 adds the
// map rules the client text promises (forced PvP maps ignore apvp, safe maps / safe areas refuse) and a party / battle / HP guard.
// No sockets, no Mongo: the PK service supplies the facts.

import { inSafeArea, PK_MAX_DISTANCE, PK_NOTES, type SafeRect } from '@mc/shared';

export interface PkSide {
  cid: number;
  mapId: number; // the session's current map
  x: number;
  y: number;
  hp: number;
  inBattle: boolean;
  partyId: number | null;
  partyLeader: boolean; // true when not in a party, or the party leader
}

export interface PkMapFacts {
  pk: number; // data_tbl_map.pk: > 0 forced PvP
  safeFlag: number; // data_tbl_map.safe_flag: > 0 no PK at all
  safeAreas: readonly SafeRect[];
}

export type PkVerdict = { ok: true } | { ok: false; note: string };

const no = (note: string): PkVerdict => ({ ok: false, note });

/** First failing gate wins; the order is the order of the notes a player would fix first. */
export function pkEligibility(attacker: PkSide, target: PkSide, targetApvp: boolean, map: PkMapFacts): PkVerdict {
  if (attacker.cid === target.cid) return no(PK_NOTES.OFFLINE);
  if (attacker.inBattle) return no(PK_NOTES.IN_BATTLE);
  if (target.inBattle) return no(PK_NOTES.TARGET_IN_BATTLE);
  if (attacker.mapId !== target.mapId) return no(PK_NOTES.OTHER_MAP);
  if (attacker.hp <= 0) return no(PK_NOTES.SELF_DEAD);
  if (target.hp <= 0) return no(PK_NOTES.TARGET_DEAD);
  if (!attacker.partyLeader) return no(PK_NOTES.FOLLOW_LEADER);
  if (attacker.partyId !== null && attacker.partyId === target.partyId) return no(PK_NOTES.SAME_PARTY);
  if (Math.hypot(attacker.x - target.x, attacker.y - target.y) > PK_MAX_DISTANCE) return no(PK_NOTES.TOO_FAR);
  if (map.safeFlag > 0) return no(PK_NOTES.SAFE_MAP);
  if (inSafeArea(map.safeAreas, target.x, target.y)) return no(PK_NOTES.SAFE_AREA);
  if (map.pk <= 0 && !targetApvp) return no(PK_NOTES.TARGET_OFF);
  return { ok: true };
}
