// NPC 1860 Long Bối Tế Tự (map 38): click -> onList with the guide, the offline medal claim ("battlefield_extra_reward") and the monthly
// title claim ("battlefield_get_title"); answers go out as onNpcMsg. The extra reward is refused while a run is open (settlement pays
// online players; this pays the ones who were offline); the title needs lifetime medals and is granted once per UTC+7 month.

import { Injectable, type OnModuleInit } from '@nestjs/common';
import { THREE_PVP } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { npcMsg, sendList } from '../npcscript/menu';
import { NpcHookRegistry } from '../npcscript/npc-hooks.registry';
import { ThreePvpProgressService } from './threepvp-progress.service';
import { ThreePvpState } from './threepvp-state';

export const THREE_PVP_NPC = {
  TITLE: 'Long Bối Tế Tự',
  INTRO: 'Nơi này đã từng là một chiến trường khốc liệt, chỉ có những dũng sĩ tài năng mới trở thành truyền nhân chân chính.',
} as const;

const FUNCS = { guide: 'battlefield_guide', extra: 'battlefield_extra_reward', title: 'battlefield_get_title' } as const;

export const THREE_PVP_NPC_TEXT = {
  GUIDE: 'Chiến Trường Dũng Sĩ mở cửa vào 19:00 - 22:00 thứ sáu hằng tuần (giờ Việt Nam) cho dũng sĩ cấp 50 trở lên. Hãy bấm biểu tượng sự kiện, lập phòng 1 đến 3 người, '
    + 'bấm sẵn sàng rồi để trưởng phòng bắt đầu; hệ thống tự ghép đối thủ. Thắng nhận 3 / 6 / 10 điểm, thua hoặc hòa nhận 1 / 2 / 3 điểm theo số người trong phòng. '
    + 'Kết thúc sự kiện, người xếp hạng cao nhận Huy Chương Dũng Sĩ (điểm x 10 cộng thưởng hạng) để đổi vật phẩm và nhận danh hiệu tại đây.',
  OPEN: 'Chiến Trường đang mở cửa, hãy nhận phần thưởng sau khi sự kiện kết thúc.',
  NOTHING: 'Bạn không có phần thưởng nào chưa nhận.',
  CLAIMED: (medals: number): string => `Bạn đã nhận ${medals} Huy Chương Dũng Sĩ.`,
  NO_TITLE: 'Huy Chương Dũng Sĩ tích lũy của bạn chưa đủ để nhận danh hiệu.',
  TITLE_DONE: 'Chúc mừng! Danh hiệu Dũng Sĩ đã được trao cho bạn (30 ngày).',
  TITLE_USED: 'Tháng này bạn đã nhận danh hiệu rồi, hãy quay lại vào tháng sau.',
} as const;

@Injectable()
export class ThreePvpNpc implements OnModuleInit {
  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly state: ThreePvpState,
    private readonly progress: ThreePvpProgressService,
  ) {}

  onModuleInit(): void {
    this.hooks.onClick('threepvp-npc', (s, npc) => this.click(s, npc.id), 60);
    this.hooks.onScript('threepvp-npc', (s, func) => this.script(s, func), 60);
  }

  private click(session: Session, npcId: number): boolean {
    if (npcId !== THREE_PVP.NPC_ID) return false;
    sendList(session, npcId, THREE_PVP_NPC.TITLE, THREE_PVP_NPC.INTRO, [
      { label: 'Hướng dẫn Chiến Trường Dũng Sĩ', func: FUNCS.guide },
      { label: 'Nhận phần thưởng còn lại', func: FUNCS.extra },
      { label: 'Nhận danh hiệu Dũng Sĩ', func: FUNCS.title },
    ]);
    return true;
  }

  private async script(session: Session, func: string): Promise<boolean> {
    const say = (text: string): void => npcMsg(session, THREE_PVP.NPC_ID, text);
    if (func === FUNCS.guide) say(THREE_PVP_NPC_TEXT.GUIDE);
    else if (func === FUNCS.extra) await this.extra(session, say);
    else if (func === FUNCS.title) await this.title(session, say);
    else return false;
    return true;
  }

  private async extra(session: Session, say: (t: string) => void): Promise<void> {
    if (this.state.phase() !== 'closed') return say(THREE_PVP_NPC_TEXT.OPEN);
    const out = await this.progress.claimExtra(session.characterId!, null);
    say(out.medals > 0 ? THREE_PVP_NPC_TEXT.CLAIMED(out.medals) : THREE_PVP_NPC_TEXT.NOTHING);
  }

  private async title(session: Session, say: (t: string) => void): Promise<void> {
    const r = await this.progress.claimTitle(session.characterId!, Date.now());
    say(r.status === 'done' ? THREE_PVP_NPC_TEXT.TITLE_DONE : r.status === 'claimed' ? THREE_PVP_NPC_TEXT.TITLE_USED : THREE_PVP_NPC_TEXT.NO_TITLE);
  }
}
