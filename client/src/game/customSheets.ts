// Local sheet names that are not backed by a legacy numeric resource code.

export const NINJA_SHADOW_PREVIEW_RES = 'custom:NINJA_SHADOW_000001';

/** Sheet path (without extension) of a local development-only appearance resource. */
export function customSheetName(resCode: string): string | null {
  return resCode === NINJA_SHADOW_PREVIEW_RES ? 'custom/NINJA_SHADOW_000001' : null;
}
