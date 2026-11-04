// Teleport scrolls: pays (first owned scroll of the priority list, else 3 / 5 gold on the selected gold type), then moves the
// session through SceneTransportService (safe point of the map; a party leader's senior transport takes the followers along,
// trades stop, battles are refused by the RPC layer). Legacy: Go item/transport.go.

import { Injectable } from '@nestjs/common';
import {
  TRANSPORT_PRIORITY, TRANSPORT_SENIOR, planTransport, transportDestinationError, type MoneyKey, type TransportMapEntry,
  type TransportReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { PartyService } from '../party/party.service';
import { SceneTransportService } from '../scene/scene-transport.service';
import { ItemSpendService } from './item-spend.service';

const NO_MEANS = 'Bạn không có Tiêu Diêu Phù và không đủ Vàng để dịch chuyển.';
const FOLLOW = 'Đã ở trong nhóm thì cần nghe lời nhóm trưởng!';

@Injectable()
export class TransportService {
  private mapList: TransportMapEntry[] | null = null;

  constructor(
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
    private readonly party: PartyService,
    private readonly scene: SceneTransportService,
    private readonly spend: ItemSpendService,
  ) {}

  /** Maps a scroll reaches (data_tbl_map.t > 0), by id; cached. */
  maps(): TransportMapEntry[] {
    this.mapList ??= this.gameData
      .listMaps()
      .filter((m) => Number(m.t) > 0)
      .map((m) => ({ id: Number(m.id), name: String(m.name ?? ''), level: Number(m.level ?? 0) }))
      .sort((a, b) => a.id - b.id);
    return this.mapList;
  }

  /** Whether the session leads a party (the client offers "Nhóm" then). */
  isLeader(session: Session): boolean {
    return this.party.isLeader(session);
  }

  /** `senior`: senior scroll list and 5-gold price. The followers come along only when a party leader pays senior. */
  async travel(session: Session, mapId: number, senior: boolean): Promise<TransportReply> {
    const id = session.characterId!;
    const mapRow = this.gameData.getMap(mapId);
    const bad = transportDestinationError(mapRow, mapId, session.mapId);
    if (bad) throw RpcException.forbidden(bad);
    if (!this.party.canMove(session)) throw RpcException.forbidden(FOLLOW);
    return withCharLock(id, async () => {
      const key: MoneyKey = (await this.characters.paymentPrefs(id)).gold;
      const balance = Number((await this.characters.getById(id))[key] ?? 0);
      const owned = await this.spend.owned(id, senior ? TRANSPORT_SENIOR : TRANSPORT_PRIORITY);
      const plan = planTransport(owned, senior, balance);
      if (plan.kind === 'none') throw RpcException.forbidden(NO_MEANS);
      if (plan.kind === 'scroll') await this.spend.take(session, plan.tid);
      else {
        const left = await this.characters.spendMoney(id, key, plan.cost);
        if (left === null) throw RpcException.forbidden(NO_MEANS);
        session.callback('onUPP', { [key]: left });
      }
      try {
        const x = Number(mapRow!.safe_x ?? 0);
        const y = Number(mapRow!.safe_y ?? 0);
        session.callback('onSceneEnter', await this.scene.moveToMap(session, mapId, x, y, senior && this.party.isLeader(session)));
      } catch (e) {
        if (plan.kind === 'scroll') await this.spend.giveBack(session, plan.tid);
        else session.callback('onUPP', { [key]: await this.characters.addMoney(id, key, plan.cost) });
        throw e;
      }
      return { success: true, tid: plan.kind === 'scroll' ? plan.tid : 0, gold: plan.kind === 'gold' ? plan.cost : 0 };
    });
  }
}
