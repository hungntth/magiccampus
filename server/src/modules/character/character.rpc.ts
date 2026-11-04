// RPCs for the character-select screen: class list, char list, create, choose, back.

import { Injectable } from '@nestjs/common';
import type { CharListResponse, ClassInfo, PlayerData } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { SceneManager } from '../../gateway/scene.manager';
import { GameGateway } from '../../gateway/game.gateway';
import { CharacterService } from './character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { AuthService } from '../auth/auth.service';
import { QuestService } from '../quest/quest.service';
import { CharacterStatsService } from '../stats/character-stats.service';

@Injectable()
export class CharacterRpc {
  constructor(
    private readonly characters: CharacterService,
    private readonly gameData: GameDataService,
    private readonly auth: AuthService,
    private readonly scenes: SceneManager,
    private readonly quests: QuestService,
    private readonly stats: CharacterStatsService,
    private readonly gateway: GameGateway,
  ) {}

  @Rpc('getClassList', { quiet: true })
  getClassList(): ClassInfo[] {
    return this.gameData.listClasses().map((c) => ({
      id: Number(c.id),
      name: String(c.name ?? ''),
      description: String(c.class_description ?? ''),
      iconCodeMale: String(c.icon_code_male ?? 0),
      iconCodeFemale: String(c.icon_code_female ?? 0),
      imgCodeMale: String(c.img_code_male ?? 0),
      imgCodeFemale: String(c.img_code_female ?? 0),
      largeImgMale: String(c.large_img_male ?? 0),
      largeImgFemale: String(c.large_img_female ?? 0),
    }));
  }

  @Rpc('sendCharList', { requireAuth: true })
  async sendCharList(session: Session): Promise<CharListResponse> {
    const account = await this.auth.getById(session.accountId!);
    const list = await this.characters.listByAccount(session.accountId!);
    return {
      charList: list.map((c) => this.characters.toListEntry(c)),
      accountInfo: { acountLv: account?.vipLevel ?? 0, maxCharSlots: 6, gold: account?.gold ?? 0 },
    };
  }

  @Rpc('icl', { requireAuth: true })
  icl(session: Session): Promise<CharListResponse> {
    return this.sendCharList(session);
  }

  @Rpc('newChar', { requireAuth: true })
  async newChar(session: Session, args: unknown[]): Promise<CharListResponse> {
    const [name, classId, gender] = args;
    if (typeof name !== 'string') throw RpcException.invalidArgs('name');
    await this.characters.create(session.accountId!, name, Number(classId), Number(gender ?? 0));
    return this.sendCharList(session);
  }

  @Rpc('chooseCharactor', { requireAuth: true })
  async chooseCharactor(session: Session, args: unknown[]): Promise<PlayerData> {
    const cid = Number(args[0]);
    if (!Number.isInteger(cid)) throw RpcException.invalidArgs('cid');
    const doc = await this.characters.getOwned(session.accountId!, cid);
    const other = this.scenes.findByCharacter(cid);
    if (other && other !== session) {
      other.callback('onKickChar', 1);
      setTimeout(() => other.close(4001, 'character taken over'), 300);
    }
    session.characterId = doc._id;
    session.characterName = doc.name;
    this.scenes.bindCharacter(session, doc._id);
    // Effective stats (gear + buffs); current HP/MP are clamped to the effective max before they are sent.
    const stats = await this.stats.syncOnLogin(doc._id);
    return this.characters.toPlayerData(doc, await this.quests.loginInfo(doc._id), stats);
  }

  @Rpc('backToCharSelect', { requireCharacter: true })
  async backToCharSelect(session: Session): Promise<{ ok: true }> {
    await this.gateway.leaveCharacter(session); // party leave, onScenePlayerLeft, ... while the character is still bound
    this.scenes.leave(session);
    session.characterId = null;
    session.characterName = null;
    return { ok: true };
  }
}
