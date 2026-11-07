// NPC entities of the current map (split out of GameScene in M9 phase E): createNpcs rows and loop bosses (BossLayer), the
// walk-up-then-talk click (legacy NPCView.doClick + PlayerView.stopWalk, 250 px talk range) and the clickNpc RPC.
// Battle NPCs (10 / 19 / 20) and loop bosses are resolved by the server: an open kill starts the battle, else the dialog opens.

import { Container, FederatedPointerEvent } from 'pixi.js';
import { NpcType, type SceneNpc } from '@mc/shared';
import type { GameClient } from '../net/client';
import { toast } from '../ui/screens';
import { Entity } from './Entity';
import type { HitMask } from './HitMask';
import { dirFromDelta } from './SheetAnim';

const NPC_TALK_RANGE = 250; // legacy NPCView click distance
const NPC_STAND_OFFSET = 120; // how far from the NPC the player stops when walking up
const NPC_CLICK_THROTTLE_MS = 1100;
// Boss (type 15, no data rows) / minigame / walk NPCs are not ported: clicking only shows a placeholder toast.
const UNSUPPORTED_NPC_TYPES: ReadonlySet<number> = new Set([
  NpcType.WALK, NpcType.BOSS, NpcType.HULA, NpcType.DOTA, NpcType.TRIPLE_TOWN,
]);

export type NpcRow = Pick<SceneNpc, 'id' | 'name' | 'posX' | 'posY' | 'posDir' | 'iconCode' | 'resCode' | 'type' | 'miniMap'>
  & { questState?: number };

export interface NpcLayerHost {
  client: GameClient;
  entities: Container;
  self(): Entity | null;
  /** False while chat has focus, the battle locks the map or the party blocks walking. */
  canAct(): boolean;
  hitMask(): HitMask | null;
  walkTo(self: Entity, x: number, y: number, onArrive: () => void): boolean;
}

export class NpcLayer {
  private readonly npcs = new Map<number, Entity>();
  private readonly icons = new Map<number, string>();
  private readonly miniMap = new Set<number>();
  private readonly lastClick = new Map<number, number>();
  private pending: Entity | null = null;

  constructor(private readonly host: NpcLayerHost) {}

  get(id: number): Entity | undefined {
    return this.npcs.get(id);
  }

  icon(id: number): string {
    return this.icons.get(id) ?? '0';
  }

  get count(): number {
    return this.npcs.size;
  }

  /** NPCs flagged for the area map (legacy MapCanvas.addNpc: mini_map == 1). */
  onMiniMap(): Entity[] {
    return [...this.npcs.values()].filter((e) => this.miniMap.has(e.entityId));
  }

  add(n: NpcRow): void {
    if (this.npcs.has(n.id)) return;
    const e = new Entity(n.id, 'npc', n.name, n.iconCode, n.resCode, n.posX, n.posY, n.posDir, n.type);
    e.on('pointertap', (ev: FederatedPointerEvent) => {
      ev.stopPropagation();
      this.click(e);
    });
    if (n.questState !== undefined) e.setQuestState(n.questState);
    this.npcs.set(n.id, e);
    this.icons.set(n.id, n.iconCode);
    if (n.miniMap === 1) this.miniMap.add(n.id);
    this.host.entities.addChild(e);
  }

  remove(id: number): void {
    const e = this.npcs.get(id);
    if (!e) return;
    if (this.pending === e) this.pending = null;
    e.destroy({ children: true });
    this.npcs.delete(id);
    this.icons.delete(id);
    this.miniMap.delete(id);
  }

  clear(): void {
    for (const e of this.npcs.values()) e.destroy({ children: true });
    this.npcs.clear();
    this.icons.clear();
    this.miniMap.clear();
    this.lastClick.clear();
    this.pending = null;
  }

  /** A ground tap or a gate walk cancels the pending walk-up. */
  cancelPending(): void {
    this.pending = null;
  }

  /** A battle cut the walk-up short (stopWalking drops the route): walk on to the pending NPC. */
  resumePending(): void {
    if (this.pending) this.click(this.pending);
  }

  /** Walk to an NPC on this map and talk to it (quest tracker "Tìm"). */
  talkTo(id: number): void {
    const npc = this.npcs.get(id);
    if (npc) this.click(npc);
  }

  tick(dt: number): void {
    for (const e of this.npcs.values()) e.tick(dt);
  }

  private click(npc: Entity): void {
    const self = this.host.self();
    if (!self || !this.host.canAct()) return;
    if (UNSUPPORTED_NPC_TYPES.has(npc.npcType)) {
      toast('Tính năng đang phát triển');
      return;
    }
    const dx = npc.x - self.x;
    const dy = npc.y - self.y;
    const dist = Math.hypot(dx, dy);
    if (dist > NPC_TALK_RANGE) {
      let x = Math.round(npc.x - (dx / dist) * NPC_STAND_OFFSET);
      let y = Math.round(npc.y - (dy / dist) * NPC_STAND_OFFSET);
      const mask = this.host.hitMask();
      if (mask) {
        const ok = mask.nearestWalkable(x, y);
        if (!ok) return;
        ({ x, y } = ok);
      }
      this.pending = npc;
      // Re-run the click on arrival (legacy PlayerView.stopWalk); a ground tap clears it.
      this.host.walkTo(self, x, y, () => {
        if (this.pending !== npc) return;
        this.pending = null;
        this.click(npc);
      });
      return;
    }
    this.pending = null;
    const now = performance.now();
    if (now - (this.lastClick.get(npc.entityId) ?? -Infinity) < NPC_CLICK_THROTTLE_MS) return;
    this.lastClick.set(npc.entityId, now);
    self.face(dirFromDelta(dx, dy, self.dir));
    npc.face(dirFromDelta(-dx, -dy, npc.dir));
    void this.host.client.call('clickNpc', npc.entityId).catch((e) => toast((e as Error).message, true));
  }
}
