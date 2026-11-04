// Client side of combat: sends cbom while walking, handles onSetCharState / onBattleStart / onBattlePlayList, runs the
// battle stage + command menu + playback, sends battleUpdateCmd / battlePlayEnd, and opens the revive dialog after a
// defeat (reliveSwitch). While a battle (or the revive dialog) is open `locked` is true and the scene ignores map input.

import type { Container } from 'pixi.js';
import {
  BattleAction, BattleParticipantType, BattleResult, catchFailText, isBattleSkill, skillMpCost, skillNoMpMessage, skillTargetsEnemy,
  type BagItem, type BattleCommand, type BattlePlayList, type BattleStart, type LearnedSkill, type PlayerData, type SetCharState,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { RpcClientError } from '../net/client';
import { BattleMenu } from '../ui/battleMenu';
import { askConfirm } from '../ui/confirmDialog';
import { toast } from '../ui/screens';
import { stageEl, stageSize } from '../ui/stage';
import { BattleStage } from './battle/BattleStage';
import { CatchMode } from './battle/catchMode';
import { reportText, skillCmd, tintWorld } from './battle/commands';
import { PetStep } from './battle/petStep';
import { playGroups, resetUnits, type PlaybackEnd } from './battle/playback';
import { ReviveFlow } from './battle/reviveFlow';
import { HP_POTION, MP_POTION } from './potions';

const CHECK_DISTANCE = 100; // PlayerView.CHECK_DIS
const CBOM_THROTTLE_MS = 1000; // RPCConfig RPC_DELAY["cbom"]
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
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class BattleController {
  private stage: BattleStage | null = null;
  private menu: BattleMenu | null = null;
  private active = false;
  private sending = false;
  private menuOpen = false;
  private mySlot = -1; // the local character's slot (10..14); teammates fill the other player slots
  private groupSize = 1; // player characters in this battle: > 1 shows wait icons and the teammates' commands
  private skills: LearnedSkill[] = []; // initLearnedSkill, reloaded at every battle start
  private pendingSkill: LearnedSkill | null = null; // chosen skill waiting for an enemy click
  private lastCheck = { x: 0, y: 0 };
  private pos = { x: 0, y: 0 }; // last walked position (the player object is not updated by moves)
  private lastCbom = -Infinity;
  private playbackStartedAt = -Infinity;
  private chain: Promise<void> = Promise.resolve();
  private readonly offs: (() => void)[] = [];
  private readonly pet = new PetStep({
    stage: () => this.stage,
    transmit: (cmds) => this.transmit(cmds),
    suspendMenu: () => this.menu?.suspend(),
  });
  private readonly catcher = new CatchMode({ stage: () => this.stage, player: () => this.host.player, send: (cmd) => this.send(cmd) });
  private readonly revive = new ReviveFlow(() => this.host.client);

  constructor(private readonly host: BattleHost) {
    const c = host.client;
    this.offs.push(
      c.on('onSetCharState', (d) => this.onCharState(d as SetCharState)),
      c.on('onBattleStart', (d) => this.onBattleStart(d as BattleStart)),
      c.on('onBattlePlayList', (d) => this.onPlayList(d as BattlePlayList)),
      c.on('onCmdReady', (slot) => this.stage?.clearWaitIcon(Number(slot))),
    );
  }

  /** True while the map must ignore clicks and walking (battle or revive dialog open). */
  get locked(): boolean {
    return this.active || this.revive.reviving;
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.revive.destroy();
    this.teardown();
  }

  /** New map or position: the walked-distance check starts from here. */
  setCheckPoint(x: number, y: number): void {
    this.lastCheck = { x, y };
  }

  /** Called every frame while the player walks: cbom once >= 100 px from the last check point, at most 1 per second. */
  onWalking(x: number, y: number): void {
    this.pos = { x, y };
    if (this.locked || this.host.mapSafe() || this.host.player.currentHp <= 0) return;
    if (Math.hypot(x - this.lastCheck.x, y - this.lastCheck.y) < CHECK_DISTANCE) return;
    const now = performance.now();
    if (now - this.lastCbom < CBOM_THROTTLE_MS) return;
    this.lastCbom = now;
    void this.host.client.call('cbom', Math.round(x), Math.round(y)).catch(() => undefined);
  }

  tick(dt: number): void {
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
    this.setCheckPoint(this.pos.x, this.pos.y);
    stageEl().classList.add('in-battle');
    tintWorld(this.host.world, d.bossFlag > 0);
    this.host.entities.visible = false;

    const chars = Object.values(d.cList).filter((p) => p.type === BattleParticipantType.CHARACTER);
    this.groupSize = chars.length;
    this.mySlot = chars.find((p) => p.id === this.host.player.id)?.battleId ?? -1;
    this.pet.init(d, this.host.player.id);
    const stage = new BattleStage(d, this.host.player.id);
    stage.onPick = (slot) => {
      if (this.pet.onPick(slot) || this.catcher.onPick(slot)) return;
      const sk = this.pendingSkill;
      this.send(sk ? skillCmd(sk, slot) : { tid: slot, action: BattleAction.ATTACK, id: 0, level: -1 });
    };
    this.pendingSkill = null;
    void this.loadSkills(stage);
    this.stage = stage;
    this.host.root.addChild(stage);
    const s = stageSize();
    stage.centerIn(s.width, s.height);

    this.menu = new BattleMenu({
      onAttackMode: () => {
        this.pendingSkill = null;
        this.catcher.cancel();
        this.stage?.setPicking(true);
      },
      onCatchMode: () => {
        this.pendingSkill = null;
        this.catcher.begin();
      },
      onDefend: () => this.send({ tid: -1, action: BattleAction.DEFENCE, id: -1, level: -1 }),
      onEscape: () => askConfirm('Xác nhận bỏ chạy?', () => this.send({ tid: -1, action: BattleAction.ESCAPE, id: 0, level: -1 })),
      skills: () => this.skills,
      onSkill: (sk) => this.useSkill(sk),
      onItem: (it) => this.send({ tid: this.mySlot, action: BattleAction.ITEM, id: it.id, level: -1 }),
      onTimeout: () => (this.pet.active ? this.pet.timeout() : this.send({ tid: -1, action: BattleAction.TIMEOUT, id: -1, level: -1 }, true)),
      potions: () => this.host.bagItems().filter((i) => HP_POTION[i.tid] !== undefined || MP_POTION[i.tid] !== undefined),
    });
    this.menu.showBanner('Bắt Đầu', START_DELAY_MS);
    const mine = stage;
    void sleep(START_DELAY_MS).then(() => {
      if (this.stage === mine && !this.sending) this.startRound();
    });
  }

  private async loadSkills(stage: BattleStage): Promise<void> {
    try {
      const list = await this.host.client.call<LearnedSkill[]>('initLearnedSkill');
      if (this.stage === stage) this.skills = list.filter((s) => isBattleSkill(s.type));
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  /** Kỹ năng menu pick: MP pre-check (Core.checkSkillRequire), then send at once (self skills) or wait for an enemy click. */
  private useSkill(sk: LearnedSkill): void {
    this.catcher.cancel();
    const unit = this.stage?.units.get(this.mySlot);
    if (unit && skillMpCost(sk.useMp, unit.mpMax) > unit.mp) {
      toast(skillNoMpMessage(sk.name), true);
      return;
    }
    if (!skillTargetsEnemy(sk.type)) {
      this.send(skillCmd(sk, this.mySlot));
      return;
    }
    this.pendingSkill = sk;
    this.stage?.setPicking(true);
    toast(`Chọn mục tiêu cho [${sk.name}]`);
  }

  private startRound(): void {
    if (this.groupSize > 1) this.stage?.showWaitIcons();
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
      try {
        await this.host.client.call('battleUpdateCmd', cmds);
      } catch (e) {
        this.sending = false;
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
    this.sending = false;
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
    toast(fallen && end.result === BattleResult.WIN ? 'Chiến thắng! Bạn đã gục nên không nhận thưởng' : reportText(end), end.result === BattleResult.LOSE, 4500);
    await this.host.client.call('battlePlayEnd').catch((e) => toast((e as Error).message, true));
    this.teardown();
    if (this.host.player.currentHp > 0) return;
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
