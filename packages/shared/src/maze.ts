// M10 phase G: Mê Trận (maze) wire types, constants and event texts (legacy MazePanel / MazeInfoPanel / MazeDiscPanel /
// MazeShopPanel / MazeLotteryPanel / MazeQuestionPanel; contract: research 2026-10-10_01_MAZE_RESEARCH.md section 4-6).
// RPCs: getMazePreDate, refreshMaze, enterMaze, getMazeData, mazeConfirm, mazeSkip, mazeBuySkipNum, mazeBuyRecoverNum, mazeLeave,
// mazeRecover({recover}), answerMazeQuestion({answerNum, rightNum}), getMazeShopItem, buyMazeShopItem({sid, index}), mazeDrop({index}),
// getMazeLottery. Pushes: updateMazeInfoData, upMazeBuff, showMazeDiscPanel, showMazeQuestionPanel, showMazeShopPanel,
// showMazeLotteryPanel, leaveMaze. H5 extensions (optional keys): question texts, shop / lottery item names + icons, answer letter.

export const MAZE_COLS = 6;
export const MAZE_ROWS = 9;
export const MAZE_CELLS = MAZE_COLS * MAZE_ROWS;
export const MAZE_START_CELL = 0;
export const MAZE_END_CELL = MAZE_CELLS - 1;
export const MAZE_MIN_LEVEL = 120;
export const MAZE_MAX_CHEST = 5;
export const MAZE_QUIZ_SIZE = 5;
export const MAZE_MAX_DROPS = 4;
export const MAZE_LOTTERY_CARDS = 5;
export const MAZE_BUY_COST_GOLD = 5;
/** Copy rooms live on these template maps (scene room key `maze:<cid>`; the copy id is 2e9 + cid). */
export const MAZE_TEMPLATE_MAPS: readonly number[] = [2007, 2008, 2009];
export const isMazeTemplateMap = (mapId: number): boolean => MAZE_TEMPLATE_MAPS.includes(mapId);
/** Door instance NPCs: 900000 + direction (1 up, 2 down, 3 left, 4 right); the pending event NPC is 900010. */
export const MAZE_DOOR_BASE = 900000;
export const MAZE_EVENT_NPC_ID = 900010;
export const MAZE_ROOM_X = 720;
export const MAZE_ROOM_Y = 490;
/** Activity strip id of the lobby (BtnMiZhen). */
export const MAZE_ACTIVITY_ID = 27;

export interface MazePreData {
  preData: { level: number; cost: number; refreshNumFree: number; enterNumRemain: number };
}

/** State object of getMazeData / updateMazeInfoData / mazeConfirm / mazeSkip / mazeBuy*: counters, visited cells "0".."52", currentIndex, mazeBuff. */
export type MazeState = { actNum: number; skipNum: number; recoverNum: number; currentIndex?: number; mazeBuff?: Record<string, number> | null } & Record<string, unknown>;

export interface MazeShopItem {
  itemId: number;
  sid: number;
  goldBefore: number;
  goldAfter: number;
  name?: string; // H5: the client has no item table
  iconCode?: string;
}
export interface MazeShopItems {
  item1: MazeShopItem;
  item2: MazeShopItem;
}

export interface MazeLotteryCard {
  itemId: number;
  n: number;
  name: string;
  iconCode: string;
}
export interface MazeLotteryPanel {
  planId: Record<string, number>;
  drop: Record<string, true>;
  cost: Record<string, number>;
  finished: boolean;
  cards?: Record<string, MazeLotteryCard>; // H5: keyed like planId (1..5)
}

export interface MazeQuizText {
  t: string;
  a: string;
  b: string;
  c: string;
  d: string;
}
export interface MazeQuestionPanel {
  question: Record<string, number>;
  answerNum: number;
  rightNum: number;
  totalNum: number;
  texts?: Record<string, MazeQuizText>; // H5: TBL_ANSWER text of each picked id (the right letter stays on the server)
}
/** answerMazeQuestion argument; `choice` (A-D) is the H5 addition that lets the server grade the answer. */
export interface MazeAnswerArgs {
  answerNum: number;
  rightNum: number;
  choice?: string;
}

/** H5 reply of answerMazeQuestion (Flash ignores it): the graded step, so the panel can show the right letter. */
export interface MazeAnswerReply {
  accepted: boolean;
  right: boolean;
  letter: string; // the right option
  answerNum: number;
  rightNum: number;
}

export interface MazeDropReply {
  index: number;
  dropNum: number;
}
export interface MazeLotteryReply {
  index?: number;
}

/** MAZE_DISC_U[1..14]: event names. */
export const MAZE_EVENT_NAME: Readonly<Record<number, string>> = {
  1: 'Tâm Khiêu Ma Pháp',
  2: 'Không Gian Mộng Ảo',
  3: 'Giảm Thiểu Hành Động',
  4: 'Gia Tăng Hành Động',
  5: 'Tuyền Thủy Sinh Mệnh',
  6: 'Cạm Bẫy Chí Mạng',
  7: 'Nữ Thần May Mắn',
  8: 'Giảm Giá Tinh Phẩm',
  9: 'Khai Mở Bảo Rương',
  10: 'Đáp Án Trí Tuệ',
  11: 'Quái Vật Làm Loạn',
  12: 'Tiểu Đội Tinh Anh',
  13: 'Mật Lâm Ngộ Tập',
  14: 'Khiêu Chiến BOSS',
};

