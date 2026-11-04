// Teleport scrolls (useTransport / useTransportGroup / useItemGold) and the rename card (changeNameByCard): item ids, cost
// planning, destination rules and new-name validation. Pure, shared by server and client. Legacy: Go item/transport.go,
// item/special.go; Flash ItemConfig.as, Player.as, Core.haveSpecialStr.

/** Regular scrolls in Go's consumption order (Flash ITEM_TRANSPORT, month, half-month, week). */
export const TRANSPORT_REGULAR = [1036, 1363, 2946, 1515] as const;
/** Senior scrolls (Flash ITEM_TRANSPORT_SENIOR*): also the only ones a party leader's group transport consumes. */
export const TRANSPORT_SENIOR = [2947, 2948, 2949, 2950, 3722, 4941, 4942] as const;
/** What a personal transport consumes, in order: regular first, then senior. */
export const TRANSPORT_PRIORITY: readonly number[] = [...TRANSPORT_REGULAR, ...TRANSPORT_SENIOR];
/** Template ids the client sends in useItemGold({tid}) when buying and using on the spot. */
export const TRANSPORT_BUY_TID = 1036;
export const TRANSPORT_SENIOR_BUY_TID = 2947;
export const TRANSPORT_GOLD_COST = 3;
export const TRANSPORT_SENIOR_GOLD_COST = 5;
export const RENAME_CARD_TID = 2126;
export const NAME_MIN = 2;
export const NAME_MAX = 12;

export const isTransportScroll = (tid: number): boolean => TRANSPORT_PRIORITY.includes(tid);
export const isSeniorScroll = (tid: number): boolean => (TRANSPORT_SENIOR as readonly number[]).includes(tid);

/** H5 helper reply of `getTransportMaps`: the maps a scroll can reach (data_tbl_map.t > 0), by id. */
export interface TransportMapEntry {
  id: number;
  name: string;
  level: number;
}

/** Reply of useTransport / useTransportGroup / useItemGold (Go: `{success:true}`); failures push a note and reject. */
export interface TransportReply {
  success: true;
  /** Scroll template consumed, or 0 when the gold fallback was paid. */
  tid: number;
  /** Gold paid (0 when a scroll was consumed). */
  gold: number;
}

/** `useItemGold` argument object (Flash Player.as:501-508, ConsumPanel). `mid` is the destination map (0 = buy only). */
export interface UseItemGoldArgs {
  tid: number;
  mid?: number;
}

export type TransportPlan =
  | { kind: 'scroll'; tid: number }
  | { kind: 'gold'; cost: number }
  | { kind: 'none'; cost: number };

/**
 * Payment for one transport: the first owned scroll of the priority list, else the gold fallback (3 regular, 5 senior).
 * `senior`: the senior list and price (a party leader's group transport, or a senior scroll bought with gold); `owned` maps template id -> units.
 */
export function planTransport(owned: ReadonlyMap<number, number>, senior: boolean, gold: number): TransportPlan {
  const list = senior ? TRANSPORT_SENIOR : TRANSPORT_PRIORITY;
  for (const tid of list) if ((owned.get(tid) ?? 0) > 0) return { kind: 'scroll', tid };
  const cost = senior ? TRANSPORT_SENIOR_GOLD_COST : TRANSPORT_GOLD_COST;
  return gold >= cost ? { kind: 'gold', cost } : { kind: 'none', cost };
}

/** Destination rule (Go isTeleportableMap: the map exists and `t > 0`); also refuses the map the player stands on. */
export function transportDestinationError(map: { t?: unknown } | undefined, mapId: number, currentMapId: number): string | null {
  if (!Number.isInteger(mapId) || mapId <= 0 || !map) return 'Vui lòng chọn bản đồ chính xác cần đến.';
  if (!(Number(map.t) > 0)) return 'Không thể dịch chuyển đến bản đồ này.';
  if (mapId === currentMapId) return 'Bạn đang ở bản đồ này rồi.';
  return null;
}

// Flash Core.haveSpecialStr: characters a name may not contain.
const FORBIDDEN_NAME_CHARS = /[&'"\-\\/|%\n\r\t\b\f\v<>@*]/;

export type NameCheck = { ok: true; name: string } | { ok: false; msg: string };

/** New character name for the rename card: trim, 2..12 characters (Go), none of the Flash special characters. */
export function validateNewName(raw: unknown): NameCheck {
  if (typeof raw !== 'string') return { ok: false, msg: 'Tên không hợp lệ.' };
  const name = raw.trim();
  const len = [...name].length;
  if (len < NAME_MIN || len > NAME_MAX) return { ok: false, msg: 'Tên phải từ 2 đến 12 ký tự.' };
  if (FORBIDDEN_NAME_CHARS.test(name)) return { ok: false, msg: 'Tên mới chứa ký tự không hợp lệ, vui lòng kiểm tra lại!' };
  return { ok: true, name };
}

/** Reply of changeNameByCard (Go: `{success:true}`). The renamed character also gets onUPP{name}; the room gets onScenePlayerRenamed(id, name). */
export interface ChangeNameByCardReply {
  success: true;
  name: string;
}

/** Reply of the H5 helper `getTransportMaps`: scroll destinations, whether the caller leads a party and the map it stands on. */
export interface TransportMapsReply {
  maps: TransportMapEntry[];
  leader: boolean;
  current: number;
}
