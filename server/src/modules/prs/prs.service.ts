// Chân Hồn Thần Thú service (Go application/prs service.go + forms.go): panel, soul tree, forms, chip moves and the crystal exchange. State = feature
// `prs`. Every call runs under withCharLock: load (expired timed forms pruned) -> pure plan -> conditional spend (realSoulStone 226 / realSoulCrystal 227 /
// bag items) -> write (currency refunded on a failed write) -> pushes. Stat changes push onRefreshPetProp for the battle pet; the equipped form is broadcast
// to the map (onReplacePRSShow) and redraws the following pet.

import { Injectable } from '@nestjs/common';
import { PRS, PRS_TEXT, type CurrencyKey, type PrsPanel } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { PetFollowService } from '../pet/pet-follow.service';
import { CurrencyService } from '../progression/currency.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { PrsPetService } from './prs-pets.service';
import { isError, planActivate, planActivateSpe, planCancel, planExchange, planMove, planReplace, planTreeUp, pruneExpired, type Plan } from './prs-rules';
import { PRS_FEATURE_KEY, encodePrs, panelOf, type PrsState } from './prs-state';

export const refuse = (note: string): never => {
  throw RpcException.forbidden(note);
};

/** The plan's state, or a refusal with its error text. */
export function unwrap<T>(p: Plan<T>): Exclude<Plan<T>, { error: string }> {
  if (isError(p)) return refuse(p.error);
  return p as Exclude<Plan<T>, { error: string }>;
}

@Injectable()
export class PrsService {
  constructor(
    private readonly store: FeatureStoreService,
    private readonly gameData: GameDataService,
    private readonly currencies: CurrencyService,
    private readonly inventory: InventoryService,
    private readonly scenes: SceneManager,
    private readonly pets: PrsPetService,
    private readonly follow: PetFollowService,
  ) {}

  now(): number {
    return this.pets.now();
  }

  /** Current state with expired timed forms dropped (written back, and the look re-broadcast when the equipped one expired). The caller holds the lock. */
  async loadLive(session: Session): Promise<PrsState> {
    const cid = session.characterId!;
    const { state, changed, unequipped } = pruneExpired(await this.pets.load(cid), this.now());
    if (changed) await this.save(cid, state);
    if (unequipped) await this.broadcastLook(session, 0);
    return state;
  }

  save(cid: number, state: PrsState): Promise<void> {
    return this.store.put(cid, PRS_FEATURE_KEY, encodePrs(state));
  }

  /** Conditional spend of a special currency; refuses with `note` when short. Returns the balance left. */
  async spend(cid: number, key: CurrencyKey, cost: number, note: string): Promise<number> {
    if (cost <= 0) return this.currencies.balance(cid, key);
    const left = await this.currencies.spend(cid, key, cost);
    return left === null ? refuse(note) : left;
  }

  /** Writes `state`, crediting `cost` of `key` back when the write fails. */
  async saveOrRefund(cid: number, state: PrsState, key: CurrencyKey | null, cost: number): Promise<void> {
    try {
      await this.save(cid, state);
    } catch (e) {
      if (key && cost > 0) await this.currencies.credit(cid, key, cost);
      throw e;
    }
  }

  /** onAddMoney(cid, key, delta, total) then onUPP {currencies}. */
  async pushMoney(session: Session, moves: readonly [CurrencyKey, number, number][]): Promise<void> {
    for (const [key, delta, total] of moves) if (delta !== 0) session.callback('onAddMoney', session.characterId, key, delta, total);
    await this.currencies.push(session);
  }

  /** onReplacePRSShow {cid, prsUseId} to the map (self included) and the following pet redrawn with / without the form. */
  async broadcastLook(session: Session, useId: number): Promise<void> {
    const cid = session.characterId!;
    const payload = { cid, prsUseId: useId };
    if (session.mapId) this.scenes.broadcast(session.mapId, 'onReplacePRSShow', [payload]);
    else session.callback('onReplacePRSShow', payload);
    await this.follow.broadcast(cid);
  }

  /** initPRSPanel(cid) -> panel (objects never null). */
  init(session: Session): Promise<PrsPanel> {
    return withCharLock(session.characterId!, async () => panelOf(await this.loadLive(session)));
  }

