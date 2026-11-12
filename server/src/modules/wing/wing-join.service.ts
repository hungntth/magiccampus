// Wing fusion (legacy wingJoin / wingSeniorJoin, WingFuncPanel tab 0 and WingAdvancedPanel): four sub wings (1..3 colour rows) or 4..10 / 16
// same-template wings are consumed BEFORE the roll; success raises the colour by one, re-rolls the four lines for the new colour and takes the
// result template, any bound input binds the wing. A purple / orange result is announced server-wide. Under the character lock.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ItemKind, SlotType, WING_ANNOUNCE_COLOUR, WING_KIND, WING_TEXT, rightEnabled, rightValue, sidOf, wingColorCodeOf, wingJoinRate, wingSeniorRate,
  type WingJoinReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import { CharacterService } from '../character/character.service';
import type { Rng } from '../forge/craft-rules';
import { refuseIf } from '../forge/forge-guard';
import type { Out } from '../forge/refine.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { PmStateService } from '../vip/pm-state.service';
import { joinRefusal, joinResultTid, lineSet, rollWingLines } from './wing-rules';
import { WingItemsService } from './wing-items.service';

/** VIP (PM) right that adds percentage points to a purple -> orange fusion. */
const PM_RIGHT_WING_JOIN = 9;

@Injectable()
export class WingJoinService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly wings: WingItemsService,
    private readonly vip: PmStateService,
    private readonly scenes: SceneManager,
    private readonly characters: CharacterService,
  ) {}

  /** wingJoin (`senior` false, exactly 4 subs) / wingSeniorJoin (`senior` true). */
  join(cid: number, mainId: number, subIds: readonly number[], senior: boolean, rng: Rng = Math.random): Promise<Out<WingJoinReply>> {
    return withCharLock(cid, async () => {
      const main = await this.wings.load(cid, mainId);
      if (new Set([mainId, ...subIds]).size !== subIds.length + 1) throw RpcException.forbidden(WING_TEXT.JOIN_INVALID);
      const subs = [];
      for (const id of subIds) subs.push(await this.wings.load(cid, id));
      const facts = (w: { row: CharacterItem; colour: number; worn: boolean }) => ({ tid: w.row.templateId, colour: w.colour, worn: w.worn });
      refuseIf(joinRefusal(facts(main), subs.map(facts), senior));
      const bonus = !senior && main.colour === 3 ? await this.vipBonus(cid) : 0;
      const rate = senior ? wingSeniorRate(main.colour, subs.length) : wingJoinRate(main.row.templateId, main.colour, subs.map((s) => s.row.templateId)) + bonus;

      // The subs are spent before the roll.
      const gone = await this.items.deleteMany({ _id: { $in: [...subIds] }, characterId: cid, slotType: SlotType.BAG, itemType: ItemKind.EQUIP });
      if (gone.deletedCount !== subIds.length) throw RpcException.forbidden('Túi đồ vừa thay đổi, hãy thử lại');
      const pushes: Push[] = subs.map((s) => push('onDelCharactorSlot', s.row._id, sidOf(s.row.slotType, s.row.slotIndex)));
      if (!(rng() * 100 < rate)) {
        pushes.push(push('onSystemMidMsgOrNote', WING_TEXT.JOIN_FAIL));
        return { reply: { f: false }, pushes };
      }

      const tid = senior ? main.row.templateId : joinResultTid(main.row.templateId, subs.map((s) => s.row.templateId), rng);
      const target = await this.gameData.template(19, tid);
      const resultTpl = target && Number(target.kind) === WING_KIND ? target : main.tpl;
      const resultTid = resultTpl === main.tpl ? main.row.templateId : tid;
      const colour = main.colour + 1;
      await this.wings.write(cid, mainId, {
        templateId: resultTid, colorCode: wingColorCodeOf(colour), isBound: main.row.isBound || subs.some((s) => s.row.isBound),
        ...lineSet(rollWingLines(resultTpl, colour, rng)),
      });
      pushes.push(...(await this.wings.slotPushes(cid, mainId)), push('onSystemMidMsgOrNote', WING_TEXT.JOIN_OK));
      await this.wings.after(cid, main.worn, { look: true });
      if (colour >= WING_ANNOUNCE_COLOUR) void this.announce(cid, String(resultTpl.name ?? ''));
      const view = await this.wings.forgeItems.view(cid, mainId);
      return { reply: { f: true, i: mainId, n: view!, e: mainId, sid: view!.sid }, pushes };
    });
  }

  /** Percentage points of the VIP right (0 without it). */
  private async vipBonus(cid: number): Promise<number> {
    const right = (await this.vip.rights()).find((r) => r.id === PM_RIGHT_WING_JOIN);
    const level = await this.vip.levelOf(cid);
    return right && rightEnabled(right, level) ? Math.max(0, rightValue(right, level) ?? 0) : 0;
  }

  private async announce(cid: number, wing: string): Promise<void> {
    try {
      const name = String((await this.characters.getById(cid)).name ?? '');
      this.scenes.broadcastAll('onSystemSay', [WING_TEXT.FUSION_SAY(name, wing)]);
    } catch {
      // an announcement never fails the fusion
    }
  }
}
