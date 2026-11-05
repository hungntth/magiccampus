// Trade orchestration: newTrade / tradeLock / tradeConfirm / stopTrade on top of TradeManager, plus the cleanups (disconnect,
// back to char select, battle start, map change) used by other modules. Pushes: onRequestTrade, onTargetLock, onTargetConfirm,
// onStopTrade, onTradeFail, and on success per side onDelCharactorSlot, onAddCharactorSlot, onDelPet, onAddPet, onAddMoney, onUPP,
// onTradeSuccess.

import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  PERMISSION_TEXT, TRADE_MAX_PETS, type BagItem, type PlayerUpdate, type TargetLock, type TradeOffer, type TradeReply,
} from '@mc/shared';
import { GameGateway } from '../../gateway/game.gateway';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { sidOf } from '../inventory/bag-rules';
import { InventoryService } from '../inventory/inventory.service';
import { TRADE_NOTE, hasTradePetRoom, validateOffer, validatePets, type OwnedItem } from './trade-rules';
import { TradeManager } from './trade.manager';
import { TradePetService } from './trade-pets.service';
import { TradeSwapService } from './trade-swap.service';
import { PermissionService } from '../settings/permission.service';

interface SideResult {
  given: { id: number; fromSlot: number }[];
  got: { id: number }[];
  incoming: TradeOffer;
  petsGiven: number[];
  petsGot: number[];
}

const fail = (info: string): TradeReply => ({ flag: false, info });
const ok: TradeReply = { flag: true, info: '' };

@Injectable()
export class TradeService implements OnModuleInit {
  constructor(
    private readonly book: TradeManager,
    private readonly scenes: SceneManager,
    private readonly gateway: GameGateway,
    private readonly characters: CharacterService,
    private readonly inventory: InventoryService,
    private readonly swap: TradeSwapService,
    private readonly tradePets: TradePetService,
    private readonly perms: PermissionService,
  ) {}

  onModuleInit(): void {
    const gone = (s: Session): void => (s.characterId === null ? undefined : this.stopFor(s.characterId, false));
    this.gateway.onDisconnect(gone);
    this.gateway.onCharacterLeave(gone);
  }

  async newTrade(session: Session, targetCid: number): Promise<TradeReply> {
    const me = session.characterId!;
    if (me === targetCid) return fail(TRADE_NOTE.SELF);
    const target = this.scenes.findByCharacter(targetCid);
    if (!target) return fail(TRADE_NOTE.OFFLINE);
    if (target.mapId !== session.mapId) return fail(TRADE_NOTE.MAP);
    if (target.battleId !== null) return fail(TRADE_NOTE.BATTLE);
    if (!(await this.perms.allows(targetCid, 'at'))) return fail(PERMISSION_TEXT.at(target.characterName ?? '?'));
    const r = this.book.start(me, targetCid); // sync after the await
    if (!r.ok) return fail(r.info);
    target.callback('onRequestTrade', me, session.characterName ?? '?');
    return ok;
  }

  async lock(session: Session, offer: TradeOffer): Promise<TradeReply> {
    const me = session.characterId!;
    const current = this.book.sessionOf(me);
    if (!current) return fail(TRADE_NOTE.NO_SESSION);
    if (current.executing) return fail(TRADE_NOTE.BUSY);
    const [bagItems, doc, petFacts] = await Promise.all([
      this.inventory.byIds(me, offer.items), this.characters.getById(me), this.tradePets.factsOf(me, offer.pets),
    ]);
    const owned = new Map<number, OwnedItem>(bagItems.map((i) => [i.id, i]));
    const refusal = validateOffer(offer, owned, { money: doc.money ?? 0, gold: doc.gold ?? 0 })
      ?? validatePets(offer.pets, petFacts) ?? (await this.petRoomRefusal(me, offer));
    if (refusal) return fail(refusal);
    const petList = await this.tradePets.wrappers(me, offer.pets);
    const r = this.book.lock(me, offer); // sync after the awaits: the session may have ended meanwhile
    if (!r.ok) return fail(r.info);
    const itemList = offer.items.map((id) => owned.get(id)).filter((i): i is BagItem => i !== undefined);
    const petIds = Array.from({ length: TRADE_MAX_PETS }, (_, i) => offer.pets[i] ?? -1); // Flash shape: 5 slots, -1 empty
    const payload: TargetLock = { money: offer.money, gold: offer.gold, itemList, petIds, petList };
    this.scenes.findByCharacter(r.peer)?.callback('onTargetLock', payload);
    return ok;
  }

