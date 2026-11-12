// BrotherhoodModule (M14 phase C): Kết bái RPCs, ceremonies, final steps and the NPC 1637 menu. State and the scene suffix lookup
// are BrotherhoodCoreModule. Adds `broT` to the chooseCharactor payload (CharacterService.addLoginExtra) and drops drafts /
// pending ceremonies on disconnect and character leave.

import { Module, OnModuleInit } from '@nestjs/common';
import type { PlayerData } from '@mc/shared';
import { GameGateway } from '../../gateway/game.gateway';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { GameDataModule } from '../gamedata/gamedata.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { PartyModule } from '../party/party.module';
import { QuestModule } from '../quest/quest.module';
import { SocialModule } from '../social/social.module';
import { TitleModule } from '../title/title.module';
import { BrotherExec } from './brother-exec.service';
import { BrotherNpcService } from './brother-npc.service';
import { BrotherPush } from './brother-push.service';
import { BrotherTeam } from './brother-team.service';
import { BrotherhoodCoreModule } from './brotherhood-core.module';
import { BrotherhoodRpc } from './brotherhood.rpc';
import { BrotherhoodService } from './brotherhood.service';
import { BrotherhoodStore } from './brotherhood.store';

@Module({
  imports: [BrotherhoodCoreModule, CharacterModule, GameDataModule, NpcScriptModule, PartyModule, QuestModule, SocialModule, TitleModule],
  providers: [BrotherhoodService, BrotherExec, BrotherTeam, BrotherPush, BrotherNpcService, BrotherhoodRpc],
  exports: [BrotherhoodService],
})
export class BrotherhoodModule implements OnModuleInit {
  constructor(
    private readonly characters: CharacterService,
    private readonly brothers: BrotherhoodService,
    private readonly store: BrotherhoodStore,
    private readonly gateway: GameGateway,
  ) {}

  onModuleInit(): void {
    this.characters.addLoginExtra(async (cid): Promise<Partial<PlayerData>> => {
      const broT = await this.store.titleOf(cid);
      return broT ? { broT } : {};
    });
    const gone = (s: { characterId: number | null; characterName: string | null }): void => {
      if (s.characterId !== null) this.brothers.forget(s.characterId, s.characterName ?? '');
    };
    this.gateway.onDisconnect(gone);
    this.gateway.onCharacterLeave(gone);
  }
}
