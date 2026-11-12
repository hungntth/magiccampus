// NPC 1637 Thánh Sứ Kết Bái menu (Go handlers/brotherhood/npc_menu.go): click -> onList ("Nhiệm vụ" first when the NPC has quests,
// "Kết bái", member-only title / leave / disband, "Hướng dẫn kết bái"); the `brother_*` funcs claim the npcScript picks. The
// title / leave picks answer with the client prompts (onUpdateBrotherTitle / onBreakBrother), which then call the RPCs.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { BROTHER, BROTHER_FUNC, NPC_BROTHER, type NpcMenuOption } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { NpcHookRegistry } from '../npcscript/npc-hooks.registry';
import { sendList, systemSay } from '../npcscript/menu';
import { QuestService } from '../quest/quest.service';
import { TEXT } from './brother-rules';
import { BrotherhoodService } from './brotherhood.service';
import { BrotherhoodStore } from './brotherhood.store';

export const BROTHER_GUIDE = [
  'Hướng dẫn kết bái',
  `1. Lập đội ${BROTHER.minMembers}-${BROTHER.maxMembers} người (cấp ${BROTHER.minLevel} trở lên), mọi thành viên phải là bạn bè của nhau và cùng có mặt ở đây; đội trưởng chọn "Kết bái".`,
  '2. Đội trưởng trả 2 triệu bạc x số thành viên, mọi thành viên đồng ý là kết bái thành công.',
  `3. Sau khi kết bái có thể đặt danh hiệu nhóm với giá ${BROTHER.titleGold} vàng; mọi huynh đệ nhận danh hiệu "Kết Nghĩa Kim Lan-(tên nhóm)" (chọn trong bảng Danh hiệu).`,
  '4. Muốn thêm huynh đệ: cả nhóm cùng người mới lập đội đến gặp ta, mỗi người mới tốn 2 triệu bạc.',
  `5. Rời nhóm tốn ${BROTHER.leaveGold} vàng, mất danh hiệu và giảm ${BROTHER.leavePenalty} điểm thân mật với các huynh đệ. Giải tán cần tất cả huynh đệ cùng trong đội và đồng ý.`,
  '6. Danh hiệu Kết Nghĩa Kim Lan tăng tấn công và phòng thủ khi đang đeo trong bảng Danh hiệu.',
];

@Injectable()
export class BrotherNpcService implements OnModuleInit {
  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly brothers: BrotherhoodService,
    private readonly store: BrotherhoodStore,
    private readonly quests: QuestService,
    private readonly gameData: GameDataService,
  ) {}

  onModuleInit(): void {
    this.hooks.onClick('brother-npc', (s, npc) => this.click(s, npc.nid), 50);
    this.hooks.onScript('brother-npc', (s, func) => this.script(s, func), 50);
  }

  private async click(session: Session, npcId: number): Promise<boolean> {
    if (npcId !== NPC_BROTHER.npcId) return false;
    const npc = this.gameData.getNpc(npcId);
    const options: NpcMenuOption[] = [];
    const q = await this.quests.listForNpc(session.characterId!, npcId);
    if (Object.keys(q.list).length > 0) options.push({ label: 'Nhiệm vụ', func: NPC_BROTHER.questNpcFunc });
    options.push({ label: 'Kết bái', func: BROTHER_FUNC.swear });
    let info = String(npc?.on_service_text ?? '');
    const group = await this.store.groupOf(session.characterId!);
    if (group) {
      info += `\nHuynh đệ kết bái: ${group.members.map((m) => m.name).join(', ')}`;
      if (group.title) info += `\nDanh hiệu nhóm: ${group.title}`;
      options.push(
        { label: `Đặt danh hiệu kết bái (${BROTHER.titleGold} vàng)`, func: BROTHER_FUNC.title },
        { label: 'Rời nhóm kết bái', func: BROTHER_FUNC.leave },
        { label: 'Giải tán nhóm kết bái', func: BROTHER_FUNC.disband },
      );
    }
    options.push({ label: 'Hướng dẫn kết bái', func: BROTHER_FUNC.guide });
    sendList(session, npcId, String(npc?.name ?? ''), info, options);
    return true;
  }

  private async script(session: Session, func: string): Promise<boolean> {
    if (!func.startsWith(NPC_BROTHER.funcPrefix)) return false;
    switch (func) {
      case BROTHER_FUNC.swear:
        await this.brothers.startSwear(session);
        return true;
      case BROTHER_FUNC.title:
        await this.requireMember(session);
        session.callback('onUpdateBrotherTitle');
        return true;
      case BROTHER_FUNC.leave:
        await this.requireMember(session);
        session.callback('onBreakBrother');
        return true;
      case BROTHER_FUNC.disband:
        await this.brothers.startDisband(session);
        return true;
      case BROTHER_FUNC.guide:
        for (const line of BROTHER_GUIDE) systemSay(session, line); // an NPC bubble would cut the long text
        return true;
      default:
        return false;
    }
  }

  private async requireMember(session: Session): Promise<void> {
    if (!(await this.store.groupOf(session.characterId!))) throw RpcException.forbidden(TEXT.notMember);
  }
}
