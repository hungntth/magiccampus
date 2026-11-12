// Rune service (M13 phase E1): bag moves, socketing into the Hồn Khí holes, up-level, dissolve and chip exchange. State: feature keys `rune`
// (bags + up-level hole) and `rune_chip`; the sockets live in the `deco` document (DecoStateService). Every mutation runs under withCharLock:
// validate (pure plan) -> persist the cost first -> credit -> compensate on a failed write -> pushes.

import { Injectable } from '@nestjs/common';
import {
  DECO_SERVER_TEXT as T, runeBagOfKind, type DecoInfo, type RuneBag, type RuneBagType, type RuneCatalog, type RuneChipBag, type RuneExchangeReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { DecoService } from '../deco/deco.service';
import { DecoStateService } from '../deco/deco-state.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CurrencyService } from '../progression/currency.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import {
  RUNE_CHIP_FEATURE_KEY, RUNE_FEATURE_KEY, addChips, addRune, arrange, encodeChipBag, moveRune, parseChipBag, parseRuneBag, planExchange, planResolve, validBagType,
} from './rune-bag';
import { RunePetService } from './rune-pets.service';
import { planSocket, planUnsocket, planUpLevel } from './rune-socket';

const refuse = (note: string): never => {
  throw RpcException.forbidden(note);
};

@Injectable()
export class RuneService {
  private catalogCache: RuneCatalog | null = null;

  constructor(
    private readonly store: FeatureStoreService,
    private readonly deco: DecoStateService,
    private readonly decoView: DecoService,
    private readonly gameData: GameDataService,
    private readonly currencies: CurrencyService,
    private readonly stats: CharacterStatsService,
    private readonly pets: RunePetService,
  ) {}

  private readonly runeOf = (id: number) => this.gameData.decoRune(id);

  bag(characterId: number): Promise<RuneBag> {
    return this.store.get(characterId, RUNE_FEATURE_KEY, {}).then(parseRuneBag);
  }

  chips(characterId: number): Promise<RuneChipBag> {
    return this.store.get(characterId, RUNE_CHIP_FEATURE_KEY, {}).then(parseChipBag);
  }

  private saveBag(characterId: number, bag: RuneBag): Promise<void> {
    return this.store.put(characterId, RUNE_FEATURE_KEY, { chaBag: bag.chaBag, petBag: bag.petBag, upLvlHole: bag.upLvlHole });
  }

  private saveChips(characterId: number, chips: RuneChipBag): Promise<void> {
    return this.store.put(characterId, RUNE_CHIP_FEATURE_KEY, encodeChipBag(chips));
  }

  /** H5 getRuneCatalog: compact deco_rune rows (names deduplicated) and the chip rows. */
  catalog(): RuneCatalog {
    if (this.catalogCache) return this.catalogCache;
    const names: string[] = [];
    const index = new Map<string, number>();
    const runes = this.gameData.decoRunes().map((d) => {
      let nm = index.get(d.name);
      if (nm === undefined) {
        nm = names.push(d.name) - 1;
        index.set(d.name, nm);
      }
      return { i: d.id, k: d.kind, ty: d.type, lv: d.level, q: d.color, nx: d.nextId, e: d.exp, ue: d.upExp, pt: d.propType, pn: d.propNum, ic: d.iconCode, nm };
    });
    this.catalogCache = { names, runes, chips: this.gameData.runeChips().map((c) => ({ id: c.id, kind: c.kind, name: c.name, num: c.num, rid: c.rid, iconCode: c.iconCode })) };
    return this.catalogCache;
  }

  private pushBag(session: Session, bag: RuneBag): void {
    session.callback('onRuneBagUpdate', bag);
  }

  /** Stats of the page that changed: character onUPP, or every pet's onRefreshPetProp. */
  private async pushStats(session: Session, bagType: RuneBagType): Promise<void> {
    if (bagType === 1) await this.pets.refresh(session.characterId!);
    else for (const u of await this.stats.gearChangeUpdates(session.characterId!)) session.callback('onUPP', u);
  }

  /** runeMove(from, to, bagType): moves inside a bag or to / from the up-level hole (-1); pushes onRuneBagUpdate. */
  move(session: Session, from: number, to: number, bagType: number): Promise<null> {
    const cid = session.characterId!;
    if (!validBagType(bagType)) throw RpcException.invalidArgs('bagType');
    return withCharLock(cid, async () => {
      const next = moveRune(await this.bag(cid), bagType, from, to, this.runeOf);
      if (!next) return refuse(T.RUNE_BAD_ARGS);
      await this.saveBag(cid, next);
      this.pushBag(session, next);
      return null;
    });
  }

  /** arrangeRuneBag(cid, bagType): dense-packs one bag. */
  arrange(session: Session, bagType: number): Promise<null> {
    const cid = session.characterId!;
    if (!validBagType(bagType)) throw RpcException.invalidArgs('bagType');
    return withCharLock(cid, async () => {
      const next = arrange(await this.bag(cid), bagType);
      await this.saveBag(cid, next);
      this.pushBag(session, next);
      return null;
    });
  }

  /** runeSet(bagPos, holePos, bagType, decoPosition): the bag loses the rune first, then the hole gets it (the bag is restored on a failed write). */
  set(session: Session, bagPos: number, holePos: number, bagType: number, decoPosition: number): Promise<DecoInfo> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const bag = await this.bag(cid);
      const plan = planSocket(bag, await this.deco.load(cid), bagType, bagPos, holePos, decoPosition, this.runeOf, (id) => this.gameData.decoHole(id));
      if (!plan.ok) return refuse(plan.note);
      await this.saveBag(cid, plan.bag);
      try {
        await this.deco.save(cid, plan.deco);
      } catch (e) {
        await this.saveBag(cid, bag);
        throw e;
      }
      this.pushBag(session, plan.bag);
      await this.pushStats(session, bagType as RuneBagType);
      return this.decoView.view(plan.deco);
    });
  }

  /** runeRemove(holePos, bagPos, bagType, decoPosition): the hole is cleared first, then the rune goes back to the bag (the hole is restored on a failed write). */
  remove(session: Session, holePos: number, bagPos: number, bagType: number, decoPosition: number): Promise<DecoInfo> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const [bag, deco] = [await this.bag(cid), await this.deco.load(cid)];
      const plan = planUnsocket(bag, deco, bagType, bagPos, holePos, decoPosition, this.runeOf);
      if (!plan.ok) return refuse(plan.note);
      await this.deco.save(cid, plan.deco);
      try {
        await this.saveBag(cid, plan.bag);
      } catch (e) {
        await this.deco.save(cid, deco);
        throw e;
      }
      this.pushBag(session, plan.bag);
      await this.pushStats(session, runeHolePage(holePos));
      return this.decoView.view(plan.deco);
    });
  }

  /** runeUpLvl(): the staged rune advances for `up_exp` rune exp (spent first). */
  upLevel(session: Session): Promise<RuneBag> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const bag = await this.bag(cid);
      const plan = planUpLevel(bag, await this.currencies.balance(cid, 'runeExp'), this.runeOf);
      if (!plan.ok) return refuse(plan.note);
      if (plan.cost > 0 && (await this.currencies.spend(cid, 'runeExp', plan.cost)) === null) return refuse(T.RUNE_UP_EXP);
      try {
        await this.saveBag(cid, plan.bag);
      } catch (e) {
        if (plan.cost > 0) await this.currencies.credit(cid, 'runeExp', plan.cost);
        throw e;
      }
      await this.currencies.push(session);
      return plan.bag;
    });
  }

  /** runeResolve(runeObj{pos: runeId}, bagType): dissolves the named stacks into rune exp (the bag is saved before the credit). */
  resolve(session: Session, picked: Record<string, number>, bagType: number): Promise<null> {
    const cid = session.characterId!;
    if (!validBagType(bagType)) throw RpcException.invalidArgs('bagType');
    return withCharLock(cid, async () => {
      const bag = await this.bag(cid);
      const plan = planResolve(bag, bagType, picked, this.runeOf);
      if (plan.gained <= 0) return refuse(T.RUNE_NOT_IN_BAG);
      await this.saveBag(cid, plan.bag);
      try {
        await this.currencies.credit(cid, 'runeExp', plan.gained);
      } catch (e) {
        await this.saveBag(cid, bag);
        throw e;
      }
      this.pushBag(session, plan.bag);
      await this.currencies.push(session);
      return null;
    });
  }

  /**
   * Source of runes / chips for other systems (the Mật Bảo dissolve): the caller already holds the character lock, so this never locks. Runes fill their bag (a full bag
   * stops the rune grants), chips stack into the chip bag. Returns what landed and the bags to push (null when untouched).
   */
  async grantLocked(
    cid: number, runes: readonly { id: number; kind: number; name: string }[], chips: ReadonlyMap<number, number>,
  ): Promise<{ names: string[]; chipCount: number; full: boolean; bag: RuneBag | null; chips: RuneChipBag }> {
    let bag = await this.bag(cid);
    const names: string[] = [];
    let full = false;
    for (const r of runes) {
      const next = addRune(bag, runeBagOfKind(r.kind), r.id, 1);
      if (!next) {
        full = true;
        break;
      }
      bag = next;
      names.push(r.name);
    }
    if (names.length > 0) await this.saveBag(cid, bag);
    let chipBag = await this.chips(cid);
    let chipCount = 0;
    for (const [id, n] of chips) {
      const next = addChips(chipBag, id, n);
      if (!next) continue;
      chipBag = next;
      chipCount += n;
    }
    if (chipCount > 0) await this.saveChips(cid, chipBag);
    return { names, chipCount, full, bag: names.length > 0 ? bag : null, chips: chipBag };
  }

  /** exchangeRune(): every chip stack with enough chips turns into runes (kind decides the bag); rare families stay as chips. */
  exchange(session: Session): Promise<RuneExchangeReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const [chips, bag] = [await this.chips(cid), await this.bag(cid)];
      const plan = planExchange(chips, (id) => this.gameData.runeChip(id), this.runeOf);
      if (plan.converted === 0) {
        session.callback('updateRuneChipBag', chips);
        return refuse(plan.refusedRare > 0 ? T.RUNE_RARE : T.RUNE_NOTHING);
      }
      let next: RuneBag | null = bag;
      for (const [runeId, n] of plan.made) {
        next = next ? addRune(next, runeBagOfKind(this.runeOf(runeId)?.kind ?? 1), runeId, n) : null;
      }
      if (!next) return refuse(T.RUNE_BAG_FULL);
      await this.saveChips(cid, plan.chips);
      try {
        await this.saveBag(cid, next);
      } catch (e) {
        await this.saveChips(cid, chips);
        throw e;
      }
      session.callback('updateRuneChipBag', plan.chips);
      if (plan.refusedRare > 0) session.callback('onSystemMidMsgOrNote', T.RUNE_RARE);
      this.pushBag(session, next);
      return { converted: plan.converted, refusedRare: plan.refusedRare };
    });
  }
}

/** Page (bag type) of a hole position: odd = character, even = pet. */
const runeHolePage = (holePos: number): RuneBagType => (holePos % 2 === 1 ? 0 : 1);
