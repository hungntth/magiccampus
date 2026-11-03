// The in-world scene: map, entities, camera, click-to-move, and sync with the server
// (sceneLogin / createChars / createNpcs / udcr / sceneChange + onCR / onScenePlayer* pushes). Quests: QuestController.

import { Application, Container, FederatedPointerEvent } from 'pixi.js';
import { LEVEL_EXP, NpcType } from '@mc/shared';
import type {
  ChatMessage,
  MoveUpdate,
  NpcFuncInit,
  PlayerData,
  SceneCharacter,
  SceneLoginResponse,
  SceneNpc,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { Entity } from './Entity';
import { MapLayer } from './MapLayer';
import { HitMask } from './HitMask';
import { dirFromDelta } from './SheetAnim';
import { NpcDialog } from '../ui/npcDialog';
import { QuestController } from './QuestController';
import { runSceneCommand } from './sceneCommands';
import { ChatBox, Hud } from '../ui/chat';
import { toast } from '../ui/screens';

const MOVE_SEND_INTERVAL_MS = 120;
const NPC_TALK_RANGE = 250; // legacy NPCView click distance
const NPC_STAND_OFFSET = 120; // how far from the NPC the player stops when walking up
const NPC_DIALOG_CLOSE_DIST = 300;
const NPC_CLICK_THROTTLE_MS = 1100;
// Combat / minigame / walk NPCs: not ported, clicking only shows a placeholder toast.
const UNSUPPORTED_NPC_TYPES: ReadonlySet<number> = new Set([
  NpcType.WALK, NpcType.BATTLE, NpcType.STORY_BATTLE, NpcType.QUEST_BATTLE, NpcType.BOSS,
  NpcType.HULA, NpcType.DOTA, NpcType.TRIPLE_TOWN,
]);

export class GameScene {
  private readonly world = new Container();
  private map: MapLayer | null = null;
  private readonly entityLayer = new Container();
  private readonly players = new Map<number, Entity>();
  private readonly npcs = new Map<number, Entity>();
  private readonly npcIcons = new Map<number, string>();
  private readonly npcLastClick = new Map<number, number>();
  private pendingNpc: Entity | null = null;
  private readonly npcDialog = new NpcDialog();
  private self: Entity | null = null;
  private mapInfo: SceneLoginResponse['map'] | null = null;
  private hitMask: HitMask | null = null;
  private lastSent = 0;
  private readonly chat: ChatBox;
  private readonly hud: Hud;
  private readonly quest: QuestController;
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly app: Application,
    private readonly client: GameClient,
    private readonly player: PlayerData,
  ) {
    const ui = document.getElementById('ui')!;
    ui.replaceChildren();
    this.hud = new Hud(ui);
    this.chat = new ChatBox(
      ui,
      (channelId, msg) => void this.client.call('say', channelId, msg).catch((e) => toast((e as Error).message, true)),
      (cmd, args) => void runSceneCommand(cmd, args, this.client, this.chat, (res) => this.applyScene(res)),
    );
    this.quest = new QuestController({
      client, chat: this.chat, player,
      npc: (id) => this.npcs.get(id),
      npcIcon: (id) => this.npcIcons.get(id) ?? '0',
      mapId: () => this.mapInfo?.id ?? 0,
      talkToNpc: (id) => this.talkToNpc(id),
      playerChanged: () => this.updateHud(),
    }, ui);
    this.entityLayer.sortableChildren = true;
    this.world.addChild(this.entityLayer);
    this.app.stage.addChild(this.world);
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on('pointertap', (e: FederatedPointerEvent) => this.onTap(e));
    this.app.ticker.add((t) => this.tick(t.deltaMS / 1000));
    this.bindCallbacks();
  }

  async enter(): Promise<void> {
    const res = await this.client.call<SceneLoginResponse>('sceneLogin');
    await this.applyScene(res);
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.quest.destroy();
    this.npcDialog.close();
    this.pendingNpc = null;
    this.app.ticker.stop();
    this.world.destroy({ children: true });
  }

  private bindCallbacks(): void {
    this.offs.push(
      this.client.on('onScenePlayerEntered', (data) => this.addPlayer(data as SceneCharacter)),
      this.client.on('onScenePlayerLeft', (id) => this.removePlayer(Number(id))),
      this.client.on('onCR', (data) => this.onRemoteMove(data as MoveUpdate)),
      this.client.on('npcFuncInit', (data) => this.onNpcFuncInit(data as NpcFuncInit)),
      this.client.on('onChat', (data) => this.chat.push(data as ChatMessage)),
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

    const [peers, npcs] = await Promise.all([
      this.client.call<Record<string, SceneCharacter>>('createChars'),
      this.client.call<SceneNpc[]>('createNpcs'),
    ]);
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
    this.updateHud();
    await this.quest.load().catch((e) => toast((e as Error).message, true));
  }

  private clearScene(): void {
    this.npcDialog.close();
    this.quest.closePanel();
    this.pendingNpc = null;
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
    this.updateHud();
  }

  private removePlayer(id: number): void {
    const e = this.players.get(id);
    if (!e) return;
    e.destroy({ children: true });
    this.players.delete(id);
    this.updateHud();
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
    const local = this.world.toLocal(e.global);
    let x = Math.max(0, Math.min(this.mapInfo.width, Math.round(local.x)));
    let y = Math.max(0, Math.min(this.mapInfo.height, Math.round(local.y)));
    if (this.hitMask) {
      const ok = this.hitMask.nearestWalkable(x, y);
      if (!ok) return;
      x = ok.x;
      y = ok.y;
    }
    const dir = this.self.dir;
    this.self.moveAlong([[x, y]], () => this.sendPosition(x, y, dir, [[x, y]]));
    this.sendPosition(x, y, dir, [[x, y]]);
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
      const dir = dirFromDelta(x - self.x, y - self.y, self.dir);
      this.pendingNpc = npc;
      // Re-run the click on arrival (legacy PlayerView.stopWalk); a ground tap clears pendingNpc.
      self.moveAlong([[x, y]], () => {
        this.sendPosition(x, y, dir, [[x, y]]);
        if (this.pendingNpc === npc) {
          this.pendingNpc = null;
          this.onNpcClick(npc);
        }
      });
      this.sendPosition(x, y, dir, [[x, y]]);
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
    });
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
    this.closeDialogIfFar();
    for (const e of this.players.values()) e.tick(dt);
    for (const e of this.npcs.values()) e.tick(0);

    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const camX = clamp(this.self.x - sw / 2, 0, Math.max(0, this.mapInfo.width - sw));
    const camY = clamp(this.self.y - sh / 2, 0, Math.max(0, this.mapInfo.height - sh));
    this.world.position.set(-camX, -camY);
    this.map?.updateVisible(camX, camY, sw, sh);
  }

  private closeDialogIfFar(): void {
    const id = this.npcDialog.npcId;
    if (id === null || !this.self) return;
    const npc = this.npcs.get(id);
    if (!npc || Math.hypot(npc.x - this.self.x, npc.y - this.self.y) > NPC_DIALOG_CLOSE_DIST) this.npcDialog.close();
  }

  private updateHud(): void {
    this.hud.set({
      'Nhân vật': `${this.player.name} (Lv ${this.player.level})`,
      Exp: `${this.player.exp}/${LEVEL_EXP[Math.min(this.player.level, LEVEL_EXP.length - 1)]}`,
      'Tiền': `${this.player.moneyBind ?? 0}`,
      Map: this.mapInfo ? `${this.mapInfo.name} [${this.mapInfo.id}]` : '-',
      'Người chơi quanh đây': String(this.players.size),
      HP: `${this.player.currentHp}/${this.player.maxHp}`,
    });
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
