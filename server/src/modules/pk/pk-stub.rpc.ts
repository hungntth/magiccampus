// Duel-invite family stubs (M14 phase H, decision 9): pkInvite, pkInviteResp, pkReady, pkAction, pkSurrender, pkLeave. The Flash client never
// calls them and has no handler for their pushes, so they are registered (the legacy names stay valid) and refuse with a note.

import { Injectable } from '@nestjs/common';
import { PK_STUB_NOTE } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';

const refuse = (): never => {
  throw RpcException.forbidden(PK_STUB_NOTE);
};

@Injectable()
export class PkStubRpc {
  @Rpc('pkInvite', { requireCharacter: true })
  pkInvite(): null {
    return refuse();
  }

  @Rpc('pkInviteResp', { requireCharacter: true })
  pkInviteResp(): null {
    return refuse();
  }

  @Rpc('pkReady', { requireCharacter: true })
  pkReady(): null {
    return refuse();
  }

  @Rpc('pkAction', { requireCharacter: true })
  pkAction(): null {
    return refuse();
  }

  @Rpc('pkSurrender', { requireCharacter: true })
  pkSurrender(): null {
    return refuse();
  }

  @Rpc('pkLeave', { requireCharacter: true })
  pkLeave(): null {
    return refuse();
  }
}
