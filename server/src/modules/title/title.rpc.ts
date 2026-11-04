// Title RPCs: gtl, setTitle(id | -1), setActTitle(id | -1). Pushes: upLongBuff / delBuff(0) (title buff row), onUPP (stats),
// onTitleUpdate / onActTitleUpdate (map broadcast), onAddTitle / onAddActTitle (grants, see TitleService.grant).

import { Injectable } from '@nestjs/common';
import type { SetActTitleResult, SetTitleResult, TitleList } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { TitleService } from './title.service';

function titleArg(args: unknown[]): number {
  const id = Number(args[0]);
  if (!Number.isInteger(id)) throw RpcException.invalidArgs('titleId');
  return id;
}

@Injectable()
export class TitleRpc {
  constructor(private readonly titles: TitleService) {}

  @Rpc('gtl', { requireCharacter: true })
  gtl(session: Session): Promise<TitleList> {
    return this.titles.list(session.characterId!);
  }

  @Rpc('setTitle', { requireCharacter: true, forbidInBattle: true })
  setTitle(session: Session, args: unknown[]): Promise<SetTitleResult> {
    return this.titles.setTitle(session, titleArg(args));
  }

  @Rpc('setActTitle', { requireCharacter: true, forbidInBattle: true })
  setActTitle(session: Session, args: unknown[]): Promise<SetActTitleResult> {
    return this.titles.setActTitle(session, titleArg(args));
  }
}
