// PK / PvP shared contract (M6 phase C): PVPStartClient gates, the map safe-area parser (data_tbl_map.s_area), the PvP slot
// layout and the `guest` view mapping. Flash names: PVPStartClient, uif("apvp", bool, false), onBattleStart.guest.

/** `PVPStartClient` range. Go allowed 20 px on persisted positions; H5 client positions are coarser (see plan phase C notes). */
export const PK_MAX_DISTANCE = 150;

/** PvP battle slots: the attacker fights at the player centre (10, pet 15), the target at the enemy centre (0, pet 5). */
export const PK_SLOTS = { attacker: 10, attackerPet: 15, target: 0, targetPet: 5 } as const;

/** PvP round length (the client countdown is 25 s for every battle). */
export const PK_ROUND_MS = 25_000;

/** Player-visible notes (client strings where the legacy client has one, Go strings otherwise). */
export const PK_NOTES = {
  SAFE_AREA: 'Mục tiêu trong khu vực an toàn, không thể PK', // CHARACTORVIEW_S[0]
  FORCED_MAP: 'Đây là khu vực bắt buộc PVP, việc tắt mở PK không thể ngăn việc bị khiêu chiến.', // GAMESCENE_S[0]
  TARGET_OFF: 'Mục tiêu chưa bật PK, không thể tấn công.', // Go onMidNote
  FOLLOW_LEADER: 'Đã ở trong nhóm thì cần nghe lời nhóm trưởng!', // NPCVIEW_S[0]
  SAFE_MAP: 'Đây là khu vực an toàn, không thể PK',
  IN_BATTLE: 'Bạn đang trong trận chiến',
  TARGET_IN_BATTLE: 'Mục tiêu đang trong trận chiến',
  OTHER_MAP: 'Mục tiêu không ở cùng bản đồ',
  TOO_FAR: 'Mục tiêu quá xa, hãy lại gần hơn',
  SELF_DEAD: 'Bạn đã gục, không thể PK',
  TARGET_DEAD: 'Mục tiêu đã gục',
  SAME_PARTY: 'Không thể PK đồng đội',
  OFFLINE: 'Mục tiêu không trực tuyến',
  SELECT_TARGET: 'Chọn người chơi muốn PK (Esc để hủy)',
} as const;

/** The six duel-invite RPCs (no Flash caller) are registered as stubs that refuse with this note (documentation list + text). */
export const PK_STUB_RPCS = ['pkInvite', 'pkInviteResp', 'pkReady', 'pkAction', 'pkSurrender', 'pkLeave'] as const;
export const PK_STUB_NOTE = 'Chức năng chưa mở';

/** `uif(key, value, petFlag)`: the interface-setting RPC. Only `apvp` is persisted in H5. */
export type UifKey = 'apvp';

export interface SafeRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Parses TBL_MAP `sArea`: rectangles `x1,y1-x2,y2` joined by `|`; `0`, empty or malformed entries mean none. */
export function parseSafeAreas(raw: string | null | undefined): SafeRect[] {
  if (!raw || raw === '0') return [];
  const out: SafeRect[] = [];
  for (const part of raw.split('|')) {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(part);
    if (!m) continue;
    const [a, b, c, d] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    out.push({ x1: Math.min(a, c), y1: Math.min(b, d), x2: Math.max(a, c), y2: Math.max(b, d) });
  }
  return out;
}

export function inSafeArea(areas: readonly SafeRect[], x: number, y: number): boolean {
  return areas.some((r) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2);
}

/**
 * BattleStage.setGuestGroupPos: a `guest` client swaps slots 0-9 <-> 10-19 so it sees its own side at the bottom right.
 * Slot ids on the wire never change (commands use the real slot); only the drawing position / facing / side colour do.
 */
export function viewSlot(slot: number, guest: boolean): number {
  if (!guest) return slot;
  return slot < 10 ? slot + 10 : slot - 10;
}
