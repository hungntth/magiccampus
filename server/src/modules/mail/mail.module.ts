// MailModule (M11 phase A): Thùng Thư RPCs, the send / take / delete sagas, the expiry sweeper and the PUBLIC MailSystemService
// (exported: other features deliver rewards, refunds and auction goods through sendSystemMail). Login extras (`mailUnread`, the
// 6 s unread notice) are added through CharacterService.addLoginExtra. Escrow itself lives in InventoryModule (EscrowService).

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterModule } from '../character/character.module';
import { Counter, CounterSchema } from '../character/counter.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PetModule } from '../pet/pet.module';
import { TradeModule } from '../trade/trade.module';
import { MailCoreService } from './mail-core.service';
import { MailDeleteService } from './mail-delete.service';
import { MailSendService } from './mail-send.service';
import { MailSweepService } from './mail-sweep.service';
import { MailSystemService } from './mail-system.service';
import { MailTakeService } from './mail-take.service';
import { MailRpc } from './mail.rpc';
import { Mail, MailSchema } from './mail.schema';
import { MailService } from './mail.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Mail.name, schema: MailSchema },
      { name: Counter.name, schema: CounterSchema },
      { name: Character.name, schema: CharacterSchema },
    ]),
    CharacterModule, GameDataModule, InventoryModule, PetModule, TradeModule,
  ],
  providers: [
    MailCoreService, MailSystemService, MailSendService, MailTakeService, MailDeleteService, MailService, MailSweepService, MailRpc,
  ],
  exports: [MailSystemService, MailService],
})
export class MailModule {}
