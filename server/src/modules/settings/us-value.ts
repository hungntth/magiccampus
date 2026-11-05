// us(map) whitelist (M9 phases C / G): the hotbar lock `ubl` and the "Hệ thống" panel keys. Pure.

import { isSystemSettingKey, validHotbarValue, validSystemSetting } from '@mc/shared';

/** undefined = not a saved key (ignored), null = bad value. */
export function usValue(key: string, v: unknown): number | boolean | null | undefined {
  if (key === 'ubl') return validHotbarValue(key, v);
  if (isSystemSettingKey(key)) return validSystemSetting(key, v);
  return undefined;
}
