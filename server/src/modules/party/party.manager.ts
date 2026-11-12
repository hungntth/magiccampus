// Injectable party state: the PartyBook rules bound to the wall clock. In memory only; parties vanish on restart.

import { Injectable } from '@nestjs/common';
import { PartyBook } from './party-rules';
import { RoomBook } from './room-rules';

@Injectable()
export class PartyManager extends PartyBook {
  constructor() {
    super(() => Date.now());
  }
}

/** M14 F: recruit-room cooldowns and applications (in memory), bound to the wall clock. */
@Injectable()
export class RoomManager extends RoomBook {
  constructor() {
    super(() => Date.now());
  }
}
