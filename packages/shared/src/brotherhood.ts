// M14 phase C: sworn brotherhood (Kết bái) wire contract shared by server and client: tuning, NPC 1637 menu funcs, the push
// payloads (onAgreeSetBrother, onBrotherTitleUpdate), the Flash prompt texts (CALLBACK_S[196-207]) and the pure rules
// (title validation, fee). RPCs: beginBrother, becomeBrother, acceptNewMemToBrother, disbandBrothers, breakBrotherShip,
// updateBrotherTitle; pushes: onLeaderConfirmToBro, onAgreeSetBrother, onFailToBecomeBrother, onAcceptNewBroMem,
// onFailToAcceptNewBroMem, onSetBrotherTitle, onUpdateBrotherTitle, onBeginDisbondBrothers, onFailToDiabondBrothers,
// onBreakBrother, onBrotherTitleUpdate.

export const BROTHER = {
  titleId: 153,
  minLevel: 25,
  feePerMember: 2_000_000,
  titleGold: 300,
  leaveGold: 100,
  leavePenalty: 2500,
  minMembers: 2,
  maxMembers: 5,
  answerMs: 60_000,
  titleMax: 8,
} as const;

/** NPC 1637 Thánh Sứ Kết Bái (Tinh Linh Thành, map 10); menu funcs all start with `brother_` (Go npc_menu.go). */
export const NPC_BROTHER = { npcId: 1637, funcPrefix: 'brother_', questNpcFunc: 'open_npc_interaction_1637' } as const;

export const BROTHER_FUNC = {
  swear: 'brother_swear',
  title: 'brother_title',
  leave: 'brother_leave',
  disband: 'brother_disband',
  guide: 'brother_guide',
} as const;

/** Ceremony kinds: new group, newcomers joining a group, disbanding. */
export const BrotherKind = { SWEAR: 1, JOIN: 2, DISBAND: 3 } as const;
export type BrotherKindId = (typeof BrotherKind)[keyof typeof BrotherKind];

/** `onAgreeSetBrother({cname})`: the leader's name, shown in the [199] prompt. */
export interface AgreeSetBrother {
  cname: string;
}

/** `onBrotherTitleUpdate`: sets the character's `broT`; `enable` true would also select title 153 locally (H5 sends false). */
export interface BrotherTitleUpdate {
  cid: number;
  tname: string;
  enable: boolean;
}

/** `onAcceptNewBroMem(names, hasBrother)` is positional: `names` = newcomers (hasBrother true) or the brothers (false). */
export type AcceptNewBroMemArgs = [names: string[], hasBrother: boolean];

/** chooseCharactor extra: the group's title suffix (absent without a titled group). */
export interface BrotherLogin {
  broT: string;
}

/** Prompt texts: the Flash CALLBACK_S[196-207] strings (the server `onSystemSay` lines are in `BROTHER_SAY`). */
export const BROTHER_TEXT = {
  confirmTitle: (name: string) => `Xác nhận tốn ${BROTHER.titleGold} vàng để thiết lập danh hiệu thành '${name}' không?`,
  leave: `Bỏ kết bái sẽ bị xóa luôn danh hiệu, đồng thời giảm ${BROTHER.leavePenalty} điểm thân mật, mất ${BROTHER.leaveGold} tiền vàng. Xác nhận có muốn bỏ kết bái hay không?`,
  agree: (cname: string) => `'${cname}' muốn kết bái cùng bạn, xác nhận có kết bái không?`,
  refused: (name: string) => `'${name}' không đồng ý kết bái, kết bái thất bại`,
  leaderFee: 'Muốn kết bái nhóm trưởng phải trả 2 triệu bạc * số thành viên, xác nhận kết bái?',
  askTitle: `Kết bái thành công! Bạn có muốn thiết lập danh hiệu kết bái cho nhóm với giá ${BROTHER.titleGold} vàng không? Nếu muốn hãy chọn "Đồng ý"`,
  inputTitle: `Nhập danh hiệu kết bái (1-${BROTHER.titleMax} ký tự)`,
  acceptNew: (names: readonly string[]) => `Xác nhận muốn tiếp nhận ${names.join(', ')} kết bái?`,
  joinGroup: 'Xác nhận muốn thêm thành viên kết bái?',
  disband: 'Xác nhận muốn giải tán nhóm kết bái?',
  disbandRefused: (name: string) => `'${name}' không đồng ý, giải tán kết bái thất bại`,
  badTitle: `Danh hiệu kết bái phải dài 1-${BROTHER.titleMax} ký tự và không chứa ký tự đặc biệt.`,
  tabGuide: 'Lập đội với các huynh đệ đến gặp Thánh Sứ Kết Bái ở Tinh Linh Thành để kết bái, thêm người hoặc giải tán.',
} as const;

/** Server `onSystemSay` / toast lines (Go wording). */
export const BROTHER_SAY = {
  success: 'Kết bái thành công! Từ nay các ngươi là huynh đệ đồng tâm hiệp lực.',
  world: (names: string) => `Chúc mừng <font color='#FF9900'>${names}</font> đã kết nghĩa kim lan tại Thánh Sứ Kết Bái!`,
  fee: (n: number, silver: number) => `Kết bái ${n} người, đội trưởng cần trả ${silver} bạc.`,
  sent: 'Đã gửi lời mời kết bái, hãy chờ các thành viên đồng ý.',
  waiting: 'Ngươi đã đồng ý, hãy chờ các thành viên khác.',
  left: (name: string) => `${name} đã rời nhóm kết bái.`,
  dissolved: 'Nhóm kết bái chỉ còn một người nên đã giải tán.',
  youLeft: 'Ngươi đã rời nhóm kết bái.',
  disbanded: 'Nhóm kết bái đã giải tán.',
  joined: (names: string) => `${names} đã gia nhập nhóm kết bái.`,
  titleSet: (title: string) => `Danh hiệu nhóm kết bái: Kết Nghĩa Kim Lan-${title}. Mở bảng Danh hiệu để sử dụng.`,
  failed: (why: string) => `Kết bái thất bại: ${why}`,
  expired: 'Lời mời đã hết hạn.',
  notMember: 'Ngươi chưa kết bái với ai.',
  restart: 'Hãy nói chuyện lại với Thánh Sứ Kết Bái để bắt đầu kết bái.',
  teamChanged: 'Thành viên trong đội đã thay đổi, hãy nói chuyện lại với Thánh Sứ Kết Bái.',
  busy: 'Có thành viên đang chờ trả lời một lời mời kết bái khác, hãy thử lại sau.',
} as const;

/** Title rule of Go `NormalizeTitle`: trimmed, 1-8 characters, no `<>&|"'\[]{}%` and no control characters; null when invalid. */
export function normalizeBrotherTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const title = raw.trim();
  const length = [...title].length;
  if (length < 1 || length > BROTHER.titleMax) return null;
  for (const ch of title) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || '<>&|"\'\\[]{}%'.includes(ch)) return null;
  }
  return title;
}

/** Silver the leader pays: 2 000 000 per newcomer. */
export function brotherFee(newcomers: number): number {
  return BROTHER.feePerMember * Math.max(0, Math.trunc(newcomers));
}

/** Intimacy left after leaving: the row drops by 2500 with a floor of 0. */
export function leaveIntimacy(current: number): number {
  return Math.max(0, Math.trunc(current) - BROTHER.leavePenalty);
}
