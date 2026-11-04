// Injectable trade registry: the pure TradeBook as a Nest provider. In memory only; trades vanish on restart.

import { Injectable } from '@nestjs/common';
import { TradeBook } from './trade-rules';

@Injectable()
export class TradeManager extends TradeBook {}
