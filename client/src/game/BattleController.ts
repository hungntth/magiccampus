// Client side of combat: sends cbom while walking, handles onSetCharState / onBattleStart / onBattlePlayList, runs the
// battle stage + command menu + playback, sends battleUpdateCmd / battlePlayEnd, and opens the revive dialog after a
// defeat (reliveSwitch). While a battle (or the revive dialog) is open `locked` is true and the scene ignores map input.
// Auto battle (M9): with autoState.on every round's [char, pet] batch is chosen by battle/autoRound and sent at once.

import type { Container } from 'pixi.js';
import {
  BattleAction, BattleParticipantType, BattleResult, catchFailText, HOTBAR_TEXT, parseEp,
  type BagItem, type BattleCommand, type BattlePlayList, type BattleStart, type PlayerData, type SetCharState,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { RpcClientError } from '../net/client';
import { BattleMenu } from '../ui/battleMenu';
import { askConfirm } from '../ui/confirmDialog';
import { toast } from '../ui/screens';
import { stageEl, stageSize } from '../ui/stage';
import { BattleStage } from './battle/BattleStage';
import { autoRoundCommands } from './battle/autoRound';
import { autoState } from './battle/autoState';
import { CatchMode } from './battle/catchMode';
import { EncounterWalk } from './battle/encounterWalk';
import { reportText, tintWorld } from './battle/commands';
import { PetStep } from './battle/petStep';
import { playGroups, resetUnits, type PlaybackEnd } from './battle/playback';
import { ReviveFlow } from './battle/reviveFlow';
import { SkillPick } from './battle/skillPick';
import { WatchMode } from './battle/watchMode';
import { setHotbarBattle, type HotbarBattle } from './hotbarController';
import { HP_POTION, MP_POTION } from './potions';

const START_DELAY_MS = 2000; // BattleStage.START_DELAY
const SEND_DELAY_MS = 4000; // Battle.BATTLE_SEND_DELAY: earliest send after the previous playback started

export interface BattleHost {
  client: GameClient;
  player: PlayerData;
  /** Scaled scene root; the stage is added on top of the world. */
  root: Container;
  /** Tinted during the battle (the dimmed map is the backdrop). */
  world: Container;
  /** Map entities (players, NPCs) are hidden while the stage is up so they do not ghost behind the fighters. */
  entities: Container;
  bagItems(): BagItem[];
  /** Battle pet HP / MP for the HUD PetCanvas; no arguments = back to full after the battle. */
  petVitals(hp?: number, mp?: number): void;
  stopWalking(): void;
  mapSafe(): boolean;
  /** battlePlayEnd reply hook (M10 star report): true = a card was shown instead of the generic result toast */
  onEndReply?(reply: unknown): boolean;
  /** The battle is over and the player is alive and back on the map (resume an interrupted walk-up). */
  onBattleOver?(): void;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class BattleController implements HotbarBattle {
  private stage: BattleStage | null = null;
  private menu: BattleMenu | null = null;
  private active = false;
  private sending = false;
  private menuOpen = false;
  private mySlot = -1; // the local character's slot (10..14); teammates fill the other player slots
  private groupSize = 1; // player characters in this battle: > 1 shows wait icons and the teammates' commands
  private readonly picker = new SkillPick();
  private readonly walk = new EncounterWalk(() => this.host.client);
  private autoPaused = false; // an auto batch was refused: this round is manual
  private cancelSend = false; // "Kết thúc auto" while the auto batch still waits for the 4 s gate
  private playbackStartedAt = -Infinity;
  private chain: Promise<void> = Promise.resolve();
  private readonly offs: (() => void)[] = [];
  private readonly pet = new PetStep({
    stage: () => this.stage,
    transmit: (cmds) => this.transmit(cmds),
    suspendMenu: () => this.menu?.suspend(),
  });
  private readonly catcher = new CatchMode({ stage: () => this.stage, player: () => this.host.player, send: (cmd) => this.send(cmd) });
  private readonly revive = new ReviveFlow(() => this.host.client, () => this.host.bagItems());
  /** Spectating another player's battle (M9 phase H). */
  readonly watch: WatchMode;

  constructor(private readonly host: BattleHost) {
    this.watch = new WatchMode({
      client: host.client, root: host.root, world: host.world, entities: host.entities, stopWalking: () => host.stopWalking(),
      inBattle: () => this.active,
    });
    const c = host.client;
    this.offs.push(
      c.on('onSetCharState', (d) => this.onCharState(d as SetCharState)),
      c.on('onBattleStart', (d) => this.onBattleStart(d as BattleStart)),
      c.on('onBattlePlayList', (d) => this.onPlayList(d as BattlePlayList)),
      c.on('onCmdReady', (slot) => this.stage?.clearWaitIcon(Number(slot))),
      autoState.onChange((on) => void (on && this.menuOpen && !this.sending && this.runAuto())),
    );
    autoState.bind(host.player);
    setHotbarBattle(this);
  }

  /** Click-to-move while dead: the PLAYER_S[0] relive question instead of walking. */
  deadWalk(): void {
    this.revive.deadWalk();
  }

  get inBattle(): boolean {
    return this.active;
  }

  /** Hotbar (M9 phase C): a bag item or a skill as this round's command while the menu is up. */
  hotbarUse(kind: 'skill' | 'item', id: number, item?: BagItem): boolean {
    if (!this.active || !this.menuOpen || this.sending) return false;
    if (kind === 'item') {
      if (item) this.send({ tid: this.mySlot, action: BattleAction.ITEM, id: item.id, level: -1 });
      return item !== undefined;
    }
    if (this.pet.active) return this.pet.castById(id);
    const sk = this.picker.skills.find((s) => s.sid === id);
    if (!sk) toast(HOTBAR_TEXT.PET_MISSING, true); // not a character skill: a pet skill outside the pet step
    if (!sk) return true;
    this.catcher.cancel();
    this.picker.use(sk, this.stage, this.mySlot, (c) => this.send(c));
    return true;
  }

  /** True while the map must ignore clicks and walking (battle or revive dialog open). */
  get locked(): boolean {
    return this.active || this.revive.reviving || this.watch.active;
  }

  destroy(): void {
    for (const off of this.offs) off();
    setHotbarBattle(null);
    this.revive.destroy();
    this.watch.destroy();
    this.teardown();
  }

  /** New map or position: the walked-distance check starts from here. */
  setCheckPoint(x: number, y: number): void {
    this.walk.setCheckPoint(x, y);
  }

  /** Called every frame while the player walks (encounter check, see EncounterWalk). */
  onWalking(x: number, y: number): void {
    this.walk.onWalking(x, y, this.locked || this.host.mapSafe() || this.host.player.currentHp <= 0);
  }

  tick(dt: number): void {
    this.watch.tick(dt);
    if (!this.stage) return;
    this.stage.tick(dt);
    const s = stageSize();
    this.stage.centerIn(s.width, s.height);
  }

  private onCharState(d: SetCharState): void {
    if (d.cid === this.host.player.id) this.host.player.state = d.state;
  }

  private onBattleStart(d: BattleStart): void {
    this.teardown();
    this.active = true;
    this.sending = false;
    this.menuOpen = false;
    this.playbackStartedAt = -Infinity; // round 1 may be sent at once
    this.chain = Promise.resolve();
    this.host.stopWalking();
    this.setCheckPoint(this.walk.pos.x, this.walk.pos.y);
    this.autoPaused = false;
    stageEl().classList.add('in-battle');
    tintWorld(this.host.world, d.bossFlag > 0);
    this.host.entities.visible = false;

    const chars = Object.values(d.cList).filter((p) => p.type === BattleParticipantType.CHARACTER);
    this.groupSize = chars.length;
    this.mySlot = chars.find((p) => p.id === this.host.player.id)?.battleId ?? -1;
    this.pet.init(d, this.host.player.id);
    const stage = new BattleStage(d, this.host.player.id);
    stage.onPick = (slot) => {
      if (!this.pet.onPick(slot) && !this.catcher.onPick(slot)) this.send(this.picker.commandFor(slot));
    };
    void this.picker.load(this.host.client, () => this.stage === stage);
    this.stage = stage;
    this.host.root.addChild(stage);
    const s = stageSize();
    stage.centerIn(s.width, s.height);

    this.menu = new BattleMenu({
      onAttackMode: () => {
        this.picker.pending = null;
        this.catcher.cancel();
        this.stage?.setPicking(true);
      },
      onCatchMode: () => {
        this.picker.pending = null;
        this.catcher.begin();
      },
      onDefend: () => this.send({ tid: -1, action: BattleAction.DEFENCE, id: -1, level: -1 }),
      onEscape: () => askConfirm('Xác nhận bỏ chạy?', () => this.send({ tid: -1, action: BattleAction.ESCAPE, id: 0, level: -1 })),
      skills: () => this.picker.skills,
      onSkill: (sk) => {
        this.catcher.cancel();
        this.picker.use(sk, this.stage, this.mySlot, (cmd) => this.send(cmd));
      },
      onItem: (it) => this.send({ tid: this.mySlot, action: BattleAction.ITEM, id: it.id, level: -1 }),
      onTimeout: () => (this.pet.active ? this.pet.timeout() : this.send({ tid: -1, action: BattleAction.TIMEOUT, id: -1, level: -1 }, true)),
      potions: () => this.host.bagItems().filter((i) => HP_POTION[i.tid] !== undefined || MP_POTION[i.tid] !== undefined),
      onAuto: () => autoState.set(true),
    });
    this.menu.showBanner('Bắt Đầu', START_DELAY_MS);
    const mine = stage;
    void sleep(START_DELAY_MS).then(() => {
      if (this.stage === mine && !this.sending) this.startRound();
    });
  }

  /** Auto round: the banner replaces the command column and the batch goes out at once. False = nothing to send. */
  private runAuto(): boolean {
    const stage = this.stage;
    if (!stage || this.autoPaused) return false;
    const cmds = autoRoundCommands({
      stage, mySlot: this.mySlot, petSlot: this.pet.slot, skills: this.picker.skills, petSkills: this.pet.skills, bag: this.host.bagItems(),
    });
    if ((stage.units.get(this.mySlot)?.hp ?? 0) <= 0 && cmds.length < 2) return false;
    this.pet.end();
    this.catcher.cancel();
    this.menuOpen = true;
    this.menu?.showAutoBanner(() => this.stopAuto());
    this.transmit(cmds);
    return true;
  }

  private stopAuto(): void {
    autoState.set(false);
    this.menu?.hideAutoBanner();
    if (this.sending) this.cancelSend = true; // the batch has not left yet: this round becomes manual
  }

  private startRound(): void {
    if (this.groupSize > 1) this.stage?.showWaitIcons();
    if (autoState.on && this.runAuto()) return;
    this.menu?.hideAutoBanner();
    if ((this.stage?.units.get(this.mySlot)?.hp ?? 1) <= 0) {
      // Fallen: the pet (if alive) still gets its command, the player is auto-defended (Flash startNewRound); else just wait.
      this.menuOpen = true;
      this.menu?.show();
      if (this.pet.begin({ tid: -1, action: BattleAction.DEFENCE, id: -1, level: -1 })) return;
      this.menuOpen = false;
      this.menu?.hide('Đang chờ...');
      return;
    }
    this.menuOpen = true;
    this.menu?.show();
    this.stage?.setPicking(true);
  }

  /** The player's command: with a living pet the pet menu opens first (`alone` skips it); else it goes out at once. */
  private send(cmd: BattleCommand, alone = false): void {
    if (!this.active || !this.menuOpen || this.sending) return;
    this.catcher.cancel();
    if (!alone && this.pet.begin(cmd)) return;
    this.transmit([cmd]);
  }

  /** Sends [ownerCmd, petCmd?]; the reply is null, the result arrives as onBattlePlayList. Round sends wait >= 4 s after the last playback began. */
  private transmit(cmds: BattleCommand[]): void {
    if (!this.active || !this.menuOpen || this.sending) return;
    this.sending = true;
    this.menuOpen = false;
    this.menu?.hide('Đang chờ...');
    this.stage?.setPicking(false);
    this.stage?.clearWaitIcon(this.mySlot);
    void (async () => {
      await sleep(Math.max(0, this.playbackStartedAt + SEND_DELAY_MS - performance.now()));
      if (this.cancelSend) {
        this.cancelSend = this.sending = false;
        if (this.active) this.startRound();
        return;
      }
      try {
        await this.host.client.call('battleUpdateCmd', cmds);
      } catch (e) {
        this.sending = false;
        this.autoPaused = autoState.on;
        toast((e as Error).message, true);
        if (!this.active) return;
        if ((e as RpcClientError).code === 'NOT_FOUND') this.abort();
        else this.startRound();
      }
    })();
  }

  private onPlayList(groups: BattlePlayList): void {
    const stage = this.stage;
    if (!stage) return;
    this.sending = this.cancelSend = this.autoPaused = false;
    this.menu?.hide();
    stage.clearWaitIcon();
    this.chain = this.chain.then(async () => {
      if (this.stage !== stage) return;
      this.playbackStartedAt = performance.now();
      const end = await playGroups(stage, groups, {
        banner: (t) => this.menu?.showBanner(t, 1000),
        unit: (u) => u.slot === this.pet.slot && this.host.petVitals(u.hp, u.mp),
        catchFailed: (f) => f.cid === this.host.player.id && toast(catchFailText(f), true),
      });
      if (this.stage !== stage) return;
      if (end) await this.finish(end);
      else {
        resetUnits(stage);
        this.startRound();
      }
    });
  }

  /** The end marker was played: report, battlePlayEnd, back to the map, then the revive check. */
  private async finish(end: PlaybackEnd): Promise<void> {
    this.menu?.hide();
    const fallen = this.groupSize > 1 && (this.stage?.units.get(this.mySlot)?.hp ?? 1) <= 0;
    const reply = await this.host.client.call('battlePlayEnd').catch((e) => { toast((e as Error).message, true); return null; });
    // M10: a feature reply (star report card) replaces the generic result toast
    if (!this.host.onEndReply?.(reply)) toast(fallen && end.result === BattleResult.WIN ? 'Chiến thắng! Bạn đã gục nên không nhận thưởng' : reportText(end), end.result === BattleResult.LOSE, 4500);
    // BattleStage.as:1605: refill from the Túi cứu thương after every battle when a pool has something (silent on failure).
    if (parseEp(this.host.player.ep).some((v) => v > 0)) void this.host.client.call('useBloodBag').catch(() => undefined);
    this.teardown();
    if (this.host.player.currentHp > 0) return this.host.onBattleOver?.();
    await this.revive.run();
  }

  /** The server no longer knows the battle: drop the UI. */
  private abort(): void {
    this.teardown();
  }

  private teardown(): void {
    this.pet.end();
    this.catcher.cancel();
    this.host.petVitals();
    this.menu?.destroy();
    this.menu = null;
    this.stage?.destroy({ children: true });
    this.stage = null;
    this.active = false;
    this.menuOpen = false;
    this.host.world.filters = [];
    this.host.entities.visible = true;
    stageEl().classList.remove('in-battle');
  }
}
