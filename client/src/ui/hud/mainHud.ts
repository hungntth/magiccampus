// In-game HUD (legacy MainLayer): portraits, minimap strip, buff bar, menu bar and shortcut bar. Chat is ChatBox (ui/chat.ts).
// Call loadSkins() once before constructing it.

import type { BagItem, MapInfo, PetView, PlayerData } from '@mc/shared';
import { AutoBattlePanel } from '../autoBattlePanel';
import { HelpPanel } from '../helpPanel';
import { SystemSettingsPanel } from '../systemSettingsPanel';
import { LocalMapPanel, type LocalMapSource } from '../worldMap/localMapPanel';
import { WorldMapPanel } from '../worldMap/worldMapPanel';
import { SkillPanel } from '../skillPanel';
import { BloodBagPanel } from '../bloodBagPanel';
import { HotbarController } from '../../game/hotbarController';
import type { GameClient } from '../../net/client';
import { BuffBar } from './buffBar';
import { MiniMapCanvas } from './miniMap';
import { PetCanvas } from './petCanvas';
import { PortraitCanvas } from './portrait';
import { SystemBar } from './systemBar';
import { UserBar } from './userBar';
import './hud.css';

export interface HudActions {
  onBag(): void;
  onCharacter(): void;
  onFriend(): void;
  /** E key / HUD union button (guild window). */
  onGuild(): void;
  /** HUD "Shop" button (mall). */
  onShop(): void;
  /** HUD red function column "Chế tạo" (forge window). */
  onForge(tab?: string): void;
  /** HUD btnRank (ranking window, legacy PANEL_ACTIVE). */
  onRank(): void;
  /** HUD red function column "Ủy thác" (offline exp window). */
  onOffline(): void;
  /** R key / HUD achievement button (achievement window). */
  onAchieve(): void;
  /** HUD "Hoạt động hằng ngày" button (diary window). */
  onDaily(): void;
  /** HUD VIP button (VIP window). */
  onVip(): void;
  /** A key / HUD PK button: arms the PK click mode. */
  onPk(): void;
  /** W key / HUD pet button / pet icon. */
  onPet(): void;
  /** Q key / bottom task icon: quest manager window. */
  onQuest(): void;
  onLevelUp(): void;
  /** HP / MP bar click. */
  onRecover(kind: 'hp' | 'mp'): void;
  /** Bag contents (the auto-battle panel's potion choices, hotbar counts). */
  bagItems(): BagItem[];
  /** Map-side use of a bag item (hotbar item slots). */
  useBagItem(item: BagItem): void;
  /** Portrait / pet heal buttons: open the blood bag window on pool 1..4. */
  onBloodBag(bt: number): void;
  /** System settings saved (hc / hn / ac / maxView changed). */
  onViewChanged(): void;
  /** HUD red function column "Đấu Pet" (arena window). */
  onArena(): void;
  /** HUD red function column "Điêu Khắc" (Không Gian Điêu Khắc window). */
  onPpve(): void;
  /** Minimap red column "Bay / Xuống" button and the F key (flying toggle). */
  onFly(): void;
  /** World map pin: scroll / gold transport. */
  travel(mapId: number, group: boolean): void;
  /** Area map (M key / Earth button): current map, NPCs, gates and walking. */
  localMap: LocalMapSource;
}

export class MainHud {
  private readonly portrait: PortraitCanvas;
  private readonly miniMap: MiniMapCanvas;
  private readonly systemBar: SystemBar;
  private readonly buffBar: BuffBar;
  private readonly petCanvas: PetCanvas;
  private pkInit = false;
  private player: PlayerData | null = null;
  readonly skills: SkillPanel;
  private readonly hotbar: HotbarController;
  readonly bloodBag: BloodBagPanel;
  private readonly panels: { settings: SystemSettingsPanel; localMap: LocalMapPanel; worldMap: WorldMapPanel; help: HelpPanel };

  constructor(parent: HTMLElement, client: GameClient, typing: () => boolean, actions: HudActions) {
    this.portrait = new PortraitCanvas(parent, actions);
    this.bloodBag = new BloodBagPanel(client, () => this.player?.ep);
    this.petCanvas = new PetCanvas(parent, actions.onPet, (bt) => actions.onBloodBag(bt), actions.onBag);
    this.buffBar = new BuffBar(parent, client);
    const autoPanel = new AutoBattlePanel({ client, bagItems: () => actions.bagItems() });
    const worldMap = new WorldMapPanel({ client, level: () => this.player?.level ?? 1, travel: (id, group) => actions.travel(id, group) });
    this.panels = {
      settings: new SystemSettingsPanel({
        client, player: () => this.player, onApplied: () => actions.onViewChanged(), onAutoBattle: () => autoPanel.toggle(),
      }),
      localMap: new LocalMapPanel(actions.localMap, () => worldMap.show()),
      worldMap,
      help: new HelpPanel(client),
    };
    const tray = {
      settings: () => this.panels.settings.toggle(), worldMap: () => this.panels.localMap.toggle(), help: () => this.panels.help.toggle(),
      arena: () => actions.onArena(), ppve: () => actions.onPpve(), fly: () => actions.onFly(),
    };
    this.miniMap = new MiniMapCanvas(parent, client, actions.onShop, actions.onForge, actions.onRank, actions.onOffline,
      () => autoPanel.toggle(), tray);
    this.hotbar = new HotbarController({
      client, player: () => this.player, bagItems: () => actions.bagItems(), useBagItem: (it) => actions.useBagItem(it),
    });
    new UserBar(parent, this.hotbar);
    const digits: Record<string, () => void> = {};
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].forEach((d, i) => (digits[d] = () => this.hotbar.key(i + 1)));
    this.skills = new SkillPanel({ client, player: () => this.player, bagItems: () => actions.bagItems() });
    this.systemBar = new SystemBar(parent, typing, {
      b: actions.onBag, c: actions.onCharacter, k: actions.onFriend, w: actions.onPet, q: actions.onQuest, e: actions.onGuild, a: actions.onPk, r: actions.onAchieve,
      s: () => this.skills.toggle(), p: tray.settings, m: tray.worldMap, h: tray.help, f: tray.fly, ...digits,
    }, actions.onDaily);
  }

  destroy(): void {
    this.miniMap.destroy();
    this.systemBar.destroy();
    for (const p of Object.values(this.panels)) p.close();
    this.buffBar.destroy();
    this.skills.destroy();
    this.hotbar.destroy();
  }

  bagLoaded(): void {
    this.hotbar.refresh();
  }

  setPlayer(p: PlayerData): void {
    if (!this.player) void this.hotbar.loadSkills();
    this.player = p;
    this.portrait.update(p);
    this.petCanvas.setEp(p.ep);
    this.bloodBag.refresh();
    if (!this.pkInit) {
      this.pkInit = true;
      this.miniMap.initPk(p.apvp === true); // the login payload carries the saved opt-in
    }
  }

  /** Fly button label: "Xuống" while airborne, else "Bay". */
  setFlyLabel(flying: boolean): void {
    this.miniMap.setFlying(flying);
  }

  setBattlePet(p: PetView | null): void {
    this.petCanvas.setPet(p);
  }

  setMap(name: string, info?: MapInfo): void {
    this.miniMap.setMap(name, info);
    this.panels.localMap.refresh();
  }

  setPosition(x: number, y: number): void {
    this.miniMap.setPosition(x, y);
  }
}
