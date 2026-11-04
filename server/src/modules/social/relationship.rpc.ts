// Friend / blacklist RPCs (legacy names): initViewImC (-> onInitViewImC push), addRelationByName (-> onAddRelationship /
// onAddRelationByName(-1, type)), delRelationship (-> onDelRelationship). Logic lives in RelationshipService.

import { Injectable } from '@nestjs/common';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { isRelationType, normalizeName } from './relationship-rules';
import { RelationshipService } from './relationship.service';

@Injectable()
export class RelationshipRpc {
  constructor(private readonly relations: RelationshipService) {}

  @Rpc('initViewImC', { requireCharacter: true })
  async initViewImC(session: Session): Promise<null> {
    await this.relations.sendSnapshot(session);
    return null;
  }

  @Rpc('addRelationByName', { requireCharacter: true })
  async addRelationByName(session: Session, args: unknown[]): Promise<null> {
    const name = normalizeName(args[0]);
    if (!name) throw RpcException.invalidArgs('name');
    const type = Number(args[1]);
    if (!isRelationType(type)) throw RpcException.invalidArgs('type');
    await this.relations.addByName(session, name, type);
    return null;
  }

  @Rpc('delRelationship', { requireCharacter: true })
  async delRelationship(session: Session, args: unknown[]): Promise<null> {
    const id = Number(args[0]);
    if (!Number.isInteger(id) || id <= 0) throw RpcException.invalidArgs('id');
    await this.relations.remove(session, id);
    return null;
  }
}
