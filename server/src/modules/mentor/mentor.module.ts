// MentorModule (M14 phase B): Sư đồ (teacher / student) RPCs, links (`mentor_links`), rank row (feature `mentor`), NPC 49 menu and the
// quest 692 qualification hook. Adds ti / tn / tl / tp / ll to the chooseCharactor payload through CharacterService.addLoginExtra
// (CharacterModule cannot import this module) and drops pending requests / NPC drafts on disconnect and character leave.

import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameGateway } from '../../gateway/game.gateway';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { GameDataModule } from '../gamedata/gamedata.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { PartyModule } from '../party/party.module';
import { ProgressionModule } from '../progression/progression.module';
import { QuestModule } from '../quest/quest.module';
import { SocialModule } from '../social/social.module';
import { TitleModule } from '../title/title.module';
import { MentorNpcService } from './mentor-npc.service';
import { MentorReportService } from './mentor-report.service';
import { MentorStateService } from './mentor-state.service';
import { MentorRpc } from './mentor.rpc';
import { MentorLink, MentorLinkSchema } from './mentor.schema';
import { MentorService } from './mentor.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MentorLink.name, schema: MentorLinkSchema }]),
    CharacterModule, GameDataModule, NpcScriptModule, PartyModule, ProgressionModule, QuestModule, SocialModule, TitleModule,
  ],
  providers: [MentorService, MentorStateService, MentorReportService, MentorNpcService, MentorRpc],
  exports: [MentorService],
})
export class MentorModule implements OnModuleInit {
  constructor(
    private readonly characters: CharacterService,
    private readonly report: MentorReportService,
    private readonly mentor: MentorService,
    private readonly gateway: GameGateway,
  ) {}

  onModuleInit(): void {
    this.characters.addLoginExtra((cid) => this.report.loginFields(cid));
    const gone = (s: { characterId: number | null }): void => {
      if (s.characterId !== null) this.mentor.forget(s.characterId);
    };
    this.gateway.onDisconnect(gone);
    this.gateway.onCharacterLeave(gone);
  }
}
