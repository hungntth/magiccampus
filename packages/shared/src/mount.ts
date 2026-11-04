// M8 phase D mount ("Thú Cưỡi", Flash MountPanel / Creature.beginMounting): contracts. Flash names: getMountList, checkHaveMount, renewMount(dressId),
// addMountExp(mode), addMountUpExp, beginMounting(dressId), stopMounting; pushes (Go names): onAddMountExp, onUpdateDressList, onMountOn, onMountOff.
// Login carries `mountInfo` (Go sent it as a JSON string; H5 sends the object). Templates: data_tbl_mount (type 1 levels, type 2 evolutions),
// data_tbl_mount_dress (18 skins).

export const MountItem = { FEED: 3804, EVOLVE: 3805, EVOLVE_ADV: 6273 } as const;
/** From this evolution rank the advanced evolve item is needed (Go advUpLevThreshold). */
export const MOUNT_ADV_UPLV = 8;
export const MOUNT_RENEW_DAYS = 30;
/** H5 gate of checkHaveMount (Go: ClassRank >= 1; H5 has no class rank, the Flash tab needs level 50). */
export const MOUNT_MIN_LEVEL = 50;

export interface MountInfo {
  lv: number;
  upLv: number;
  exp: number;
  addRate: number;
  addRateDay: string;
  /** owned skins `{ "<dressId>": 1 }` */
  dressData: Record<string, number>;
  /** dress being ridden, -1 when on foot */
  useDress: number;
  getDate: number;
}

export interface MountDressView {
  id: number;
  name: string;
  resCode: string;
  iconCode: string;
  /** renewal price in gold (0 = not for sale) */
  gold: number;
  /** minutes of a timed skin, 0 = permanent */
  effectiveTime: number;
  owned: boolean;
  /** expiry ms, 1 = permanent, 0 = not owned */
  expiry: number;
}

/** Next-evolution requirement the panel shows (H5 extra; Flash reads TBL_MOUNT). */
export interface MountEvolveView {
  itemId: number;
  need: number;
  /** base success percent */
  rate: number;
  /** lucky points gained per failure */
  addRateStep: number;
}

export interface MountListReply {
  mountList: number[];
  mountOverdueList: number[];
  useDress: number;
  exp: number;
  addRate: number;
  lev: number;
  upLv: number;
  /** H5 extras */
  dresses?: MountDressView[];
  levelCap?: number;
  /** cumulative exp that reaches level i + 1 (type 1 rows) */
  levelExp?: number[];
  evolve?: MountEvolveView | null;
  /** percent bonuses of the current evolution row while riding */
  stats?: { life: number; phyAttack: number; magAttack: number; phyDefense: number; magDefense: number };
}

/** addMountExp reply and onAddMountExp push. */
export interface AddMountExpReply {
  addExp: number;
  exp: number;
  lev: number;
}

/** addMountUpExp reply and onAddMountExp push: success carries upLv + lev, failure addExp = lucky points gained. */
export interface AddMountUpExpReply {
  addExp: number;
  addRate: number;
  upLv?: number;
  lev?: number;
}

export interface MountOnPush {
  cid: number;
  resCode: string;
  wp: number;
}

export interface MountOffPush {
  cid: number;
  isMountOn: false;
  wp: number;
  ee: number;
  ef: number;
  star: number;
}

/** onUpdateDressList: action 1 = acquired / renewed, 2 = expired. */
export type UpdateDressListArgs = [action: number, id: number, expiryMs: number];

export interface MountLogin {
  mountInfo: MountInfo;
}
