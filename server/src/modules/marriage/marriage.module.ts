// MarriageModule (M14 phase D): marriage panel, proposals, couple link, rank, divorce card and the Cupid / Nguyệt Lão NPC marriage.
// Pushes `onInitCouple` after the IM snapshot (RelationshipService listener) and when a character enters the world (SceneHooks,
// fromMap 0), re-checks the couple skills there, and drops NPC proposals on disconnect / character leave. Phase E: the wedding hall
// (booking, scheduler, entry / exit, vows and rings, invitations, red envelope) lives in the wedding-* services of this module.

import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameGateway } from '../../gateway/game.gateway';
import { CharacterModule } from '../character/character.module';
import { Counter, CounterSchema } from '../character/counter.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ItemUseModule } from '../item-use/item-use.module';
import { MailModule } from '../mail/mail.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { PartyModule } from '../party/party.module';
import { QuestModule } from '../quest/quest.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SceneModule } from '../scene/scene.module';
import { SceneHooks } from '../scene/scene-hooks.service';
import { SkillModule } from '../skill/skill.module';
import { CharacterSkill, CharacterSkillSchema } from '../skill/skill.schema';
import { Relationship, RelationshipSchema } from '../social/relationship.schema';
import { RelationshipService } from '../social/relationship.service';
import { SocialModule } from '../social/social.module';
import { TitleModule } from '../title/title.module';
import { MarriageRequest, MarriageRequestSchema, MarriageSeeking, MarriageSeekingSchema } from './marriage-board.schema';
import { MarriageDivorceService } from './marriage-divorce.service';
import { MarriageNpcService } from './marriage-npc.service';
import { MarriagePanelService } from './marriage-panel.service';
import { MarriagePanelView } from './marriage-panel.view';
import { MarriagePush } from './marriage-push.service';
import { MarriageRankService } from './marriage-rank.service';
import { MarriageRewards } from './marriage-rewards.service';
import { Marriage, MarriageSchema, WeddingBooking, WeddingBookingSchema } from './marriage.schema';
import { MarriageRpc } from './marriage.rpc';
import { MarriageService } from './marriage.service';
import { MarriageStore } from './marriage.store';
import { TierPickService } from './tier-pick.service';
import { WeddingCeremony } from './wedding-ceremony.service';
import { WeddingHall } from './wedding-hall.service';
import { WeddingInvites } from './wedding-invites.service';
import { WeddingItems } from './wedding-items.service';
import { WeddingScheduler } from './wedding-scheduler';
import { WeddingOrigin, WeddingOriginSchema } from './wedding.schema';
import { WeddingRpc } from './wedding.rpc';
import { WeddingService } from './wedding.service';
import { WeddingStore } from './wedding.store';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Marriage.name, schema: MarriageSchema },
      { name: WeddingBooking.name, schema: WeddingBookingSchema },
      { name: WeddingOrigin.name, schema: WeddingOriginSchema },
      { name: MarriageSeeking.name, schema: MarriageSeekingSchema },
      { name: MarriageRequest.name, schema: MarriageRequestSchema },
      { name: Counter.name, schema: CounterSchema },
      { name: CharacterSkill.name, schema: CharacterSkillSchema },
      { name: Relationship.name, schema: RelationshipSchema },
    ]),
    CharacterModule, GameDataModule, InventoryModule, ItemUseModule, MailModule, NpcScriptModule, PartyModule, QuestModule, RewardsModule, SceneModule,
    SkillModule, SocialModule, TitleModule,
  ],
  providers: [
    MarriageStore, MarriagePush, MarriageRewards, MarriageService, MarriagePanelView, MarriagePanelService, MarriageRankService,
    MarriageDivorceService, MarriageNpcService, TierPickService, MarriageRpc,
    WeddingStore, WeddingItems, WeddingService, WeddingHall, WeddingCeremony, WeddingInvites, WeddingScheduler, WeddingRpc,
  ],
  exports: [MarriageService, MarriageStore, MarriagePush, TierPickService],
})
export class MarriageModule implements OnModuleInit {
  constructor(
    private readonly marriages: MarriageService,
    private readonly rewards: MarriageRewards,
    private readonly npc: MarriageNpcService,
    private readonly relations: RelationshipService,
    private readonly hooks: SceneHooks,
    private readonly gateway: GameGateway,
  ) {}

  onModuleInit(): void {
    // IM window opened: Flash sends the couple right after the list (IMPanel.initCP).
    this.relations.addSnapshotListener((s) => (s.characterId === null ? undefined : this.marriages.pushCouple(s.characterId)));
    // Game ready: the couple for `player.cpid`, and the couple skills of a married character.
    this.hooks.onMapChanged('marriage-ready', async (session, fromMap) => {
      if (fromMap !== 0 || session.characterId === null) return;
      await this.marriages.pushCouple(session.characterId);
      if (await this.marriages.isMarried(session.characterId)) await this.rewards.grantAll([session.characterId]);
    });
    const gone = (s: { characterId: number | null }): void => {
      if (s.characterId !== null) this.npc.forget(s.characterId);
    };
    this.gateway.onDisconnect(gone);
    this.gateway.onCharacterLeave(gone);
  }
}
