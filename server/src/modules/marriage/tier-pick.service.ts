// Hall tier picked at Cupid / Nguyệt Lão (phase E): in memory, 30 minutes. Phase D only provides the store; the NPC menu entries
// `marriage_book_1..3` (phase E) call `set`, the booking RPC reads `get` (0 = no pick: "Hãy chọn loại lễ đường ở Cupid").

import { Injectable } from '@nestjs/common';
import { TierPicks } from './marriage-rules';

@Injectable()
export class TierPickService extends TierPicks {}
