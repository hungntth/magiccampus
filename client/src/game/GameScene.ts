// The in-world scene: map, entities, camera, click-to-move, and sync with the server
// (sceneLogin / createChars / createNpcs / createSceneItems / udcr / sceneChange + onCR / onSceneEnter /
// onScenePlayer* pushes). Transport gates: PortalLayer. Quests: QuestController.
// World and DOM HUD share the virtual Flash stage scale (ui/stage.ts).

import { Application, Container, FederatedPointerEvent, Ticker } from 'pixi.js';
import { ChatChannel, NpcType } from '@mc/shared';
import type {
  ChatMessage,
  MoveUpdate,
  NpcFuncInit,
  OpenShop,
  PlayerData,
  SceneCharacter,
  SceneEnterPush,
  SceneItem,
  SceneLoginResponse,
  SceneNpc,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { Entity } from './Entity';
import { MapLayer } from './MapLayer';
import { HitMask } from './HitMask';
import { PortalLayer, type Portal } from './PortalLayer';
import { dirFromDelta } from './SheetAnim';
import { findRoute, type RoutePoint } from './route';
import { NpcDialog } from '../ui/npcDialog';
import { ShopPanel } from '../ui/shopPanel';
import { QuestController } from './QuestController';
import { BagController } from './BagController';
import { CharacterController } from './CharacterController';
import { runSceneCommand } from './sceneCommands';
import { ChatBox } from '../ui/chat';
import { MainHud } from '../ui/hud/mainHud';
import { clearUi, toast } from '../ui/screens';
import { onStageResize, stageEl, stageScale } from '../ui/stage';

const MOVE_SEND_INTERVAL_MS = 120;
const NPC_TALK_RANGE = 250; // legacy NPCView click distance
const NPC_STAND_OFFSET = 120; // how far from the NPC the player stops when walking up
const NPC_DIALOG_CLOSE_DIST = 300;
const NPC_CLICK_THROTTLE_MS = 1100;
const GATE_CLICK_THROTTLE_MS = 1100; // RPCConfig sceneChange throttle
// Combat / minigame / walk NPCs: not ported, clicking only shows a placeholder toast.
const UNSUPPORTED_NPC_TYPES: ReadonlySet<number> = new Set([
  NpcType.WALK, NpcType.BATTLE, NpcType.STORY_BATTLE, NpcType.QUEST_BATTLE, NpcType.BOSS,
  NpcType.HULA, NpcType.DOTA, NpcType.TRIPLE_TOWN,
]);

export class GameScene {
  /** Scaled by the stage scale so world pixels match stage pixels, as in the Flash client. */
  private readonly root = new Container();
  private readonly world = new Container();
  private map: MapLayer | null = null;
  private readonly entityLayer = new Container();
  private readonly players = new Map<number, Entity>();
  private readonly npcs = new Map<number, Entity>();
  private readonly npcIcons = new Map<number, string>();
  private readonly npcLastClick = new Map<number, number>();
  private pendingNpc: Entity | null = null;
  private readonly portals: PortalLayer;
  private pendingGate: Portal | null = null;
  private lastGateAt = -Infinity;
  private readonly npcDialog = new NpcDialog();
  private readonly shop = new ShopPanel();
  private self: Entity | null = null;
  private mapInfo: SceneLoginResponse['map'] | null = null;
  private hitMask: HitMask | null = null;
  private lastSent = 0;
  private readonly chat: ChatBox;
  private readonly hud: MainHud;
  private readonly quest: QuestController;
  private readonly bag: BagController;
  private readonly character: CharacterController;
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly app: Application,
    private readonly client: GameClient,
    private readonly player: PlayerData,
  ) {
    clearUi();
    const ui = stageEl();
    ui.replaceChildren();
    this.chat = new ChatBox(
      ui,
      (channelId, msg) => void this.client.call('say', channelId, msg).catch((e) => toast((e as Error).message, true)),
      (cmd, args) => void runSceneCommand(cmd, args, this.client, this.chat, (res) => this.applyScene(res)),
    );
    this.hud = new MainHud(ui, client, () => document.activeElement instanceof HTMLInputElement, {
      onBag: () => this.bag.toggle(),
      onCharacter: () => this.character.toggle(),
      onLevelUp: () => this.character.levelUp(),
      onRecover: (kind) => this.bag.actions.recover(kind),
    });
    this.quest = new QuestController({
      client, chat: this.chat, player,
      npc: (id) => this.npcs.get(id),
      npcIcon: (id) => this.npcIcons.get(id) ?? '0',
      mapId: () => this.mapInfo?.id ?? 0,
      talkToNpc: (id) => this.talkToNpc(id),
      playerChanged: () => this.updateHud(),
    }, ui);
    this.bag = new BagController({ client, chat: this.chat, player, shop: this.shop });
    this.character = new CharacterController({ client, player, bag: this.bag });
    this.entityLayer.sortableChildren = true;
    this.world.addChild(this.entityLayer);
    this.portals = new PortalLayer(this.entityLayer, this.world, (p, e) => this.onGateTap(p, e));
    this.root.addChild(this.world);
    this.root.scale.set(stageScale());
    this.app.stage.addChild(this.root);
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    // Removed in destroy(): main.ts reuses the Application after a reconnect.
    const onTap = (e: FederatedPointerEvent): void => this.onTap(e);
    const onTick = (t: Ticker): void => this.tick(t.deltaMS / 1000);
    this.app.stage.on('pointertap', onTap);
    this.app.ticker.add(onTick);
    this.offs.push(() => this.app.stage.off('pointertap', onTap), () => this.app.ticker.remove(onTick));
    this.bindCallbacks();
    this.offs.push(onStageResize((s) => this.root.scale.set(s.scale)));
  }

  async enter(): Promise<void> {
    const res = await this.client.call<SceneLoginResponse>('sceneLogin');
    await this.applyScene(res);
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.quest.destroy();
    this.bag.destroy();
    this.character.destroy();
    this.hud.destroy();
    this.npcDialog.close();
    this.shop.close();
    this.pendingNpc = null;
    this.app.ticker.stop();
    this.root.destroy({ children: true });
    stageEl().replaceChildren();
  }

  private bindCallbacks(): void {
    this.offs.push(
      this.client.on('onSceneEnter', (data) => void this.applyScene(data as SceneEnterPush).catch((e) => toast((e as Error).message, true))),
      this.client.on('onScenePlayerEntered', (data) => this.addPlayer(data as SceneCharacter)),
      this.client.on('onScenePlayerLeft', (id) => this.removePlayer(Number(id))),
      this.client.on('onCR', (data) => this.onRemoteMove(data as MoveUpdate)),
      this.client.on('npcFuncInit', (data) => this.onNpcFuncInit(data as NpcFuncInit)),
      this.client.on('onOpenShop', (data) => this.onOpenShop(data as OpenShop)),
      this.client.on('onChat', (data) => this.onChat(data as ChatMessage)),
      this.client.on('onKickChar', () => toast('Tài khoản được đăng nhập ở nơi khác', true, 8000)),
    );
  }

  private async applyScene(res: SceneLoginResponse): Promise<void> {
    this.clearScene();
    this.mapInfo = res.map;
    this.map = new MapLayer(res.map);
    this.world.addChildAt(this.map, 0);
    const [, mask] = await Promise.all([this.map.loadInitial(), HitMask.load(res.map.resCode)]);
    this.hitMask = mask;

    this.self = new Entity(res.self.id, 'self', res.self.name, res.self.iconCode, res.self.resCode, res.self.posX, res.self.posY, res.self.posDir);
    this.entityLayer.addChild(this.self);

    const [peers, npcs, items] = await Promise.all([
      this.client.call<Record<string, SceneCharacter>>('createChars'),
      this.client.call<SceneNpc[]>('createNpcs'),
      this.client.call<SceneItem[]>('createSceneItems').catch(() => [] as SceneItem[]),
    ]);
    void this.portals.load(items);
    for (const p of Object.values(peers)) this.addPlayer(p);
    for (const n of npcs) {
      if (this.npcs.has(n.id)) continue;
      const e = new Entity(n.id, 'npc', n.name, n.iconCode, n.resCode, n.posX, n.posY, n.posDir, n.type);
      e.on('pointertap', (ev: FederatedPointerEvent) => {
        ev.stopPropagation();
        this.onNpcClick(e);
      });
      e.setQuestState(n.questState);
      this.npcs.set(n.id, e);
      this.npcIcons.set(n.id, n.iconCode);
      this.entityLayer.addChild(e);
    }
    this.chat.system(`Đã vào ${res.map.name} (map ${res.map.id}, ${res.map.width}×${res.map.height}, ${npcs.length} NPC)`);
    this.hud.setMap(res.map.name);
    this.updateHud();
    await this.quest.load().catch((e) => toast((e as Error).message, true));
    await this.bag.load().catch((e) => toast((e as Error).message, true));
  }

  private clearScene(): void {
    this.npcDialog.close();
    this.shop.close();
    this.quest.closePanel();
    this.pendingNpc = null;
    this.pendingGate = null;
    this.portals.clear();
    this.npcLastClick.clear();
    this.npcIcons.clear();
    this.map?.destroy({ children: true });
    this.map = null;
    for (const e of this.players.values()) e.destroy({ children: true });
    for (const e of this.npcs.values()) e.destroy({ children: true });
    this.players.clear();
    this.npcs.clear();
    this.self?.destroy({ children: true });
    this.self = null;
  }

  private addPlayer(data: SceneCharacter): void {
    if (!this.self || data.id === this.self.entityId) return;
    const existing = this.players.get(data.id);
    if (existing) {
      existing.teleport(data.posX, data.posY);
      return;
    }
    const e = new Entity(data.id, 'player', data.name, data.iconCode, data.resCode, data.posX, data.posY, data.posDir);
    this.players.set(data.id, e);
    this.entityLayer.addChild(e);
  }

  private removePlayer(id: number): void {
    const e = this.players.get(id);
    if (!e) return;
    e.destroy({ children: true });
    this.players.delete(id);
  }

  /** Log every message; current-map chat also pops a bubble over the speaker (self included). */
  private onChat(msg: ChatMessage): void {
    this.chat.push(msg);
    if (msg.channelId !== ChatChannel.LOCAL) return;
    const speaker = msg.id === this.self?.entityId ? this.self : this.players.get(msg.id);
    speaker?.say(msg.msg);
  }

  private onRemoteMove(data: MoveUpdate): void {
    const e = this.players.get(data.id);
    if (!e) return;
    const route = data.route?.length ? data.route : [[data.x, data.y]];
    e.moveAlong(route);
  }

  private onTap(e: FederatedPointerEvent): void {
    if (!this.self || !this.mapInfo || this.chat.focused) return;
    this.pendingNpc = null;
    this.pendingGate = null;
    const local = this.world.toLocal(e.global);
    let x = Math.max(0, Math.min(this.mapInfo.width, Math.round(local.x)));
    let y = Math.max(0, Math.min(this.mapInfo.height, Math.round(local.y)));
    if (this.hitMask) {
      const ok = this.hitMask.nearestWalkable(x, y);
      if (!ok) return;
      x = ok.x;
      y = ok.y;
    }
    this.walkTo(this.self, x, y);
  }

  /**
   * Walk the player along a hit-mask route to (x, y) and report it with udcr; `onArrive` runs at the end point
   * (passed the final position). Returns false, without calling `onArrive`, when there is nowhere to go.
   */
  private walkTo(self: Entity, x: number, y: number, onArrive?: (ex: number, ey: number) => void): boolean {
    const route = this.hitMask ? findRoute(this.hitMask, self.x, self.y, x, y) : [[x, y] as RoutePoint];
    if (route.length === 0) return false;
    const [ex, ey] = route[route.length - 1];
    const dir = dirFromDelta(route[0][0] - self.x, route[0][1] - self.y, self.dir);
    self.moveAlong(route, () => {
      this.sendPosition(ex, ey, self.dir, [[ex, ey]]);
      onArrive?.(ex, ey);
    });
    this.sendPosition(ex, ey, dir, route);
    return true;
  }

  /** Gate click (SceneItemView.mouseDown): walk to the clicked point; arriving on the gate sends sceneChange(gateId). */
  private onGateTap(portal: Portal, e: FederatedPointerEvent): void {
    const self = this.self;
    if (!self || !this.mapInfo || this.chat.focused) return;
    e.stopPropagation();
    this.pendingNpc = null;
    const local = this.world.toLocal(e.global);
    let x = clamp(Math.round(local.x), 0, this.mapInfo.width);
    let y = clamp(Math.round(local.y), 0, this.mapInfo.height);
    const ok = this.hitMask?.nearestWalkable(x, y);
    if (this.hitMask && !ok) return;
    if (ok) ({ x, y } = ok);
    this.pendingGate = portal;
    // Legacy PlayerView.stopWalk: on arrival the shadow must hit the gate sprite; a ground tap clears pendingGate.
    this.walkTo(self, x, y, () => {
      if (this.pendingGate !== portal) return;
      this.pendingGate = null;
      const now = performance.now();
      if (!this.portals.contains(portal, self.x, self.y) || now - this.lastGateAt < GATE_CLICK_THROTTLE_MS) return;
      this.lastGateAt = now;
      void this.client.call('sceneChange', portal.item.id).catch((err) => toast((err as Error).message, true));
    });
  }

  /** Walk to an NPC on this map and talk to it (quest tracker "Tìm"). */
  talkToNpc(id: number): void {
    const npc = this.npcs.get(id);
    if (npc) this.onNpcClick(npc);
  }

  private onNpcClick(npc: Entity): void {
    const self = this.self;
    if (!self || !this.mapInfo || this.chat.focused) return;
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
      if (this.hitMask) {
        const ok = this.hitMask.nearestWalkable(x, y);
        if (!ok) return;
        x = ok.x;
        y = ok.y;
      }
      this.pendingNpc = npc;
      // Re-run the click on arrival (legacy PlayerView.stopWalk); a ground tap clears pendingNpc.
      this.walkTo(self, x, y, () => {
        if (this.pendingNpc === npc) {
          this.pendingNpc = null;
          this.onNpcClick(npc);
        }
      });
      return;
    }
    this.pendingNpc = null;
    const now = performance.now();
    if (now - (this.npcLastClick.get(npc.entityId) ?? -Infinity) < NPC_CLICK_THROTTLE_MS) return;
    this.npcLastClick.set(npc.entityId, now);
    self.face(dirFromDelta(dx, dy, self.dir));
    npc.face(dirFromDelta(-dx, -dy, npc.dir));
    void this.client.call('clickNpc', npc.entityId).catch((e) => toast((e as Error).message, true));
  }

  private onNpcFuncInit(data: NpcFuncInit): void {
    const npc = this.npcs.get(data.npcId);
    if (!npc) return;
    if (data.npcQuest.state <= 0 && data.npcType <= 0) {
      // Legacy: talk-only NPCs show their greeting as a speech bubble instead of a panel.
      this.npcDialog.close();
      npc.say(data.onServiceText);
      return;
    }
    this.npcDialog.show(data, this.npcIcons.get(data.npcId) ?? '0', (view) => {
      this.npcDialog.close();
      this.quest.openFromNpc(view, data.npcId, data.npcName);
    }, (npcType) => {
      if (npcType !== NpcType.SHOP) return toast('Tính năng đang phát triển');
      void this.client.call('npcFuncClick', data.npcId).catch((e) => toast((e as Error).message, true));
    });
  }

  private onOpenShop(data: OpenShop): void {
    this.npcDialog.close();
    this.quest.closePanel();
    this.shop.show(data, true);
    this.bag.showBesideShop();
  }

  private sendPosition(x: number, y: number, dir: number, route: number[][]): void {
    const now = performance.now();
    if (now - this.lastSent < MOVE_SEND_INTERVAL_MS) return;
    this.lastSent = now;
    void this.client.call('udcr', { x, y, dir, route }).catch(() => undefined);
  }

  private tick(dt: number): void {
    if (!this.self || !this.mapInfo) return;
    this.self.tick(dt);
    this.portals.tick(dt);
    this.hud.setPosition(this.self.x, this.self.y);
    this.closeDialogIfFar();
    for (const e of this.players.values()) e.tick(dt);
    for (const e of this.npcs.values()) e.tick(dt);

    const scale = this.root.scale.x;
    const sw = this.app.screen.width / scale;
    const sh = this.app.screen.height / scale;
    const camX = clamp(this.self.x - sw / 2, 0, Math.max(0, this.mapInfo.width - sw));
    const camY = clamp(this.self.y - sh / 2, 0, Math.max(0, this.mapInfo.height - sh));
    this.world.position.set(-camX, -camY);
    this.map?.updateVisible(camX, camY, sw, sh);
  }

  private closeDialogIfFar(): void {
    if (!this.self) return;
    const far = (id: number | null): boolean => {
      const npc = id === null ? undefined : this.npcs.get(id);
      return id !== null && (!npc || Math.hypot(npc.x - this.self!.x, npc.y - this.self!.y) > NPC_DIALOG_CLOSE_DIST);
    };
    if (far(this.npcDialog.npcId)) this.npcDialog.close();
    if (far(this.shop.npcId)) this.shop.close();
  }

  private updateHud(): void {
    this.hud.setPlayer(this.player);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
