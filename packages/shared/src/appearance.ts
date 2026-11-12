// Avatar appearance + flying contract (M13 phase A). Equip positions, the AvatarView carried by scene / login payloads, and the pushes
// onEquipOn / onEquipOff (weapon dressFlag false, costume dressFlag true), onSetRes, onFlyerOn, onBeginFlying, onStopFlying, onFairyOn /
// onFairyOff (guarding Tiểu Tinh Linh, M13 G). RPCs (no
// args unless stated): beginFlying, stopFlying, fixFlyState, setDressHide(hide) -> boolean. Art codes are string resource codes.

import type { DecoLook } from './deco.js';

/** Template position (= equipped sid) of the weapon, the flyer (Phi hành) and the fashion costume (Thời trang). */
export const WEAPON_POSITION = 3;
export const FLYER_POSITION = 14;
export const DRESS_POSITION = 21;

/** Client flying states (Flash GamePredef.FLYING_STATE_*); 5 (double fly) is out of scope. */
export const FLYING_STATE = { ON_GROUND: 0, TAKING_OFF: 1, IN_THE_AIR: 2, PRE_LANDING: 3, LANDING: 4 } as const;
export type FlyingState = (typeof FLYING_STATE)[keyof typeof FLYING_STATE];

/** Body lift in px while airborne, the minimum level, the server toggle cooldown and the client throttles. */
export const FLIGHT_HEIGHT = 100;
export const FLIGHT_MIN_LEVEL = 50;
export const FLIGHT_COOLDOWN_MS = 5000;
export const FLIGHT_BUTTON_THROTTLE_MS = 3000;
export const FLIGHT_FIX_INTERVAL_MS = 30_000;
/** Tween speed of the take-off / landing lift: 2 px per Flash frame at 24 fps. */
export const FLIGHT_LIFT_PX_PER_SEC = 48;

/** Server / client texts of the flying flow (Go movement.go, Flash NPCVIEW_S[0], MINIMAPCANVAS_U). */
export const FLIGHT_TEXT = {
  NEED_FLYER: 'Cần trang bị phi hành và đạt cấp 50 mới có thể bay',
  MEMBER_NO_FLYER: (name: string): string => `Thành viên ${name} chưa trang bị phi hành, cả nhóm không thể bay`,
  NO_FLY_MAP: 'Bản đồ này cấm bay.',
  COOLDOWN: 'Vui lòng đợi 5 giây sau khi cất cánh / hạ cánh rồi thử lại.',
  GROUND_FIGHT: 'Đang bay không thể chiến đấu với mục tiêu dưới mặt đất, hãy hạ cánh trước.',
  FOLLOW_LEADER: 'Đã ở trong nhóm thì cần nghe lời nhóm trưởng!',
  BUTTON_FLY: 'Bay',
  BUTTON_LAND: 'Xuống',
  BUTTON_TIP: 'Bay/Xuống (Phím tắt F)',
} as const;

/** Character panel checkbox of the dress hide flag (CHARACTORPANEL_S[56] tooltip, USERSYSTEMSETPANEL_S[25] label). */
export const DRESS_HIDE_TEXT = { LABEL: 'Ẩn thời trang', TIP: 'Chọn ẩn bộ thời trang' } as const;

/** What the map body sprite currently is: the class body, a costume (fashion pos 21 / fake dress) or a transform (VIP right 13, Mê Huyễn). */
export type AvatarBody = 'class' | 'dress' | 'transform';

/**
 * Server-derived look of one character (scene rows `av`, login `av`). `res` is the body art; the weapon and the mount are layers that the
 * client draws only on the class body (and the mount only on the ground); the flyer layers only while airborne.
 */
export interface AvatarView {
  res: string;
  /** Class body art of the character: the fallback while the sheet of a costume / transform is missing. */
  base: string;
  body: AvatarBody;
  /** Weapon art held, '0' = none (raw: hidden by the client while the body is not the class body). */
  wp: string;
  /** Costume art shown as the body (present only when body === 'dress'). */
  dress?: string;
  /** Flyer art under the body and the optional front overlay (wav_code); absent = no flyer worn. */
  flyer?: string;
  flyerFront?: string;
  /** In the air right now (persisted flag, only true on a flyable map). */
  flying: boolean;
  /** Riding mount skin art (state; hidden while flying or on a costume / transform body). */
  mount?: string;
  /** Wing art behind / in front of the body (absent = none worn or hidden by setWingHide). */
  wing?: string;
  /** Hồn Khí looks of the equipped, visible positions (M13 E1); absent = none. */
  deco?: DecoLook[];
  /** World art of the guarding Tiểu Tinh Linh (active skin or its template `rc`, M13 G); absent = none guarding. */
  fairy?: string;
}

/** onEquipOn: `dressFlag` false = weapon art in hand, true = the costume body art. */
export interface EquipOnPush {
  cid: number;
  resCode: string;
  dressFlag: boolean;
}

/** onEquipOff: weapon removed (`dressFlag` false) or costume no longer shown (true; `resCode` = body now or '-1'). */
export interface EquipOffPush {
  cid: number;
  resCode: string;
  dressFlag: boolean;
  colorCode?: string;
}

/** onSetRes: reload the body of character `id` (`body` absent = a transform, like the legacy pushes). */
export interface SetResPush {
  id: number;
  res: string;
  body?: AvatarBody;
}

/** onFlyerOn: flyer art worn now; `resCode` '-1' (or '0') removes it (Flash has no flyer-off callback). */
export interface FlyerOnPush {
  cid: number;
  resCode: string;
  wavCode?: string;
}

/** onFairyOn: the guarding fairy of `cid` now shows `fairy.resCode` (Flash CreatureView.fairyOn). onFairyOff carries the bare cid. */
export interface FairyOnPush {
  cid: number;
  fairy: { resCode: string };
}

/** onBeginFlying / onStopFlying. */
export interface FlyingPush {
  id: number;
}