/** MAZE_DISC_U[15..28]: effect texts. */
export const MAZE_EVENT_TEXT: Readonly<Record<number, string>> = {
  1: 'Chuyển đến 1 vị trí ngẫu nhiên trong phạm vi từ 1 - 2 ô, không biết ai là đối thủ đang chờ bạn phía trước?',
  2: 'Chuyển đến Điểm Đầu hoặc Điểm Cuối, là thiên thần hay ác quỷ? Hãy chuẩn bị tinh thần đi!',
  3: 'Không may bạn đã trúng phải gian kế của kẻ địch, giảm ngẫu nhiên từ 1 – 3 Lực Hành Động.',
  4: 'Từ sâu thẳm rừng già xuất hiện đám tâm linh, tăng ngẫu nhiên từ 1 – 3 Lực Hành Động.',
  5: 'May mắn gặp phải Giếng Sinh Mệnh, nhân vật và pet hồi phục 20% HP',
  6: 'Không may gặp phải Cạm Bẫy Chí Mạng, bạn và pet mất 20% HP',
  7: 'Nữ Thần May Mắn đã đến, bạn và pet ngẫu nhiên tăng 20% tấn công, tốc độ, phòng ngự và giới hạn HP',
  8: 'Chúc mừng bạn có cơ hội mua vật phẩm quý với 1 cái giá hời!',
  9: 'Bạn đã may mắn nhận được bảo rương, bên trong chứa nhiều phần thưởng giá trị!',
  10: 'Để ta thử thách trí thông minh của ngươi, trả lời ta 5 câu đi! Trả lời đúng sẽ nhận thưởng! Và đương nhiên đáp sai sẽ bị trừng phạt.',
  11: 'Khi gặp Quái Vật làm loạn (độ khó thường), chiến thắng sẽ nhận thưởng, thất bại thì HP của nhân vật và pet giảm 20%',
  12: 'Khi gặp Tiểu Đội Tinh Anh (độ khó thường), chiến thắng sẽ nhận thưởng, thất bại thì HP của nhân vật và pet giảm 20%',
  13: 'Khi gặp Mật Lâm Ngộ Tập (độ khó thường), chiến thắng sẽ nhận thưởng, thất bại thì HP của nhân vật và pet giảm 20%',
  14: 'Khi khiêu chiến BOSS, chiến thắng sẽ nhận thưởng, thất bại thì HP của nhân vật và pet giảm 20%',
};

/** Events whose popup has no Skip button (4 Gia Tăng, 5 Tuyền Thủy, 7 Nữ Thần, 8 shop, 9 lottery). */
export const MAZE_NON_SKIPPABLE: readonly number[] = [4, 5, 7, 8, 9];
export const mazeCanSkip = (type: number): boolean => !MAZE_NON_SKIPPABLE.includes(type);

/** MAZE_PANEL_U[10..14, 15..19]: chest levels 1-5. */
export const MAZE_CHESTS: readonly { name: string; color: string; reward: string }[] = [
  { name: 'Bảo Rương Trắng', color: '#ffffff', reward: 'x1 Công Trạng hoặc x5 exp, Dược Thủy Nuôi Dưỡng Thú Cưỡi*1, Ngọc Vinh Quang*1, có cơ hội nhận Ấn Chương Mê Trận' },
  { name: 'Bảo Rương Lục', color: '#7FFF00', reward: 'x2 Công Trạng hoặc x7.5 exp, Dược Thủy Nuôi Dưỡng Thú Cưỡi*2, Dược Thủy Tiến Hóa Thú Cưỡi*1, Ngọc Vinh Quang*1, có cơ hội nhận Ấn Chương Mê Trận' },
  { name: 'Bảo Rương Lam', color: '#3b8cff', reward: 'x3 Công Trạng hoặc x12.5 exp, Dược Thủy Nuôi Dưỡng Thú Cưỡi*3, Dược Thủy Tiến Hóa Thú Cưỡi*2, Ngọc Vinh Quang*2, có cơ hội nhận Ấn Chương Mê Trận' },
  { name: 'Bảo Rương Tím', color: '#c060ff', reward: 'x4 Công Trạng hoặc x20 exp, Dược Thủy Nuôi Dưỡng Thú Cưỡi*4, Dược Thủy Tiến Hóa Thú Cưỡi*5, Ngọc Vinh Quang*3, có cơ hội nhận Ấn Chương Mê Trận' },
  { name: 'Bảo Rương Cam', color: '#FFD306', reward: 'x5 Công Trạng hoặc x35 exp, Dược Thủy Nuôi Dưỡng Thú Cưỡi*9, Dược Thủy Tiến Hóa Thú Cưỡi*10, Ngọc Vinh Quang*4, 100% nhận Ấn Chương Mê Trận' },
];

/** MAZE_PANEL_U[27] / [28]: the client decides the refresh toast from the old and new level. */
export function mazeRefreshResult(oldLevel: number, newLevel: number): string {
  return newLevel === oldLevel && oldLevel !== MAZE_MAX_CHEST ? 'Làm mới thất bại' : 'Làm mới thành công';
}
