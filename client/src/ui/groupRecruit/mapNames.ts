// Map id -> display name for the team position tooltip. Uses the `getTransportMaps` list once per client (only maps a scroll can
// reach are named); every other id falls back to "Bản đồ <id>".

import type { TransportMapsReply } from '@mc/shared';
import type { GameClient } from '../../net/client';

let cache: { client: GameClient; names: Promise<Map<number, string>> } | null = null;

function load(client: GameClient): Promise<Map<number, string>> {
  if (cache?.client !== client) {
    const names = client
      .call<TransportMapsReply>('getTransportMaps')
      .then((r) => new Map(r.maps.map((m) => [m.id, m.name] as [number, string])))
      .catch(() => {
        cache = null; // retry next time
        return new Map<number, string>();
      });
    cache = { client, names };
  }
  return cache.names;
}

export async function mapNameOf(client: GameClient, id: number): Promise<string> {
  return (await load(client)).get(id) ?? `Bản đồ ${id}`;
}
