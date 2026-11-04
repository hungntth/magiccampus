// Injectable party state: the PartyBook rules bound to the wall clock. In memory only; parties vanish on restart.

import { Injectable } from '@nestjs/common';
import { PartyBook } from './party-rules';

@Injectable()
export class PartyManager extends PartyBook {
  constructor() {
    super(() => Date.now());
  }
}
