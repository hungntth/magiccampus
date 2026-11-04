// Lotto / wish tree: draws (weighted data_tbl_plan rows, gold paid first, the daily free type-1 wish) into a persisted holding bag
// (character_features key `lotto`), claimed into the bag one by one or all at once. Costs and the free quota are Go display constants.

import { Injectable } from '@nestjs/common';
import {
  ItemKind, LOTTO_DISPLAY_SLOTS, LOTTO_FREE_DAILY, LOTTO_TYPES, dayKey, lottoCost,
  type LottoData, type LottoEntry, type LottoPlanView,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { bagHasRoom, freeUsed, grantable, isFreeWish, rollPlan, toEntry, toPlan, type PlanRow } from './lotto-rules';

const KEY = 'lotto';
const REROLLS = 12;

interface LottoState {
  bag: LottoEntry[];
  freeDay: string;
  freeN: number;
  [k: string]: unknown;
}

@Injectable()
export class LottoService {
  now = (): number => Date.now();
  rng: () => number = Math.random;
  private pools: Map<number, PlanRow[]> | null = null;

  constructor(
    private readonly gameData: GameDataService,
    private readonly features: FeatureStoreService,
    private readonly characters: CharacterService,
    private readonly inventory: InventoryService,
  ) {}

  private async pool(type: number): Promise<PlanRow[]> {
    if (!this.pools) {
      const pools = new Map<number, PlanRow[]>();
      for (const raw of await this.gameData.rows('data_tbl_plan')) {
        const p = toPlan(raw);
        if (!grantable(p) || p.t < 1 || p.t > 4) continue;
        const list = pools.get(p.t);
        if (list) list.push(p);
        else pools.set(p.t, [p]);
      }
      for (const list of pools.values()) list.sort((a, b) => a.id - b.id);
      this.pools = pools;
    }
    return this.pools.get(type) ?? [];
  }

  private state(characterId: number): Promise<LottoState> {
    return this.features.get<LottoState>(characterId, KEY, { bag: [], freeDay: '', freeN: 0 });
  }

  private tableOf = (ti: number): number => (ti === 19 ? 19 : 29);

  private async named(entries: readonly LottoEntry[]): Promise<LottoEntry[]> {
    return Promise.all(entries.map(async (e) => ({ ...e, name: await this.gameData.templateName(this.tableOf(Number(e.ti)), Number(e.ii)) })));
  }

  async data(characterId: number): Promise<LottoData> {
    const lottoAward: number[][] = [];
    const view: LottoPlanView[][] = [];
    for (const t of [...LOTTO_TYPES, 4]) {
      const rows = (await this.pool(t)).slice(0, LOTTO_DISPLAY_SLOTS);
      lottoAward.push(rows.map((r) => r.id));
      view.push(await Promise.all(rows.map(async (r) => ({
        id: r.id, ti: r.ti, ii: r.ii, n: r.n, name: await this.gameData.templateName(this.tableOf(r.ti), r.ii),
      }))));
    }
    const s = await this.state(characterId);
    return { lottoAward, highestAwardArr: [], view, freeLeft: LOTTO_FREE_DAILY - freeUsed({ day: String(s.freeDay), n: Number(s.freeN) || 0 }, dayKey(this.now())) };
  }

  async bag(characterId: number): Promise<LottoEntry[]> {
    return this.named((await this.state(characterId)).bag ?? []);
  }

  /** One roll whose template exists (a plan row may name a template the data lacks): re-rolled a few times. */
  private async rollValid(pool: readonly PlanRow[]): Promise<PlanRow | null> {
    for (let i = 0; i < REROLLS; i++) {
      const p = rollPlan(pool, this.rng);
      if (p && (await this.gameData.template(this.tableOf(p.ti), p.ii))) return p;
    }
    return null;
  }

  draw(session: Session, type: number, num: number): Promise<boolean> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const cost = lottoCost(type, num);
      if (cost === null) throw RpcException.invalidArgs('type');
      const pool = await this.pool(type);
      if (pool.length === 0) throw RpcException.forbidden('Chưa có phần thưởng cho loại ước nguyện này');
      const s = await this.state(cid);
      const today = dayKey(this.now());
      const used = freeUsed({ day: String(s.freeDay), n: Number(s.freeN) || 0 }, today);
      const bag = [...(s.bag ?? [])];
      if (!bagHasRoom(bag.length, num)) throw RpcException.forbidden('Túi phần thưởng ước nguyện đã đầy, hãy nhận hoặc bỏ bớt');
      const free = isFreeWish(type, num, used);
      let paid = 0;
      if (!free) {
        const total = await this.characters.spendMoney(cid, 'gold', cost); // spend before the rewards exist
        if (total === null) throw RpcException.forbidden('Không đủ vàng!');
        paid = cost;
        session.callback('onUPP', { gold: total });
      }
      try {
        for (let i = 0; i < num; i++) {
          const p = await this.rollValid(pool);
          if (!p) throw RpcException.forbidden('Không rút được phần thưởng, thử lại sau');
          bag.push(toEntry(p));
        }
        await this.features.patch(cid, KEY, { bag, freeDay: today, freeN: free ? used + 1 : used });
      } catch (e) {
        if (paid > 0) session.callback('onUPP', { gold: await this.characters.addMoney(cid, 'gold', paid) });
        throw e;
      }
      session.callback('updateLottoBag', await this.named(bag));
      return true;
    });
  }

  /** Adds one entry's items to the bag (equipment: one row per piece). Throws when it does not fit. */
  private async grantEntry(session: Session, e: LottoEntry): Promise<void> {
    const cid = session.characterId!;
    const ti = this.tableOf(Number(e.ti));
    const id = Number(e.ii);
    const tpl = await this.gameData.template(ti, id);
    if (!tpl) throw RpcException.notFound('Vật phẩm không tồn tại');
    const equip = ti === 19;
    const spec = {
      templateId: id, itemType: equip ? ItemKind.EQUIP : ItemKind.ITEM, bound: e.b === 1, color: equip ? Number(tpl.color_code ?? 0) || 0 : 0,
      amount: equip ? 1 : e.n, maxStack: equip ? 1 : maxStack(tpl),
    };
    const pieces = equip ? Math.max(1, e.n) : 1;
    for (let i = 0; i < pieces; i++) {
      for (const slot of await this.inventory.add(cid, spec, equip ? Number(tpl.endure_max ?? 0) || 0 : 0)) session.callback('onAddCharactorSlot', slot);
    }
    session.callback('onAddItem', { i: id, q: e.n, t: equip ? ItemKind.EQUIP : ItemKind.ITEM, n: String(tpl.name ?? `#${id}`) });
  }

  /** Claims entry `index`, or every entry in order when `index` is null; stops at the first one that does not fit. */
  claim(session: Session, index: number | null): Promise<LottoEntry[]> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const bag = [...((await this.state(cid)).bag ?? [])];
      const take = index === null ? bag.length : 1;
      if (index !== null && (index < 0 || index >= bag.length)) return this.named(bag);
      for (let i = 0; i < take; i++) {
        const at = index ?? 0;
        const entry = bag[at];
        bag.splice(at, 1); // removed first: a crash never pays twice
        await this.features.patch(cid, KEY, { bag });
        try {
          await this.grantEntry(session, entry);
        } catch (e) {
          bag.splice(at, 0, entry);
          await this.features.patch(cid, KEY, { bag });
          if (index !== null || i === 0) throw e instanceof RpcException ? e : RpcException.forbidden('Túi đồ đã đầy');
          break;
        }
      }
      const out = await this.named(bag);
      session.callback('updateLottoBag', out);
      return out;
    });
  }

  throwAll(session: Session): Promise<LottoEntry[]> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      await this.features.patch(cid, KEY, { bag: [] });
      session.callback('updateLottoBag', []);
      return [];
    });
  }
}
