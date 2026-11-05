// M10 per-viewer instance NPCs: onNpcOn(InstanceNpc) adds (or replaces) an NPC entity on the current map, onNpcOff(id)
// removes it. The payload carries everything to draw it (instance id, template nid, art), so no client NPC table is needed.
// createNpcs already returns the ones visible at map entry.

import type { InstanceNpc } from '@mc/shared';
import type { GameClient } from '../net/client';
import type { NpcLayer } from './NpcLayer';

export class InstanceNpcs {
  private readonly offs: (() => void)[] = [];

  constructor(client: GameClient, private readonly npcs: NpcLayer, private readonly mapId: () => number) {
    this.offs.push(
      client.on('onNpcOn', (npc) => this.on(npc as InstanceNpc)),
      client.on('onNpcOff', (id) => this.npcs.remove(Number(id))),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
  }

  private on(npc: InstanceNpc): void {
    if (!npc || !Number.isInteger(npc.id) || (npc.map && npc.map !== this.mapId())) return;
    this.npcs.remove(npc.id);
    this.npcs.add(npc);
  }
}
