// Title stat provider: the buffs (data_tbl_title.b) of the active normal title and the active special title. Both apply to
// stats (research 14 §2.6 recommendation; Go applied none). Expired timed grants are skipped. Reads models only.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Bonuses } from '../character/character-stats';
import { emptyBonuses } from '../character/character-stats';
import type { Character } from '../character/character.schema';
import { buffBonuses } from '../buff/buff-stats';
import { GameDataService } from '../gamedata/gamedata.service';
import { isOwnedNow, titleBuffTemplates } from '../title/title-rules';
import { CharacterTitle } from '../title/title.schema';
import type { StatBonusProvider } from './stat-provider';

@Injectable()
export class TitleBonusProvider implements StatBonusProvider {
  readonly key = 'titles';

  constructor(
    @InjectModel(CharacterTitle.name) private readonly titles: Model<CharacterTitle>,
    private readonly gameData: GameDataService,
  ) {}

  async bonuses(characterId: number, doc: Character): Promise<Bonuses> {
    const active = [doc.titleId ?? 0, doc.actTitleId ?? 0].filter((id) => id > 0);
    if (active.length === 0) return emptyBonuses();
    const now = Date.now();
    const rows = await this.titles.find({ characterId, titleId: { $in: active } }).lean();
    const live = rows.filter((r) => isOwnedNow(r, now)).map((r) => r.titleId);
    return buffBonuses(titleBuffTemplates(live, (id) => this.gameData.getTitle(id), (id) => this.gameData.getBuff(id)));
  }
}
