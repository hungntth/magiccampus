// Magic weapon RPCs (Flash / Go names, none quiet): mWeaponUpgrade, getSpiritRequire, magicWeaponRepair / AutoRepair / AllRepair,
// magicWeaponResolve, MWTrans, queryMWResetPropMax, magicWeaponResetProp, getMWSkills, magicWeaponResetSkill, showMWInfo,
// activateMWPro and the H5 read getMWPanel. magicWeaponStage and succinctMW / onSureSuccinctMW are deferred. Pushes (self):
// stone stacks, the item (onAddCharactorSlot / onDelCharactorSlot), onUPP wallet + stats, updateMWResetView, onAddItem.
// A refusal shows onSystemMidMsgOrNote and answers the legacy failure shape.

import { Injectable } from '@nestjs/common';
import type {
  MWActivateReply, MWInfoReply, MWPanelInfo, MWRepairReply, MWResetMaxReply, MWResetPropReply, MWResetSkillReply, MWResolveReply,
  MWSkills, MWSpiritRequire, MWTransReply, MWUpgradeReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { guarded, idArg } from '../forge/forge-guard';
import { sendPushes } from '../inventory/pushes';
import { MagicWeaponService, type MwResult } from './magicweapon.service';
import { MwOpsService } from './mw-ops.service';
import { MwRepairService } from './mw-repair.service';

const idList = (v: unknown, name: string): number[] => {
  if (!Array.isArray(v) || v.length === 0 || v.length > 20) throw RpcException.invalidArgs(name);
  return v.map((x) => idArg(x, name));
};

@Injectable()
export class MagicWeaponRpc {
  constructor(
    private readonly weapons: MagicWeaponService,
    private readonly repairs: MwRepairService,
    private readonly ops: MwOpsService,
  ) {}

  @Rpc('mWeaponUpgrade', { requireCharacter: true, forbidInBattle: true })
  mWeaponUpgrade(session: Session, args: unknown[]): Promise<MWUpgradeReply> {
    const id = idArg(args[0], 'equipId');
    return this.send(session, { succ: false, failType: 1, msg: 'Thăng cấp thất bại.' }, () => this.weapons.upgrade(session.characterId!, id));
  }

  @Rpc('getSpiritRequire', { requireCharacter: true })
  getSpiritRequire(session: Session, args: unknown[]): Promise<MWSpiritRequire> {
    const id = idArg(args[0], 'equipId');
    return guarded(session, { value: 0 }, () => this.weapons.spiritRequire(session.characterId!, id));
  }

  /** H5 read: every number the operation tabs show for one weapon. */
  @Rpc('getMWPanel', { requireCharacter: true })
  getMWPanel(session: Session, args: unknown[]): Promise<MWPanelInfo> {
    return this.weapons.panel(session.characterId!, idArg(args[0], 'equipId'));
  }

  /** `magicWeaponRepair(equipId, stoneItemId)`: the stone argument is only validated, stones are taken from any stack. */
  @Rpc('magicWeaponRepair', { requireCharacter: true, forbidInBattle: true })
  magicWeaponRepair(session: Session, args: unknown[]): Promise<MWRepairReply> {
    const id = idArg(args[0], 'equipId');
    idArg(args[1], 'stoneId');
    return this.send(session, { succ: false, num: 0 }, () => this.repairs.repair(session.characterId!, [id]));
  }

  @Rpc('magicWeaponAutoRepair', { requireCharacter: true, forbidInBattle: true })
  async magicWeaponAutoRepair(session: Session, args: unknown[]): Promise<null> {
    const id = idArg(args[0], 'equipId');
    await this.send(session, null, () => this.repairs.repair(session.characterId!, [id]));
    return null;
  }

  @Rpc('magicWeaponAllRepair', { requireCharacter: true, forbidInBattle: true })
  async magicWeaponAllRepair(session: Session, args: unknown[]): Promise<null> {
    const ids = idList(args[0], 'equipIds');
    await this.send(session, null, () => this.repairs.repair(session.characterId!, ids));
    return null;
  }

  /** `magicWeaponResolve(equipId, md5pass, type)`: the password is ignored (no secondary password in H5). */
  @Rpc('magicWeaponResolve', { requireCharacter: true, forbidInBattle: true })
  magicWeaponResolve(session: Session, args: unknown[]): Promise<MWResolveReply> {
    const id = idArg(args[0], 'equipId');
    const fail: MWResolveReply = { succ: false, type: 0, giid: 0, stackNum: 0, temp_quality: 0 };
    return this.send(session, fail, () => this.ops.resolve(session.characterId!, id));
  }

  /** `MWTrans(fromId, toId, stoneId, md5pass)`. */
  @Rpc('MWTrans', { requireCharacter: true, forbidInBattle: true })
  MWTrans(session: Session, args: unknown[]): Promise<MWTransReply> {
    const from = idArg(args[0], 'fromId');
    const to = idArg(args[1], 'toId');
    return this.send(session, { succ: false, msg: 'Chuyển thuộc tính thất bại.', num: 0 }, () => this.ops.trans(session.characterId!, from, to));
  }

  @Rpc('queryMWResetPropMax', { requireCharacter: true })
  queryMWResetPropMax(session: Session, args: unknown[]): Promise<MWResetMaxReply> {
    const id = idArg(args[0], 'equipId');
    return guarded(session, { succ: false, maxMainPropNum1: 0, maxMainPropNum2: 0 }, () => this.ops.resetMaxOf(session.characterId!, id));
  }

  /** Single phase: rolls and commits (the client has no apply step); `updateMWResetView` repaints the open tab. */
  @Rpc('magicWeaponResetProp', { requireCharacter: true, forbidInBattle: true })
  magicWeaponResetProp(session: Session, args: unknown[]): Promise<MWResetPropReply> {
    const id = idArg(args[0], 'equipId');
    idArg(args[1], 'stoneId');
    return this.send(session, { succ: false, num: 0 }, () => this.ops.resetProp(session.characterId!, id));
  }

  @Rpc('getMWSkills', { requireCharacter: true })
  getMWSkills(session: Session, args: unknown[]): Promise<MWSkills> {
    const id = idArg(args[0], 'equipId');
    return guarded(session, {}, () => this.ops.skillsOf(session.characterId!, id));
  }

  @Rpc('magicWeaponResetSkill', { requireCharacter: true, forbidInBattle: true })
  magicWeaponResetSkill(session: Session, args: unknown[]): Promise<MWResetSkillReply> {
    const id = idArg(args[0], 'equipId');
    idArg(args[1], 'stoneId');
    const position = Number(args[2]);
    return this.send(session, { succ: false, num: 0, sid: 0 }, () => this.ops.resetSkill(session.characterId!, id, position));
  }

  @Rpc('showMWInfo', { requireCharacter: true })
  showMWInfo(session: Session, args: unknown[]): Promise<MWInfoReply> {
    const id = idArg(args[0], 'equipId');
    return guarded(session, { flag: {} }, () => this.ops.infoOf(session.characterId!, id));
  }

  @Rpc('activateMWPro', { requireCharacter: true, forbidInBattle: true })
  activateMWPro(session: Session, args: unknown[]): Promise<MWActivateReply> {
    const id = idArg(args[0], 'equipId');
    const index = Number(args[1]);
    if (!Number.isInteger(index)) throw RpcException.invalidArgs('index');
    return this.send(session, { f: true, index }, () => this.ops.activate(session.characterId!, id, index));
  }

  private send<R>(session: Session, fail: R, op: () => Promise<MwResult<unknown>>): Promise<R> {
    return guarded(session, fail, async () => {
      const r = await op();
      sendPushes(session, r.pushes);
      return r.reply as R;
    });
  }
}