  /** addSoulTreeLvl: realSoulStone = cost of the current node; pushes onAddMoney, updatePRSPanel, onRefreshPetProp. */
  treeUp(session: Session): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = unwrap(planTreeUp(await this.loadLive(session), (id) => this.gameData.prsTree(id)));
      const left = await this.spend(cid, 'realSoulStone', plan.cost, PRS_TEXT.NO_STONE);
      await this.saveOrRefund(cid, plan.state, 'realSoulStone', plan.cost);
      await this.pushMoney(session, [['realSoulStone', -plan.cost, left]]);
      session.callback('updatePRSPanel', panelOf(plan.state));
      await this.pets.refresh(session);
      return null;
    });
  }

  /** activePRSShow(cid, showId): tab-0 form for its chips. */
  activate(session: Session, showId: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = unwrap(planActivate(await this.loadLive(session), this.gameData.prsShow(showId), this.now()));
      await this.save(cid, plan.state);
      session.callback('updatePRSPanel', panelOf(plan.state));
      await this.pets.refresh(session);
      return null;
    });
  }

  /** activePRSShowSpe(cid, showId): tab-1 form for `needNum` bag items of template `needChipId`, lasting limit_time minutes. */
  activateSpe(session: Session, showId: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = unwrap(planActivateSpe(await this.loadLive(session), this.gameData.prsShow(showId), this.now()));
      const have = (await this.inventory.countByTemplate(cid, [plan.itemId])).get(plan.itemId) ?? 0;
      if (have < plan.count) return refuse(PRS_TEXT.NO_ITEMS);
      const spent = await this.inventory.removeByTemplate(cid, plan.itemId, plan.count);
      await this.save(cid, plan.state);
      for (const item of spent.updated) session.callback('onAddCharactorSlot', item);
      for (const gone of spent.deleted) session.callback('onDelCharactorSlot', gone.id, gone.sid);
      session.callback('updatePRSPanel', panelOf(plan.state));
      await this.pets.refresh(session);
      return null;
    });
  }

  /** replacePRSShow(cid, showId) / cancelPRSShow(cid): equip / un-equip; updatePRSPanel to self, onReplacePRSShow to the map. */
  replace(session: Session, showId: number | null): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const cur = await this.loadLive(session);
      const plan = unwrap(showId === null ? planCancel(cur) : planReplace(cur, showId, this.now()));
      await this.save(cid, plan.state);
      session.callback('updatePRSPanel', panelOf(plan.state));
      await this.broadcastLook(session, plan.state.useSid);
      return null;
    });
  }

  /** movePRSChip(cid, from, to, direction): pushes updatePRSChipBag + updatePRSExcBag. */
  move(session: Session, from: number, to: number, direction: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = unwrap(planMove(await this.loadLive(session), from, to, direction));
      await this.save(cid, plan.state);
      session.callback('updatePRSChipBag', plan.state.chipBag);
      session.callback('updatePRSExcBag', plan.state.excBag);
      return null;
    });
  }

  /** exchangePRSChip(cid, chipId): costCrystal realSoulCrystal -> one chip; pushes onAddMoney, updatePRSChipBag, onGetPRSChip. */
  exchange(session: Session, chipId: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = unwrap(planExchange(await this.loadLive(session), chipId, (id) => this.gameData.prsChip(id)?.cost));
      const left = await this.spend(cid, 'realSoulCrystal', plan.cost, PRS_TEXT.NO_CRYSTAL);
      await this.saveOrRefund(cid, plan.state, 'realSoulCrystal', plan.cost);
      await this.pushMoney(session, [['realSoulCrystal', -plan.cost, left]]);
      session.callback('updatePRSChipBag', plan.state.chipBag);
      session.callback('onGetPRSChip', { t: PRS.TBL_CHIP, id: chipId, num: 1 });
      return null;
    });
  }

  /** updateActivePRSShow(expired): the server clock decides (the client list is only the trigger); pushes the panel + pet refresh. */
  updateActive(session: Session): Promise<null> {
    return withCharLock(session.characterId!, async () => {
      const state = await this.loadLive(session);
      session.callback('updatePRSPanel', panelOf(state));
      await this.pets.refresh(session);
      return null;
    });
  }
}
