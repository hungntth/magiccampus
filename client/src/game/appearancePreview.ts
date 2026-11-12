// URL-gated local appearance previews for development. `?previewDress=ninja-shadow` applies the Ninja Bóng Đêm sheet to Zed only.

import type { AvatarView, SceneCharacter } from '@mc/shared';
import { NINJA_SHADOW_PREVIEW_RES } from './customSheets';

const PREVIEW_DRESS_PARAM = 'previewDress';
const NINJA_SHADOW_PREVIEW = 'ninja-shadow';
const ZED_NAME = 'zed';

/** Replaces only the rendered body for the explicitly selected local test character; it never changes server state. */
export function ninjaShadowPreview(
  character: SceneCharacter,
  selectedName: string,
  search: URLSearchParams,
): SceneCharacter {
  if (selectedName.trim().toLocaleLowerCase() !== ZED_NAME || search.get(PREVIEW_DRESS_PARAM) !== NINJA_SHADOW_PREVIEW) return character;

  const base = character.av?.base ?? character.resCode;
  const av: AvatarView = {
    ...character.av,
    res: NINJA_SHADOW_PREVIEW_RES,
    base,
    body: 'dress',
    dress: NINJA_SHADOW_PREVIEW_RES,
    wp: character.av?.wp ?? character.wp ?? '0',
    flying: character.av?.flying ?? false,
  };
  return { ...character, resCode: NINJA_SHADOW_PREVIEW_RES, av };
}
