// Builds URLs for the hashed asset cache served by the game server under /res/<md5>.

import { iconHash, mapTileHash, resHash } from '@mc/shared';

const BASE = '/res';

export function iconUrl(code: number | string): string {
  return `${BASE}/${iconHash(code)}`;
}

export function resUrl(code: number | string): string {
  return `${BASE}/${resHash(code)}`;
}

export function mapTileUrl(mapResCode: number | string, col: number, row: number): string {
  return `${BASE}/${mapTileHash(mapResCode, col, row)}`;
}
