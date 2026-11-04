// The pet half of a round's command (legacy Battle.battleCmd batching + PetCmdCanvas): once the player chose, the pet menu
// (attack / skill / defence) opens and both commands go out together as battleUpdateCmd([ownerCmd, petCmd]). Pet slots are
// owner + 5; only the local player's own pet is commanded here (teammates' pets act on the server's fallback attack).

import {
  BattleAction, BattleParticipantType, skillMpCost, skillNoMpMessage, skillTargetsEnemy,
  type BattleCommand, type BattleStart, type LearnedSkill,
} from '@mc/shared';
import { PetCmdMenu } from '../../ui/petCmdMenu';
import { toast } from '../../ui/screens';
import type { BattleStage } from './BattleStage';
import { skillCmd } from './commands';

export interface PetStepHost {
  stage(): BattleStage | null;
  /** Sends the command batch (owner first). */
  transmit(cmds: BattleCommand[]): void;
  /** Hides the player's command column but keeps the round countdown running. */
  suspendMenu(): void;
}

export class PetStep {
  /** The local player's pet slot in this battle, -1 when it has none. */
  slot = -1;
  private name = '';
  private skills: readonly LearnedSkill[] = [];
  private menu: PetCmdMenu | null = null;
  private ownerCmd: BattleCommand | null = null;
  private pendingSkill: LearnedSkill | null = null;

  constructor(private readonly host: PetStepHost) {}

  /** Reads the player's pet out of the onBattleStart cList (type 39 whose cid is the player). */
  init(start: BattleStart, selfId: number): void {
    this.end();
    const pet = Object.values(start.cList).find((p) => p.type === BattleParticipantType.PET && p.cid === selfId);
    this.slot = pet?.battleId ?? -1;
    this.name = pet?.name ?? '';
    this.skills = pet?.skills ?? [];
  }

  /** The pet menu is up and a command is half built. */
  get active(): boolean {
    return this.menu !== null;
  }

  /** True when the pet can still be commanded (it exists and has HP). */
  canCommand(): boolean {
    return (this.host.stage()?.units.get(this.slot)?.hp ?? 0) > 0;
  }

  /** Called with the player's command: opens the pet step and returns true, or false when the command can go out alone. */
  begin(ownerCmd: BattleCommand): boolean {
    const stage = this.host.stage();
    if (!stage || !this.canCommand()) return false;
    this.end();
    this.ownerCmd = ownerCmd;
    this.host.suspendMenu();
    this.menu = new PetCmdMenu(
      {
        onAttackMode: () => {
          this.pendingSkill = null;
          stage.setPicking(true);
        },
        onDefend: () => this.finish({ tid: -1, action: BattleAction.DEFENCE, id: -1, level: -1 }),
        skills: () => this.skills,
        onSkill: (sk) => this.useSkill(sk),
      },
      this.name,
    );
    stage.setPicking(true);
    return true;
  }

  /** An enemy was clicked while the pet step is up. */
  onPick(slot: number): boolean {
    if (!this.menu) return false;
    const sk = this.pendingSkill;
    this.finish(sk ? skillCmd(sk, slot) : { tid: slot, action: BattleAction.ATTACK, id: 0, level: -1 });
    return true;
  }

  /** The round countdown ran out during the pet step: the player's command goes alone, the server's pet AI attacks. */
  timeout(): void {
    const cmd = this.ownerCmd;
    this.end();
    if (cmd) this.host.transmit([cmd]);
  }

  end(): void {
    this.menu?.destroy();
    this.menu = null;
    this.ownerCmd = null;
    this.pendingSkill = null;
  }

  private useSkill(sk: LearnedSkill): void {
    const stage = this.host.stage();
    const unit = stage?.units.get(this.slot);
    if (unit && skillMpCost(sk.useMp, unit.mpMax) > unit.mp) return void toast(skillNoMpMessage(sk.name), true);
    if (!skillTargetsEnemy(sk.type)) return this.finish(skillCmd(sk, this.slot));
    this.pendingSkill = sk;
    stage?.setPicking(true);
    toast(`Chọn mục tiêu cho [${sk.name}]`);
  }

  private finish(petCmd: BattleCommand): void {
    const cmd = this.ownerCmd;
    this.end();
    if (cmd) this.host.transmit([cmd, petCmd]);
  }
}
