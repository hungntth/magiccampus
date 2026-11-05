// Loop bosses on the map (M9 phase E, legacy GameScene.as:276 createBoss + CallBack onCreateBoss / onBossOn / onBossOff):
// asked for on every map entry after the NPCs, drawn as NPC entities (click = walk up + clickNpc, the server starts the
// fight), and their head marker comes from setNpcState. Air bosses (layer 3) stand on the ground: H5 has no flying.

import type { BossOnPush, BossRow, CreateBossPush } from '@mc/shared';
import type { GameClient } from '../net/client';
import type { NpcLayer } from './NpcLayer';

export class BossLayer {
  private readonly ids = new Set<number>();
  private readonly offs: (() => void)[] = [];

  constructor(private readonly client: GameClient, private readonly npcs: NpcLayer) {
    this.offs.push(
      client.on('onCreateBoss', (map) => {
        for (const row of Object.values((map ?? {}) as CreateBossPush)) this.show(row);
      }),
      client.on('onBossOn', (row) => this.show(row as BossOnPush)),
      client.on('onBossOff', (nid) => this.hide(Number(nid))),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
  }

  /** Map entry (after createNpcs): the scene cleared the old entities already. */
  enter(): void {
    this.ids.clear();
    void this.client.call('createBoss').catch(() => undefined);
  }

  private show(row: BossRow): void {
    if (this.ids.has(row.nid)) this.npcs.remove(row.nid);
    this.ids.add(row.nid);
    this.npcs.add({
      id: row.nid, name: row.name, posX: row.posX, posY: row.posY, posDir: 2, iconCode: '0', resCode: row.resCode, type: row.type ?? 10,
    });
    void this.client.call('setNpcState', row.nid).catch(() => undefined);
  }

  private hide(nid: number): void {
    if (!this.ids.delete(nid)) return;
    this.npcs.remove(nid);
  }
}
