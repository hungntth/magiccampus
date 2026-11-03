import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Account, AccountSchema } from './account.schema';
import { AuthService } from './auth.service';
import { AuthRpc } from './auth.rpc';

@Module({
  imports: [MongooseModule.forFeature([{ name: Account.name, schema: AccountSchema }])],
  providers: [AuthService, AuthRpc],
  exports: [AuthService],
})
export class AuthModule {}
