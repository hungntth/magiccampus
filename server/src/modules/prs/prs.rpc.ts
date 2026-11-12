// Chân Hồn Thần Thú RPCs (legacy PRSPanel / PRSShowCvs / PRSSlot / PRSSlotItem, Flash names; the first arg is the cid the Flash client sends, the
// session decides): initPRSPanel -> panel; addSoulTreeLvl, replacePRSShow, cancelPRSShow, activePRSShow, activePRSShowSpe, movePRSChip, exchangePRSChip,
// updateActivePRSShow, freePRSCollect, goldPRSCollect, goldPRSCollectThree, swapPRSChip, swapPRSChipTimes -> null + pushes updatePRSPanel /
// updatePRSChipBag / updatePRSExcBag / onReplacePRSShow (map) / onGetPRSChip (+ onAddMoney, onUPP, onRefreshPetProp). A refusal shows onSystemMidMsgOrNote.

import { Injectable } from '@nestjs/common';
import type { PrsPanel } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { PrsCollectService } from './prs-collect.service';
import { PrsService } from './prs.service';

function intArg(v: unknown, name: string): number {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || !Number.isInteger(n)) throw RpcException.invalidArgs(name);
  return n;
}

const MUTATE = { requireAuth: true, requireCharacter: true, forbidInBattle: true } as const;

@Injectable()
export class PrsRpc {
  constructor(private readonly prs: PrsService, private readonly collects: PrsCollectService) {}

  @Rpc('initPRSPanel', { requireAuth: true, requireCharacter: true })
  initPanel(session: Session): Promise<PrsPanel> {
    return this.prs.init(session);
  }

  @Rpc('addSoulTreeLvl', MUTATE)
  addSoulTreeLvl(session: Session): Promise<null> {
    return midNoteOnFail(session, () => this.prs.treeUp(session));
  }

  @Rpc('replacePRSShow', MUTATE)
  replacePRSShow(session: Session, args: unknown[]): Promise<null> {
    const showId = intArg(args[1], 'showId');
    return midNoteOnFail(session, () => this.prs.replace(session, showId));
  }

  @Rpc('cancelPRSShow', MUTATE)
  cancelPRSShow(session: Session): Promise<null> {
    return midNoteOnFail(session, () => this.prs.replace(session, null));
  }

  @Rpc('activePRSShow', MUTATE)
  activePRSShow(session: Session, args: unknown[]): Promise<null> {
    const showId = intArg(args[1], 'showId');
    return midNoteOnFail(session, () => this.prs.activate(session, showId));
  }

  @Rpc('activePRSShowSpe', MUTATE)
  activePRSShowSpe(session: Session, args: unknown[]): Promise<null> {
    const showId = intArg(args[1], 'showId');
    return midNoteOnFail(session, () => this.prs.activateSpe(session, showId));
  }

  @Rpc('movePRSChip', MUTATE)
  movePRSChip(session: Session, args: unknown[]): Promise<null> {
    const from = intArg(args[1], 'fromPos');
    const to = intArg(args[2], 'toPos');
    const direction = intArg(args[3], 'direction');
    return midNoteOnFail(session, () => this.prs.move(session, from, to, direction));
  }

  @Rpc('exchangePRSChip', MUTATE)
  exchangePRSChip(session: Session, args: unknown[]): Promise<null> {
    const chipId = intArg(args[1], 'chipId');
    return midNoteOnFail(session, () => this.prs.exchange(session, chipId));
  }

  /** updateActivePRSShow({showId: showId}) - the expired list is only the trigger; the server clock prunes. */
  @Rpc('updateActivePRSShow', MUTATE)
  updateActivePRSShow(session: Session, args: unknown[]): Promise<null> {
    const raw = args[0];
    if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) throw RpcException.invalidArgs('expired');
    return this.prs.updateActive(session);
  }

  @Rpc('freePRSCollect', MUTATE)
  freePRSCollect(session: Session): Promise<null> {
    return midNoteOnFail(session, () => this.collects.collect(session, 'free'));
  }

  @Rpc('goldPRSCollect', MUTATE)
  goldPRSCollect(session: Session): Promise<null> {
    return midNoteOnFail(session, () => this.collects.collect(session, 'gold'));
  }

  @Rpc('goldPRSCollectThree', MUTATE)
  goldPRSCollectThree(session: Session): Promise<null> {
    return midNoteOnFail(session, () => this.collects.collect(session, 'six'));
  }

  @Rpc('swapPRSChip', MUTATE)
  swapPRSChip(session: Session): Promise<null> {
    return midNoteOnFail(session, () => this.collects.swap(session, false));
  }

  @Rpc('swapPRSChipTimes', MUTATE)
  swapPRSChipTimes(session: Session): Promise<null> {
    return midNoteOnFail(session, () => this.collects.swap(session, true));
  }
}
