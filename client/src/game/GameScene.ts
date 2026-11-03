// The in-world scene: map, entities, camera, click-to-move, and sync with the server
// (sceneLogin / createChars / createNpcs / udcr / sceneChange + onCR / onScenePlayer* pushes).

import { Application, Container, FederatedPointerEvent } from 'pixi.js';
import type { ChatMessage, MoveUpdate, PlayerData, SceneCharacter, SceneLoginResponse, SceneNpc } from '@mc/shared';
import type { GameClient } from '../net/client';
import { Entity } from './Entity';
import { MapLayer } from './MapLayer';
import { HitMask } from './HitMask';
import { ChatBox, Hud } from '../ui/chat';
import { toast } from '../ui/screens';

const MOVE_SEND_INTERVAL_MS = 120;

export class GameScene {
  private readonly world = new Container();
  private map: MapLayer | null = null;
  private readonly entityLayer = new Container();
  private readonly players = new Map<number, Entity>();
  private readonly npcs = new Map<number, Entity>();
  private self: Entity | null = null;
  private mapInfo: SceneLoginResponse['map'] | null = null;
  private hitMask: HitMask | null = null;
  private lastSent = 0;
  private readonly chat: ChatBox;
  private readonly hud: Hud;
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
      (cmd, args) => void this.command(cmd, args),
    );
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
    this.app.ticker.stop();
    this.world.destroy({ children: true });
  }

  private bindCallbacks(): void {
    this.offs.push(
      this.client.on('onScenePlayerEntered', (data) => this.addPlayer(data as SceneCharacter)),
      this.client.on('onScenePlayerLeft', (id) => this.removePlayer(Number(id))),
      this.client.on('onCR', (data) => this.onRemoteMove(data as MoveUpdate)),
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
      const e = new Entity(n.id, 'npc', n.name, n.iconCode, n.resCode, n.posX, n.posY, n.posDir);
      this.npcs.set(n.id, e);
      this.entityLayer.addChild(e);
    }
    this.chat.system(`Đã vào ${res.map.name} (map ${res.map.id}, ${res.map.width}×${res.map.height}, ${npcs.length} NPC)`);
    this.updateHud();
  }

  private clearScene(): void {
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

  private sendPosition(x: number, y: number, dir: number, route: number[][]): void {
    const now = performance.now();
    if (now - this.lastSent < MOVE_SEND_INTERVAL_MS) return;
    this.lastSent = now;
    void this.client.call('udcr', { x, y, dir, route }).catch(() => undefined);
  }

  private async command(cmd: string, args: string[]): Promise<void> {
    try {
      if (cmd === 'go') {
        const mapId = Number(args[0]);
        if (!Number.isInteger(mapId)) {
          this.chat.system('Dùng: /go <mapId>');
          return;
        }
        const res = await this.client.call<SceneLoginResponse>('sceneChange', mapId);
        await this.applyScene(res);
        return;
      }
      if (cmd === 'maps') {
        const maps = await this.client.call<{ id: number; name: string; type: number }[]>('getMapList');
        this.chat.system(maps.map((m) => `${m.id}:${m.name}`).join(' · '));
        return;
      }
      this.chat.system(`Lệnh không rõ: /${cmd}`);
    } catch (e) {
      this.chat.system(`Lỗi: ${(e as Error).message}`);
    }
  }

  private tick(dt: number): void {
    if (!this.self || !this.mapInfo) return;
    this.self.tick(dt);
    for (const e of this.players.values()) e.tick(dt);
    for (const e of this.npcs.values()) e.tick(0);

    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const camX = clamp(this.self.x - sw / 2, 0, Math.max(0, this.mapInfo.width - sw));
    const camY = clamp(this.self.y - sh / 2, 0, Math.max(0, this.mapInfo.height - sh));
    this.world.position.set(-camX, -camY);
    this.map?.updateVisible(camX, camY, sw, sh);
  }

  private updateHud(): void {
    this.hud.set({
      'Nhân vật': `${this.player.name} (Lv ${this.player.level})`,
      Map: this.mapInfo ? `${this.mapInfo.name} [${this.mapInfo.id}]` : '-',
      'Người chơi quanh đây': String(this.players.size),
      HP: `${this.player.currentHp}/${this.player.maxHp}`,
    });
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
