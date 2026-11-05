// The in-world scene: map, entities, camera, click-to-move, and sync with the server
// (sceneLogin / createChars / createNpcs / createSceneItems / udcr / sceneChange + onCR / onSceneEnter /
// onScenePlayer* pushes). Transport gates: PortalLayer. NPCs: NpcLayer (+ loop bosses: BossLayer). Quests: QuestController.
// World and DOM HUD share the virtual Flash stage scale (ui/stage.ts).

import { Application, Container, FederatedPointerEvent, Ticker } from 'pixi.js';
import type { PlayerUpdate } from '@mc/shared';
import type {
  MoveUpdate, NpcFuncInit, OpenShop, PlayerData, SceneCharacter, SceneEnterPush, SceneItem, SceneLoginResponse, SceneNpc,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { BossLayer } from './BossLayer';
import { Entity } from './Entity';
import { NpcLayer } from './NpcLayer';
import { NpcScriptController } from './NpcScriptController';
import { InstanceNpcs } from './InstanceNpcs';
import { ViewSettings } from './ViewSettings';
import { MapLayer } from './MapLayer';
import { HitMask } from './HitMask';
import { PortalLayer, type Portal } from './PortalLayer';
import { dirFromDelta } from './SheetAnim';
import { findRoute, type RoutePoint } from './route';
import { QuestController } from './QuestController';
import { ActivityController } from './ActivityController';
import { BagController } from './BagController';
import { ForgeController } from './ForgeController';
import { MallController } from './MallController';
import { CharacterController } from './CharacterController';
import { PetController } from './PetController';
import { RankingPanel } from '../ui/rankingPanel';
import { PetLayer } from './PetLayer';
import { BattleController } from './BattleController';
import { runSceneCommand } from './sceneCommands';
import { DungeonController } from './DungeonController';
import { MazeController } from './MazeController';
import { QuizController } from './QuizController';
import { WorldBossController } from './WorldBossController';
import { SocialController } from './SocialController';
import { PartyController } from './PartyController';
import { FriendController } from './FriendController';
import { GuildController } from './GuildController';
import { TradeController } from './TradeController';
import { AuctionController } from './AuctionController';
import { MailController } from './MailController';
import { TempBagController } from './TempBagController';
import { NpcPanels } from './NpcPanels';
import type { ChatBox } from '../ui/chat';
import { MainHud } from '../ui/hud/mainHud';
import { clearUi, toast } from '../ui/screens';
import { onStageResize, stageEl, stageScale } from '../ui/stage';

const MOVE_SEND_INTERVAL_MS = 120;
const GATE_CLICK_THROTTLE_MS = 1100; // RPCConfig sceneChange throttle

export class GameScene {
  /** Scaled by the stage scale so world pixels match stage pixels, as in the Flash client. */
  private readonly root = new Container();
  private readonly world = new Container();
  private map: MapLayer | null = null;
  private readonly entityLayer = new Container();
  private readonly players = new Map<number, Entity>();
  private readonly npcs: NpcLayer;
  private readonly bosses: BossLayer;
  private readonly scripts: NpcScriptController;
  private readonly instanceNpcs: InstanceNpcs;
  private readonly view = new ViewSettings();
  private readonly portals: PortalLayer;
  private pendingGate: Portal | null = null;
  private lastGateAt = -Infinity;
  private readonly panels: NpcPanels;
  private self: Entity | null = null;
  private mapInfo: SceneLoginResponse['map'] | null = null;
  private hitMask: HitMask | null = null;
  private lastSent = 0;
  private readonly social: SocialController;
  private readonly party: PartyController;
  private readonly friends: FriendController;
  private readonly guild: GuildController;
  private readonly chat: ChatBox;
  private readonly hud: MainHud;
  private readonly quest: QuestController;
  private readonly bag: BagController;
  private readonly mall: MallController;
  private readonly forge: ForgeController;
  private readonly trade: TradeController;
  private readonly mail: MailController;
  private readonly tempBag: TempBagController;
  private readonly auction: AuctionController;
  private readonly character: CharacterController;
  private readonly pet: PetController;
  private readonly ranking: RankingPanel;
  private readonly activity: ActivityController;
  private readonly quiz: QuizController;
  private readonly worldBoss: WorldBossController;
  private readonly dungeons: DungeonController;
  private readonly maze: MazeController;
  private readonly petLayer: PetLayer;
  private readonly battle: BattleController;
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly app: Application,
    private readonly client: GameClient,
    private readonly player: PlayerData,
  ) {
    clearUi();
    const ui = stageEl();
    ui.replaceChildren();
    const entityOf = (id: number): Entity | undefined => (id === this.self?.entityId ? this.self : this.players.get(id));
    this.social = new SocialController({
      client, player, ui, entityOf,
      locked: () => this.battle.locked, mapInfo: () => this.mapInfo,
      party: () => this.party,
      trade: () => this.trade,
      friends: () => ({ isBlack: (id) => this.friends.isBlack(id), add: (name) => this.friends.addByName(name) }),
      watch: (id) => void this.battle.watch.start(id),
      onCommand: (cmd, args) => void runSceneCommand(cmd, args, client, this.chat, (res) => this.applyScene(res), () => void this.bag.funcs.openTransport(), () => void this.dungeons.openHub()),
    });
    this.chat = this.social.chat;
    this.friends = new FriendController({
      client,
      whisper: (name) => this.social.whisperTo(name),
      privateChat: (id, name) => this.social.openPrivate(id, name),
      invite: (id) => this.party.invite(id),
    });
    this.party = new PartyController({ client, player, ui, chat: this.chat, entityOf, locked: () => this.battle.locked });
    this.panels = new NpcPanels({
      client, npc: (id) => this.npcs.get(id), npcIcon: (id) => this.npcs.icon(id), self: () => this.self, playerLevel: () => player.level,
      quest: () => this.quest, bag: () => this.bag,
    });
    this.hud = new MainHud(ui, client, () => document.activeElement instanceof HTMLInputElement, {
      onBag: () => this.bag.toggle(),
      onCharacter: () => this.character.toggle(),
      onFriend: () => this.friends.toggle(),
      onGuild: () => this.guild.toggle(), onPk: () => this.social.pk.begin(),
      onShop: () => void this.mall.toggle(),
      onForge: (tab) => this.forge.open(tab),
      onRank: () => this.ranking.toggle(), onAchieve: () => this.character.toggleAchievements(), onDaily: () => this.activity.openDaily(), onVip: () => this.activity.openVip(), onOffline: () => this.activity.openOffline(),
      onPet: () => this.pet.toggle(),
      onArena: () => this.pet.toggleArena(), onPpve: () => this.pet.togglePpve(),
      onLevelUp: () => this.character.levelUp(),
      onRecover: (kind) => this.bag.actions.recover(kind), bagItems: () => this.bag.list(), useBagItem: (it) => this.bag.actions.use(it), onBloodBag: (bt) => this.hud.bloodBag.open(bt),
      onViewChanged: () => this.applyView(), travel: (id, group) => this.bag.funcs.travelTo(id, group),
    });
    this.quest = new QuestController({
      client, chat: this.chat, player,
      npc: (id) => this.npcs.get(id),
      npcIcon: (id) => this.npcs.icon(id),
      mapId: () => this.mapInfo?.id ?? 0,
      talkToNpc: (id) => this.npcs.talkTo(id),
      playerChanged: () => this.updateHud(),
      bagCount: (id) => this.bag.countOf(id),
    }, ui);
    this.bag = new BagController({ client, chat: this.chat, player, shop: this.panels.shop });
    this.mall = new MallController(client, this.bag, player);
    this.forge = new ForgeController(client, this.bag, () => player);
    this.ranking = new RankingPanel(client);
    this.dungeons = new DungeonController(client, entityOf, (id) => this.bag.countOf(id));
    this.maze = new MazeController(client, () => player.level);
    this.activity = new ActivityController({ client, player, refreshHud: () => this.updateHud(), entityOf, bagCount: (id) => this.bag.countOf(id), openDungeons: () => void this.dungeons.openHub(), openStar: () => this.dungeons.star.toggle(), openMaze: () => this.maze.toggleLobby(), openQuiz: () => this.quiz.openFromStrip() });
    this.quiz = new QuizController(client, player, this.chat);
    this.worldBoss = new WorldBossController(client, player.id, this.chat);
    this.trade = new TradeController({ client, player, bag: this.bag });
    this.mail = new MailController({ client, player, bagItems: () => this.bag.listTabs(), pets: () => this.pet.pets() });
    this.tempBag = new TempBagController({ client, player, bag: this.bag, chat: this.chat });
    this.auction = new AuctionController({ client, player, bagItems: () => this.bag.listTabs(), pets: () => this.pet.pets() });
    this.character = new CharacterController({ client, player, bag: this.bag, entityOf, onMount: () => this.activity.openMount() });
    this.guild = new GuildController({ client, player, bagItems: () => this.bag.list(), entities: this.entityLayer });
    this.pet = new PetController({ client, player, chat: this.chat, bag: this.bag, setBattlePet: (p) => this.hud.setBattlePet(p), onDetail: () => this.character.detail.toggle('pet') });
    this.battle = new BattleController({
      client, player, root: this.root, world: this.world, entities: this.entityLayer,
      bagItems: () => this.bag.list(), petVitals: (hp, mp) => this.pet.setBattleVitals(hp, mp),
      stopWalking: () => this.self?.teleport(this.self.x, this.self.y),
      mapSafe: () => (this.mapInfo?.safeFlag ?? 0) > 0,
      onEndReply: (reply) => this.dungeons.star.onBattleReply(reply) || this.maze.onBattleEnd(),
    });
    this.entityLayer.sortableChildren = true;
    this.npcs = new NpcLayer({
      client, entities: this.entityLayer, self: () => this.self, hitMask: () => this.hitMask,
      canAct: () => !!this.mapInfo && !this.chat.focused && !this.battle.locked && !this.party.blocked(),
      walkTo: (self, x, y, onArrive) => this.walkTo(self, x, y, onArrive),
    });
    this.bosses = new BossLayer(client, this.npcs);
    this.scripts = new NpcScriptController(client, this.panels.dialog, this.npcs, this.chat);
    this.instanceNpcs = new InstanceNpcs(client, this.npcs, () => this.mapInfo?.id ?? 0);
    this.world.addChild(this.entityLayer);
    this.petLayer = new PetLayer(client, this.entityLayer, entityOf);
    this.portals = new PortalLayer(this.entityLayer, this.world, (p, e) => this.onGateTap(p, e), this.guild.buildings);
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
    this.view.load(player.interfaceData);
  }

  /** System settings (hc / hn / ac / maxView) on the current entities. */
  private applyView(): void {
    this.view.load(this.player.interfaceData);
    this.view.apply(this.players.values(), this.self);
  }

  async enter(): Promise<void> {
    const res = await this.client.call<SceneLoginResponse>('sceneLogin');
    await this.applyScene(res);
  }

  destroy(): void {
    for (const off of this.offs) off();
    const { social, party, friends, guild, trade, quest, bag, character, pet, petLayer, battle, hud } = this;
    for (const c of [social, party, friends, guild, trade, quest, bag, character, pet, petLayer, battle, hud, this.bosses, this.scripts, this.instanceNpcs]) c.destroy();
    for (const c of [this.mail, this.tempBag, this.auction, this.mall, this.forge, this.ranking, this.activity, this.dungeons, this.maze, this.quiz, this.worldBoss]) c.destroy();
    this.panels.destroy();
    this.npcs.clear();
    this.app.ticker.stop();
    this.root.destroy({ children: true });
    stageEl().replaceChildren();
  }

  private bindCallbacks(): void {
    this.offs.push(
      this.client.on('onSceneEnter', (data) => void this.applyScene(data as SceneEnterPush).catch((e) => toast((e as Error).message, true))),
      this.client.on('onScenePlayerEntered', (data) => this.addPlayer(data as SceneCharacter)),
      this.client.on('onScenePlayerLeft', (id) => this.removePlayer(Number(id))),
      this.client.on('onScenePlayerRenamed', (id, name) => this.players.get(Number(id))?.setName(String(name))),
      this.client.on('onUPP', (d) => typeof (d as PlayerUpdate).name === 'string' && this.self?.setName((d as PlayerUpdate).name!)),
      this.client.on('onCR', (data) => this.onRemoteMove(data as MoveUpdate)),
      this.client.on('npcFuncInit', (data) => this.panels.onNpcFuncInit(data as NpcFuncInit)),
      this.client.on('onOpenShop', (data) => this.panels.onOpenShop(data as OpenShop)),
      this.client.on('onKickChar', () => toast('Tài khoản được đăng nhập ở nơi khác', true, 8000)),
    );
  }

  private async applyScene(res: SceneLoginResponse): Promise<void> {
    this.clearScene();
    this.mapInfo = res.map;
    this.battle.setCheckPoint(res.self.posX, res.self.posY);
    this.map = new MapLayer(res.map);
    this.world.addChildAt(this.map, 0);
    const [, mask] = await Promise.all([this.map.loadInitial(), HitMask.load(res.map.resCode)]);
    this.hitMask = mask;

    this.self = new Entity(res.self.id, 'self', res.self.name, res.self.iconCode, res.self.resCode, res.self.posX, res.self.posY, res.self.posDir);
    this.entityLayer.addChild(this.self);
    this.party.track(res.self);
    this.character.applyTitles(this.self, res.self);
    this.petLayer.fromScene(res.self);

    const [peers, npcs, items] = await Promise.all([
      this.client.call<Record<string, SceneCharacter>>('createChars'),
      this.client.call<SceneNpc[]>('createNpcs'),
      this.client.call<SceneItem[]>('createSceneItems').catch(() => [] as SceneItem[]),
    ]);
    void this.portals.load(items);
    for (const p of Object.values(peers)) this.addPlayer(p);
    this.view.apply(this.players.values(), this.self);
    for (const n of npcs) this.npcs.add(n);
    this.bosses.enter();
    this.chat.system(`Đã vào ${res.map.name} (map ${res.map.id}, ${res.map.width}×${res.map.height}, ${this.npcs.count} NPC)`);
    this.hud.setMap(res.map.name, res.map);
    this.updateHud();
    await this.bag.load().catch((e) => toast((e as Error).message, true)); // before the quests: collect progress counts the bag
    this.hud.bagLoaded();
    await this.quest.load().catch((e) => toast((e as Error).message, true));
  }

  private clearScene(): void {
    this.panels.closeAll();
    this.quest.closePanel();
    this.pendingGate = null;
    this.portals.clear();
    this.petLayer.clear();
    this.map?.destroy({ children: true });
    this.map = null;
    for (const e of this.players.values()) e.destroy({ children: true });
    this.npcs.clear();
    this.players.clear();
    this.self?.destroy({ children: true });
    this.self = null;
  }

  private addPlayer(data: SceneCharacter): void {
    if (!this.self || data.id === this.self.entityId) return;
    const existing = this.players.get(data.id);
    if (existing) {
      existing.teleport(data.posX, data.posY);
      this.party.track(data);
      return;
    }
    const e = new Entity(data.id, 'player', data.name, data.iconCode, data.resCode, data.posX, data.posY, data.posDir);
    this.players.set(data.id, e);
    this.social.bindPlayer(e, data.name);
    this.entityLayer.addChild(e);
    this.character.applyTitles(e, data);
    this.party.track(data);
    this.petLayer.fromScene(data);
    this.view.apply(this.players.values(), this.self);
  }

  private removePlayer(id: number): void {
    const e = this.players.get(id);
    if (!e) return;
    e.destroy({ children: true });
    this.players.delete(id);
  }

  private onRemoteMove(data: MoveUpdate): void {
    const e = this.players.get(data.id);
    if (!e) return;
    const route = data.route?.length ? data.route : [[data.x, data.y]];
    e.moveAlong(route);
  }

  private onTap(e: FederatedPointerEvent): void {
    if (!this.self || !this.mapInfo || this.chat.focused || this.battle.locked || this.party.blocked()) return;
    if (this.player.currentHp <= 0) return this.battle.deadWalk(); // M9: dead players get the relive question instead of walking
    this.npcs.cancelPending();
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
    if (!self || !this.mapInfo || this.chat.focused || this.battle.locked || this.party.blocked()) return;
    e.stopPropagation();
    this.npcs.cancelPending();
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

  private sendPosition(x: number, y: number, dir: number, route: number[][]): void {
    const now = performance.now();
    if (now - this.lastSent < MOVE_SEND_INTERVAL_MS) return;
    this.lastSent = now;
    void this.client.call('udcr', { x, y, dir, route }).catch(() => undefined);
  }

  private tick(dt: number): void {
    if (!this.self || !this.mapInfo) return;
    this.self.tick(dt);
    if (this.self.moving) this.battle.onWalking(this.self.x, this.self.y);
    this.battle.tick(dt);
    this.portals.tick(dt);
    this.hud.setPosition(this.self.x, this.self.y);
    this.panels.closeIfFar();
    for (const e of this.players.values()) e.tick(dt);
    this.npcs.tick(dt);
    this.petLayer.tick(dt);
    this.party.tick(dt);

    const scale = this.root.scale.x;
    const sw = this.app.screen.width / scale;
    const sh = this.app.screen.height / scale;
    const camX = this.view.camera(-this.world.x, this.self.x, sw, Math.max(0, this.mapInfo.width - sw));
    const camY = this.view.camera(-this.world.y, this.self.y, sh, Math.max(0, this.mapInfo.height - sh));
    this.world.position.set(-camX, -camY);
    this.map?.updateVisible(camX, camY, sw, sh);
  }

  private updateHud(): void {
    this.hud.setPlayer(this.player);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
