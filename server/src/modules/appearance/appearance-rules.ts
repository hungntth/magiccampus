// Pure avatar resolver (M13 phase A): turns the worn items / flags into the AvatarView of a character. Priority of the body:
// active transform (VIP right 13, Mê Huyễn curse) > (dress hidden or no costume worn: class body) > fake dress > worn costume > class
// body. A fake dress / fake flyer (phase B data) only replaces a costume / flyer that is actually worn. Flying needs a flyable map.

import type { AvatarBody, AvatarView } from '@mc/shared';

/** Flyer art pair: main layer (res_code) and the optional front overlay (wav_code). */
export interface FlyerArt {
  res: string;
  wav: string | null;
}

export interface LookInput {
  /** Class body of the character's gender. */
  classBody: string;
  /** Active transform body art, null when none. */
  transform: string | null;
  /** Weapon art held, '0' = none. */
  weapon: string;
  /** Art of the worn fashion costume (gender resolved), null when none worn. */
  costume: string | null;
  hideDress: boolean;
  /** Art of the fake dress (phase B), null = none. */
  fakeDress: string | null;
  flyer: FlyerArt | null;
  fakeFlyer: FlyerArt | null;
  /** Persisted "in the air" flag and whether the current map allows flying. */
  flying: boolean;
  mapFlyable: boolean;
  /** Art of the riding mount skin, null when not riding. */
  mount: string | null;
}

export const NO_LOOK_INPUT: LookInput = {
  classBody: '0', transform: null, weapon: '0', costume: null, hideDress: false, fakeDress: null, flyer: null, fakeFlyer: null,
  flying: false, mapFlyable: true, mount: null,
};

/** Body art and its kind. */
export function bodyOf(i: Pick<LookInput, 'classBody' | 'transform' | 'costume' | 'hideDress' | 'fakeDress'>): { res: string; body: AvatarBody } {
  if (i.transform) return { res: i.transform, body: 'transform' };
  if (i.hideDress || !i.costume) return { res: i.classBody, body: 'class' };
  return { res: i.fakeDress ?? i.costume, body: 'dress' };
}

/** Flyer layers shown: the fake flyer wins over the worn one; nothing when no flyer is worn. */
export function flyerOf(worn: FlyerArt | null, fake: FlyerArt | null): FlyerArt | null {
  if (!worn) return null;
  return fake ?? worn;
}

export function appearanceOf(i: LookInput): AvatarView {
  const { res, body } = bodyOf(i);
  const flyer = flyerOf(i.flyer, i.fakeFlyer);
  const view: AvatarView = { res, base: i.classBody, body, wp: i.weapon || '0', flying: i.flying && i.mapFlyable };
  if (body === 'dress') view.dress = res;
  if (flyer) {
    view.flyer = flyer.res;
    if (flyer.wav) view.flyerFront = flyer.wav;
  }
  if (i.mount) view.mount = i.mount;
  return view;
}

/** Positive art code as a string, '0' / 0 / null = none. */
export function artCode(v: unknown): string | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? String(v) : null;
}

/** Costume art of a fashion template for the gender (Go picker: female / male column, then res_code). */
export function costumeArt(tpl: Record<string, unknown> | undefined, gender: number): string | null {
  if (!tpl) return null;
  return artCode(gender === 1 ? tpl.res_code_female : tpl.res_code_male) ?? artCode(tpl.res_code);
}

/** Flyer art of a flyer template: res_code plus the wav_code overlay. */
export function flyerArt(tpl: Record<string, unknown> | undefined): FlyerArt | null {
  const res = artCode(tpl?.res_code);
  return res ? { res, wav: artCode(tpl?.wav_code) } : null;
}
