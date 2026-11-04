// Client side of combat: sends cbom while walking, handles onSetCharState / onBattleStart / onBattlePlayList, runs the
// battle stage + command menu + playback, sends battleUpdateCmd / battlePlayEnd, and opens the revive dialog after a
// defeat (reliveSwitch). While a battle (or the revive dialog) is open `locked` is true and the scene ignores map input.

import { ColorMatrixFilter, type Container } from 'pixi.js';
import {
  BattleAction, BattleParticipantType, BattleResult, isBattleSkill, skillMpCost, skillNoMpMessage, skillTargetsEnemy,
  type BagItem, type BattleCommand, type BattlePlayList, type BattleStart, type LearnedSkill, type PlayerData,
  type ReliveSwitchResult, type SetCharState,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { RpcClientError } from '../net/client';
import { BattleMenu } from '../ui/battleMenu';
import { askConfirm } from '../ui/confirmDialog';
import { showReviveDialog } from '../ui/reviveDialog';
import { toast } from '../ui/screens';
import { stageEl, stageSize } from '../ui/stage';
import { BattleStage } from './battle/BattleStage';
import { playGroups, resetUnits, type PlaybackEnd } from './battle/playback';
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
  stopWalking(): void;
  mapSafe(): boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class BattleController {
  private stage: BattleStage | null = null;
  private menu: BattleMenu | null = null;
  private active = false;
  private reviving = false;
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
  private reviveClose: (() => void) | null = null;
  private readonly offs: (() => void)[] = [];

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
    return this.active || this.reviving;
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.reviveClose?.();
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
    this.tintWorld(d.bossFlag > 0);
    this.host.entities.visible = false;

    const chars = Object.values(d.cList).filter((p) => p.type === BattleParticipantType.CHARACTER);
    this.groupSize = chars.length;
    this.mySlot = chars.find((p) => p.id === this.host.player.id)?.battleId ?? -1;
    const stage = new BattleStage(d, this.host.player.id);
    stage.onPick = (slot) => {
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
        this.stage?.setPicking(true);
      },
      onDefend: () => this.send({ tid: -1, action: BattleAction.DEFENCE, id: -1, level: -1 }),
      onEscape: () => askConfirm('Xác nhận bỏ chạy?', () => this.send({ tid: -1, action: BattleAction.ESCAPE, id: 0, level: -1 })),
      skills: () => this.skills,
      onSkill: (sk) => this.useSkill(sk),
      onItem: (it) => this.send({ tid: this.mySlot, action: BattleAction.ITEM, id: it.id, level: -1 }),
      onTimeout: () => this.send({ tid: -1, action: BattleAction.TIMEOUT, id: -1, level: -1 }),
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
      // Fallen in a group battle: no command UI, just wait for the others to finish the fight.
      this.menu?.hide('Đang chờ...');
      return;
    }
    this.menuOpen = true;
    this.menu?.show();
    this.stage?.setPicking(true);
  }

  /** Sends one command; the reply is null, the result arrives as onBattlePlayList. Round sends wait >= 4 s after the last playback began. */
  private send(cmd: BattleCommand): void {
    if (!this.active || !this.menuOpen || this.sending) return;
    this.sending = true;
    this.menuOpen = false;
    this.menu?.hide('Đang chờ...');
    this.stage?.setPicking(false);
    this.stage?.clearWaitIcon(this.mySlot);
    void (async () => {
      await sleep(Math.max(0, this.playbackStartedAt + SEND_DELAY_MS - performance.now()));
      try {
        await this.host.client.call('battleUpdateCmd', [cmd]);
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
      const end = await playGroups(stage, groups, { banner: (t) => this.menu?.showBanner(t, 1000) });
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
    this.reviving = true;
    try {
      const res = await this.host.client.call<ReliveSwitchResult>('reliveSwitch');
      if (res !== 2) {
        this.reviving = false;
        return;
      }
      this.reviveClose = showReviveDialog({
        onHere: () => this.relive(1),
        onSafe: () => this.relive(2),
      });
    } catch (e) {
      this.reviving = false;
      toast((e as Error).message, true);
    }
  }

  private relive(mode: 1 | 2): void {
    this.reviveClose = null;
    void this.host.client
      .call('freeRelive', mode)
      .catch((e) => toast((e as Error).message, true))
      .finally(() => {
        this.reviving = false;
      });
  }

  /** The server no longer knows the battle: drop the UI. */
  private abort(): void {
    this.teardown();
  }

  private teardown(): void {
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

  /** BattleStage.as ColorTransform: normal (1, 1.1, 1), boss (1.1, 1, 1). */
  private tintWorld(boss: boolean): void {
    const f = new ColorMatrixFilter();
    const [r, g, b] = boss ? [1.1, 1, 1] : [1, 1.1, 1];
    f.matrix = [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];
    this.host.world.filters = [f];
  }
}

const skillCmd = (sk: LearnedSkill, tid: number): BattleCommand => ({ tid, action: BattleAction.SKILL, id: sk.sid, level: sk.level });

function reportText(end: PlaybackEnd): string {
  if (end.result === BattleResult.FLED) return 'Bỏ chạy thành công';
  if (end.result !== BattleResult.WIN) return 'Bạn đã bị đánh bại';
  const r = end.report;
  const parts = [`${r?.exp ?? 0} Exp`, `${r?.money ?? 0} Bạc khóa`, ...(r?.items ?? []).map((i) => `${i.name} x${i.count}`)];
  return `Chiến thắng! Nhận ${parts.join(', ')}`;
}
