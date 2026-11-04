// Character stats, attribute allocation, buffs and level constants (M1 character core).
// Wire types for changeProperty / getCharDetailData / lvUp, the stat-refresh onUPP `property`, long buffs and the
// bag-operation pushes. LEVEL_EXP is the legacy cumulative table (Go player_level_exp.go), copied as data.

export const AUTO_LEVEL_CAP = 20;
export const MAX_LEVEL = 160;
export const ATTR_POINTS_PER_LEVEL = 5;

/** Cumulative exp table: reaching level L needs LEVEL_EXP[L - 1] (161 entries, levels 1..161; Go player_level_exp.go). */
export const LEVEL_EXP: readonly number[] = [
  1, 73, 358, 926, 1775, 3162, 5360, 8649,
  13232, 18510, 25771, 38644, 62425, 98030, 139609, 187700,
  242854, 305634, 376620, 456403, 545587, 717011, 906836, 1116173,
  1346151, 1597921, 1872656, 2171545, 2495799, 2846648, 3225339, 3872914,
  4568755, 5314933, 6113546, 6966720, 7876610, 8845396, 9875286, 10968516,
  12127346, 13958479, 15894402, 17938602, 20094609, 22365986, 24756337, 27269299,
  29908546, 32677789, 35580773, 39909930, 44440326, 49177442, 54126808, 59294002,
  64684650, 70304425, 76159046, 82254281, 88595943, 97641138, 107040501, 116802195,
  126934442, 137445524, 148343787, 159637634, 171335530, 183445997, 200125583, 217377226,
  235212503, 253643068, 272680653, 292337065, 312624185, 333553972, 355138455, 377389742,
  400320010, 430987144, 481135878, 544632067, 609975310, 677197405, 746330331, 817406242,
  890457474, 965516537, 1119715703, 1311889013, 1509175146, 1711654712, 1919408737, 2132518665,
  2351066353, 2575134073, 2804804502, 3040160730, 3281286249, 3643071467, 4137048416, 4642787454,
  5160454786, 5690217397, 6232243037, 6786700227, 7353758250, 7933587150, 8526357728, 9219328851,
  9927982209, 10652481000, 11392988425, 12149667685, 12922681978, 13712194506, 14518368467, 15341367063,
  16181353493, 17360652416, 18564504541, 19793145487, 21160780456, 22555971857, 23978976728, 25550975059,
  27153661571, 28787314722, 30708351167, 32927971392, 35456588954, 38304752050, 41483143517, 45002580833,
  48874016114, 53108536117, 57717362239, 62711850518, 68103491630, 73823200061, 79880194932, 86459105254,
  93402868044, 100722929301, 108501826395, 116647097207, 125168179055, 134261045691, 143758162043, 153840933347,
  164332614724, 175229703451, 186541855042, 198273024113, 210446658418, 223074858412, 236104176058, 249573971320,
  263494117908,];

/** Final stats shown on the character panel (legacy `player.property`, final* keys). */
export interface CharProperty {
  finalHp: number; finalMp: number; finalSp: number;
  finalAttack: number; finalMAttack: number; finalDefence: number; finalMDefence: number;
  finalHit: number; finalDodge: number; finalCritical: number; finalSpeed: number; finalCriticalDamage: number;
  finalStrength: number; finalAgility: number; finalStamina: number; finalIntelligence: number; finalEnergy: number;
  lastPoint: number; // free attribute points
  aptStrength: number; aptAgility: number; aptStamina: number; aptIntelligence: number; aptEnergy: number; // distributed
}

/** changeProperty arg (strings like the Flash client; "" = 0). */
export interface ChangePropertyArg {
  addStrength: string; addAgility: string; addStamina: string; addIntelligence: string; addEnergy: string;
}

/** getCharDetailData reply: the 26 secondary rates (all 0 without gear/buff rates in M1). */
export type CharDetailData = Record<string, number>;

export const BuffType = { BATTLE: 1, TIMED: 2, PERMANENT: 3, UNIQUE: 10 } as const;

/** initLongBuff value / upLongBuff payload. */
export interface LongBuff {
  id: number; // row id
  bid: number; // data_tbl_buff id
  type: number;
  name: string; // H5 extension
  iconCode: string; // H5 extension (resource code string)
  info: string; // H5 extension: description for the tooltip
  removable: boolean; // H5 extension: template buff == 1
  battleLeft?: number;
  timeAll?: number; // seconds
  addTime?: number; // unix seconds
  timeLeft?: number; // seconds
  ineffectiveTime?: number; // epoch ms
}
export type InitLongBuff = Record<string, LongBuff>;

/** onItemSort entry (sids). */
export interface ItemSortEntry { oldId: number; newId: number; stackNum: number; }

/** fullHpRecoverByItem / fullMpRecoverByItem entry: sid is the item id (legacy naming). */
export interface RecoverEntry { sid: number; priority: number; }

export interface EquipOnReply { success: boolean; equipItems: import('./inventory.js').BagItem[]; }
export interface OkReply { success: boolean; }
