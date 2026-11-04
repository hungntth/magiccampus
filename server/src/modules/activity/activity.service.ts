// Activity login payload and the tutorial guide log: chooseCharactor extras (startedActList from data_tbl_activity, guideFlag),
// the login side effects (diary task 29 once a day, the online segment start) and saveGuideLog persistence in character_features.

import { Injectable } from '@nestjs/common';
import { ActivityId, DiaryTask, buildStripList, type ActivityLogin, type PlayerData } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { FeastService } from '../feast/feast.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { ActivityDataService } from './activity-data.service';
import { DiaryEvents } from './diary-events.service';
import { OnlineService } from './online.service';

const GUIDE_KEY = 'guide';
const MAX_GUIDE_ID = 100_000;

@Injectable()
export class ActivityService {
  constructor(
    private readonly data: ActivityDataService,
    private readonly features: FeatureStoreService,
    private readonly diary: DiaryEvents,
    private readonly online: OnlineService,
    private readonly feast: FeastService,
  ) {}

  async loginFields(characterId: number): Promise<Partial<PlayerData>> {
    this.online.start(characterId);
    this.diary.record(characterId, DiaryTask.LOGIN); // capped at once a day by the TBL_DIARY max
    const startedActList = buildStripList(await this.data.activityRows());
    const feast = await this.feast.stripEntry(startedActList[String(ActivityId.FEAST)]?.sortType ?? ActivityId.FEAST);
    if (feast) startedActList[String(ActivityId.FEAST)] = feast; // type 3 icon, shown only while a feast runs
    const fields: ActivityLogin = {
      startedActList,
      guideFlag: await this.guideLog(characterId),
    };
    return fields;
  }

  async guideLog(characterId: number): Promise<Record<string, boolean>> {
    const state = await this.features.get<Record<string, unknown>>(characterId, GUIDE_KEY, {});
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(state)) if (v === true) out[k] = true;
    return out;
  }

  /** saveGuideLog(stepId): Go stored `GuideLog[id] = true` without validation; H5 bounds the id. */
  async saveGuide(characterId: number, stepId: number): Promise<void> {
    if (!Number.isInteger(stepId) || stepId < 0 || stepId > MAX_GUIDE_ID) throw RpcException.invalidArgs('guideId');
    await this.features.patch(characterId, GUIDE_KEY, { [String(stepId)]: true });
  }
}