  async confirm(session: Session): Promise<TradeReply> {
    const me = session.characterId!;
    const r = this.book.confirm(me);
    if (!r.ok) return fail(r.info);
    if (!r.both) {
      if (r.first) this.scenes.findByCharacter(r.peer)?.callback('onTargetConfirm');
      return ok;
    }
    const { a, b } = r.session;
    const sa = this.scenes.findByCharacter(a.cid);
    const sb = this.scenes.findByCharacter(b.cid);
    let outcome: Awaited<ReturnType<TradeSwapService['execute']>>;
    if (!sa || !sb || !a.offer || !b.offer) outcome = { ok: false, info: TRADE_NOTE.OFFLINE };
    else outcome = await this.swap.execute({ cid: a.cid, offer: a.offer }, { cid: b.cid, offer: b.offer });
    this.book.end(r.session);
    if (!outcome.ok) {
      for (const s of [sa, sb]) s?.callback('onTradeFail', outcome.info);
      return fail(outcome.info);
    }
    const { moves, petMoves } = outcome;
    const sideOf = (cid: number, incoming: TradeOffer) => ({
      given: moves.filter((m) => m.from === cid), got: moves.filter((m) => m.to === cid), incoming,
      petsGiven: petMoves.filter((m) => m.from === cid).map((m) => m.id), petsGot: petMoves.filter((m) => m.to === cid).map((m) => m.id),
    });
    await Promise.all([
      this.pushSuccess(sa, a.cid, sideOf(a.cid, b.offer!)),
      this.pushSuccess(sb, b.cid, sideOf(b.cid, a.offer!)),
    ]);
    return ok;
  }

  /**
   * Best-effort lock-time room check, only once the peer has locked (their outgoing pets are then known). The swap re-checks on the
   * live rows, so a peer who locks later or changes their offer can still fail the trade with the same text.
   */
  private async petRoomRefusal(me: number, offer: TradeOffer): Promise<string | null> {
    const session = this.book.sessionOf(me);
    const theirs = session ? this.book.sideOf(session, this.book.peerOf(session, me)) : null;
    if (!theirs?.offer || offer.pets.length + theirs.offer.pets.length === 0) return null;
    for (const [cid, incoming, outgoing] of [
      [theirs.cid, offer.pets.length, theirs.offer.pets.length], [me, theirs.offer.pets.length, offer.pets.length],
    ] as const) {
      if (incoming === 0) continue;
      const { count, max } = await this.tradePets.room(cid);
      if (!hasTradePetRoom(count, max, incoming, outgoing)) return TRADE_NOTE.PET_FULL;
    }
    return null;
  }

  /** stopTrade(): the peer is told (onStopTrade); the caller's panel has already closed itself. No session = no-op. */
  stop(session: Session): void {
    this.stopFor(session.characterId!, false);
  }

  /** Ends the character's trade and tells the peer (and the character too when `notifySelf`: battle start, map change). */
  stopFor(cid: number, notifySelf: boolean): void {
    const ended = this.book.stop(cid);
    if (!ended) return;
    this.scenes.findByCharacter(this.book.peerOf(ended, cid))?.callback('onStopTrade');
    if (notifySelf) this.scenes.findByCharacter(cid)?.callback('onStopTrade');
  }

  /** Per side: onDelCharactorSlot (given), onAddCharactorSlot (got), onDelPet (given pets), onAddPet (got pets), onAddMoney, onUPP, onTradeSuccess. */
  private async pushSuccess(s: Session | undefined, cid: number, r: SideResult): Promise<void> {
    if (!s) return;
    const { given, got, incoming } = r;
    for (const g of given) s.callback('onDelCharactorSlot', g.id, sidOf(g.fromSlot));
    for (const item of await this.inventory.byIds(cid, got.map((m) => m.id))) s.callback('onAddCharactorSlot', item);
    for (const id of r.petsGiven) s.callback('onDelPet', id);
    for (const wrapper of await this.tradePets.wrappers(cid, r.petsGot)) s.callback('onAddPet', wrapper);
    const doc = await this.characters.getById(cid);
    if (incoming.money > 0) s.callback('onAddMoney', cid, 'money', incoming.money, doc.money ?? 0);
    const update: PlayerUpdate = { money: doc.money ?? 0, gold: doc.gold ?? 0 };
    s.callback('onUPP', update);
    s.callback('onTradeSuccess');
  }
}
