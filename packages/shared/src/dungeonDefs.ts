// M10 phụ bản definitions (Go application/dungeon defs.go, *_defs.go and every RegisterRunRules call), pure data shared by the
// server and the hub panel. Phase B enables quyhutmau, mehuyen, khobau and khobau_event; the other rows are filled and enabled by
// their phases (C: luctien, lietdiem, langhuyet; D: thamhiem, thegioiso). The daily lock is always "until the next 00:00".

import type { DungeonDef, DungeonFloorDef, DungeonRules } from './dungeon.js';

const WARN = [30, 10, 5, 1] as const;

function floor(maps: number[], parts: Partial<Omit<DungeonFloorDef, 'maps'>> = {}): DungeonFloorDef {
  return { maps, bosses: [], extra: [], steps: [], quest: 0, ...parts };
}

function rules(r: Omit<DungeonRules, 'singleEntry' | 'leaderQuests' | 'warnMinutes'>): DungeonRules {
  return { singleEntry: true, leaderQuests: true, warnMinutes: WARN, ...r };
}

const normal = (plan: string, expPerLevel: number) => [{ level: 1, name: 'Thường', chestPlan: plan, expPerLevel }];

export const DUNGEONS: readonly DungeonDef[] = [
  {
    key: 'quyhutmau', name: 'Quỷ Hút Máu', level: 120, openQuest: 5453, ticket: 3444, ticketName: 'Thư Cầu Cứu Kỳ Quái',
    exitMap: 67, entrances: [1759],
    floors: [floor([69], { bosses: [1732, 1733, 1734, 1735, 1736, 1737, 1740, 1741], quest: 5452 })],
    floorNpcs: { 1742: 0 },
    chest: { npc: 1744, map: 69, x: 650, y: 280, plan: '3-9100501' },
    rules: rules({ durationMin: 180, ejectMap: 67, ejectName: 'Vĩnh Dạ Cảng', minGroup: 2, landX: 410, landY: 280, difficulties: normal('3-9100501', 4000) }),
    autoTaskIds: [10, 11, 12], enabled: true,
  },
  {
    key: 'khobau', name: 'Kho Báu Đại Mạc', level: 60, openQuest: 1464, ticket: 293, ticketName: 'Nghi Thức Thạch Bản',
    exitMap: 14, entrances: [198, 442],
    floors: [
      floor([500], { bosses: [684, 685] }),
      floor([501], { bosses: [686], extra: [898, 899, 900] }),
      floor([502], { bosses: [687, 688], extra: [901, 902, 903, 904, 905] }),
      floor([503], { quest: 1462, extra: [906, 907] }),
      floor([504], { bosses: [689], extra: [908] }),
    ],
    floorNpcs: { 190: 0, 191: 1, 192: 2, 1706: 2, 193: 3, 194: 4 },
    chest: { npc: 1941, map: 504, x: 700, y: 400, plan: '3-90101' },
    rules: rules({ durationMin: 180, ejectMap: 9, ejectName: 'Đông Huyền Thành', minGroup: 1, finalBoss: 689, difficulties: normal('3-90101', 3000) }),
    autoTaskIds: [2], enabled: true,
  },
  {
    key: 'luctien', name: 'Lục Tiên Cảnh', level: 80, openQuest: 3812, ticket: 1973, ticketName: 'Chìa Khóa Tiên Cảnh',
    exitMap: 35, entrances: [969],
    floors: [
      floor([505], { quest: 3813, extra: [967] }), floor([506], { quest: 3814 }), floor([507], { quest: 3816 }),
      floor([508], { quest: 3817 }), floor([509], { bosses: [984], quest: 3821 }),
    ],
    floorNpcs: { 968: 0, 1039: 2, 819: 3 },
    chest: { npc: 2010, map: 509, x: 640, y: 1290, plan: '3-90201' },
    rules: rules({ durationMin: 120, ejectMap: 35, ejectName: 'Băng Tuyết Nguyên', minGroup: 1, difficulties: normal('3-90201', 3000) }),
    autoTaskIds: [3], enabled: true,
  },
  {
    key: 'lietdiem', name: 'Liệt Diễm Thâm Uyên', level: 90, openQuest: 5003, ticket: 2845, ticketName: 'Truyền Thuyết Thâm Uyên',
    exitMap: 23, entrances: [1559],
    floors: [floor([517], { quest: 5185 }), floor([518], { quest: 5186 }), floor([519], { quest: 5187 }), floor([520], { quest: 5188 })],
    floorNpcs: { 1560: 0, 1568: 1, 1570: 2, 1580: 3 },
    chest: { npc: 1583, map: 520, x: 600, y: 1430, plan: '3-9100301' },
    rules: rules({ durationMin: 180, ejectMap: 23, ejectName: 'Phục Ma Cốc', minGroup: 3, difficulties: normal('3-9100301', 4000) }),
    autoTaskIds: [4, 5, 6], enabled: true,
  },
  {
    key: 'langhuyet', name: 'Lang Huyệt Động', level: 100, openQuest: 3985, ticket: 2016, ticketName: 'Răng Sói Bạch Kim',
    exitMap: 28, entrances: [992],
    floors: [
      floor([510], { quest: 3989 }), floor([511], { quest: 3990 }),
      floor([512, 513], { mapNames: ['Tây', 'Đông'], quest: 3991 }), floor([514], { quest: 3992 }),
    ],
    floorNpcs: { 1056: 0, 952: 1, 1072: 3 },
    chest: { npc: 1068, map: 514, x: 960, y: 790, plan: '3-9100401' },
    rules: rules({ durationMin: 180, ejectMap: 9, ejectName: 'Đông Huyền Thành', minGroup: 3, difficulties: normal('3-9100401', 4000) }),
    autoTaskIds: [7, 8, 9], enabled: true,
  },
  {
    key: 'mehuyen', name: 'Mê Huyễn Động', level: 50, openQuest: 5239, ticket: 3018, ticketName: 'Hoa Mê Ảo',
    exitMap: 33, entrances: [1616],
    floors: [floor([2003], { bosses: [1619], quest: 5241 }), floor([2004], { bosses: [1621, 1622, 1624], quest: 5243 })],
    floorNpcs: { 1617: 0, 1618: 1 },
    chest: { npc: 1625, map: 2004, x: 1990, y: 930, plan: '3-90001' },
    rules: rules({
      durationMin: 180, ejectMap: 9, ejectName: 'Đông Huyền Thành', minGroup: 2,
      difficulties: [
        { level: 1, name: 'Dễ', chestPlan: '3-90001', expPerLevel: 2000 },
        { level: 2, name: 'Thường', chestPlan: '3-90002', expPerLevel: 3000 },
        { level: 3, name: 'Khó', chestPlan: '3-90003', expPerLevel: 4000 },
      ],
    }),
    autoTaskIds: [1], enabled: true,
  },
  {
    key: 'khobau_event', name: 'Kho Báu Đại Mạc [Sự kiện]', level: 50, openQuest: 5554, ticket: 7201, ticketName: 'Ủy Thác Điều Tra Đặc Biệt',
    exitMap: 14, entrances: [2596],
    floors: [
      floor([600], { bosses: [2574, 2575], quest: 5547 }),
      floor([601], { quest: 5548 }),
      floor([602], { bosses: [2586, 2587, 2588, 2589, 2590, 2591], quest: 5550 }),
      floor([603], { bosses: [2593, 2594], quest: 5552 }),
      floor([604], { bosses: [2595], quest: 5553 }),
    ],
    floorNpcs: { 2573: 0, 2576: 1, 2585: 2, 2592: 3, 2597: 4 },
    chest: { npc: 1564, map: 604, x: 700, y: 400, plan: '3-90101' },
    rules: rules({ durationMin: 180, ejectMap: 14, ejectName: 'Hư Không Mạc', minGroup: 1, difficulties: normal('3-90101', 3000) }),
    autoTaskIds: [], enabled: true,
  },
  {
    key: 'thamhiem', name: 'Thám Hiểm Di Tích', level: 50, openQuest: 50378, ticket: 6104, ticketName: 'Bản Đồ Di Tích',
    exitMap: 42, entrances: [2513],
    // Go thamhiem_defs.go: steles / relic objects / quiz / Briget are steps (marked in the run), the five Quái Nguyên Tố and the two
    // trap objects are once-per-run extras, the six Vệ Sĩ TM spots (runtime ids 9225201-206) are the floor-6 bosses.
    floors: [
      floor([582], { steps: [2476, 2477, 2478, 2479, 2480], extra: [2481, 2482, 2483, 2484, 2485] }),
      floor([583], { steps: [2488, 2490], extra: [2489, 2491] }),
      floor([584], { bosses: [2511] }),
      floor([585]),
      floor([586], { steps: [2498] }),
      floor([587], { bosses: [9225201, 9225202, 9225203, 9225204, 9225205, 9225206], steps: [2500] }),
      floor([588], { bosses: [2508, 2509] }),
    ],
    floorNpcs: { 2486: 0, 2487: 0, 2492: 1, 2493: 2, 2496: 3, 2499: 4, 2507: 5 },
    chest: { npc: 2510, map: 588, x: 970, y: 520, plan: '' },
    rules: rules({ durationMin: 180, ejectMap: 42, ejectName: 'Cổ Đạo', minGroup: 1, finishOnChest: true, difficulties: normal('', 3000) }),
    autoTaskIds: [16], enabled: true,
  },
  {
    key: 'thegioiso', name: 'Thế Giới Số', level: 151, openQuest: 50332, ticket: 5973, ticketName: 'Thời Không Đăng',
    exitMap: 88, entrances: [2411],
    floors: [
      floor([578], { bosses: [2414, 2415], quest: 50334 }), floor([579], { bosses: [2437] }),
      floor([580], { bosses: [2418, 2419], quest: 50336 }),
    ],
    floorNpcs: { 2412: 0, 2420: 0, 2441: 1, 2413: 2 },
    chest: { npc: 2443, map: 580, x: 560, y: 1510, plan: '' },
    rules: rules({ durationMin: 180, ejectMap: 88, ejectName: 'Thiên Không Thành', minGroup: 1, difficulties: normal('', 5000) }),
    autoTaskIds: [13, 14, 15], enabled: true,
  },
];

/** "Tầng N <tên>" (Go FloorLabel). */
export function dungeonFloorLabel(d: DungeonDef, floorIndex: number): string {
  return floorIndex < 0 || floorIndex >= d.floors.length ? d.name : `Tầng ${floorIndex + 1} ${d.name}`;
}
