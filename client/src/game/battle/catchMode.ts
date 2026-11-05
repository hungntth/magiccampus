// "Bắt" (legacy ST_BATTLE_CATCH): the next enemy click sends the catch command -70 (BattleCreatureView.mouseDownHandler). The
// client gates "Pet đã đầy!" (pets >= petMaxNum) and "Pet cao hơn bạn 5 cấp" (target level - 5 >= player level); the server
// owns catchable and the success roll. The result arrives as a catchF step (failure text) or onAddPet after battlePlayEnd.

import { BattleAction, catchClientBlocker, type BattleCommand, type PlayerData } from '@mc/shared';
import { toast } from '../../ui/screens';
import type { BattleStage } from './BattleStage';

export interface CatchHost {
  stage(): BattleStage | null;
  player(): PlayerData;
  /** Sends the player's command (goes through the pet step when a pet is fighting). */
  send(cmd: BattleCommand): void;
}

export class CatchMode {
  private on = false;

  constructor(private readonly host: CatchHost) {}

  get active(): boolean {
    return this.on;
  }

  /** The Bắt button: enemies become pickable for a catch. */
  begin(): void {
    this.on = true;
    this.host.stage()?.setPicking(true);
    toast('Chọn pet cần bắt');
  }

  cancel(): void {
    this.on = false;
  }

  /** An enemy was clicked; true when the click belonged to catch mode (even when a gate refused it). */
  onPick(slot: number): boolean {
    if (!this.on) return false;
    const unit = this.host.stage()?.units.get(slot);
    if (!unit) return true;
    const p = this.host.player();
    const why = catchClientBlocker(Object.keys(p.petList).length, p.petMaxNum, unit.level, p.level, unit.refId);
    if (why) {
      toast(why, true);
      return true;
    }
    this.on = false;
    this.host.send({ tid: slot, action: BattleAction.CATCH, id: 0, level: -1 });
    return true;
  }
}
