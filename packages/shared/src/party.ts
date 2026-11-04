// Party wire contract (multiplayer phase B): group RPC replies and pushes (legacy Group.as names, the `AKF` typo of
// groupAKFCidList kept), limits and the Flash onGroupCantJoin codes. `mList` is the Flash linked list; every push that
// carries it also carries the flat `members` array (H5 extension) so the DOM client does not walk the list.

/** Party limits (GamePredef MAX_GROUP_MEM_NUM, AFK_CAN_BACK_DIS, GROUP_FOLLOW_DISTANCE) and the H5 invite TTL. */
export const PartyLimits = {
  MAX_MEMBERS: 5,
  /** Pending invites and join requests expire after this long (H5; the legacy server had no expiry). */
  INVITE_TTL_MS: 60_000,
  /** unGroupAFK(true) needs the leader on the same map within this many pixels. */
  AFK_RETURN_DISTANCE: 300,
  /** Followers trail the previous non-AFK member at this distance (client-side animation). */
  FOLLOW_GAP: 45,
} as const;

/** `onGroupCantJoin(cid, code)` codes (GAMEPREDEF_S[525-529]). */
export const GroupCantJoinCode = {
  SPECIAL_STATE: 10,
  FULL: 20,
  IN_GROUP: 30,
} as const;

/** One party member as shown on the HUD and in the team menus. */
export interface GroupMember {
  cid: number;
  name: string;
  level: number;
  classId: number;
  gender: number;
  iconCode: string;
  isLeader: boolean;
  afk: boolean;
  mapId: number;
}

export interface MListNode {
  obj: GroupMember;
  next: MListNode | null;
}

/** Linked list, leader first (Flash `mList`); `head` is never null in a push. */
export interface MList {
  head: MListNode | null;
  len: number;
}

/** `onGroupJoined`: full party snapshot, sent to every member on join, leader change and after a follow move. */
export interface GroupJoined {
  groupCharactorList: GroupMember[];
  /** cids of AFK members (`AKF` typo is the legacy key). */
  groupAKFCidList: number[];
  mList: MList;
  /** H5 extension: same members as a flat array, leader first. */
  members: GroupMember[];
}

/** `onGroupInvited`; `dis: 'far'` when the inviter is on another map. */
export interface GroupInvited {
  cid: number;
  name: string;
  level: number;
  dis?: 'far';
}

/** `onGroupRequest` (to the leader): a player without a party asks to join. */
export interface GroupRequested {
  cid: number;
  name: string;
  level: number;
}

/** `onGroupDeny` (invite declined, to the inviter) and `onGroupRequestDeny` (request declined, to the applicant). */
export interface GroupDenyPush {
  cid: number;
  name: string;
}

/** `onGroupLeave`: `sid` left or was kicked; sent to the remaining members and to `sid`. */
export interface GroupLeavePush {
  sid: number;
  name: string;
  mList: MList;
  members: GroupMember[];
}

/** `onGroupGiveLeader` (after an updated onGroupJoined). */
export interface GroupGiveLeaderPush {
  sid: number;
  oName: string;
  tid: number;
  nName: string;
  mList: MList;
  members: GroupMember[];
}

/** `onGroupAfk` / `unGroupAfk` pushes and the `groupAFK` / `unGroupAFK` replies (`cid` only). */
export interface GroupAfkPush {
  cid: number;
  mList: MList;
  members: GroupMember[];
}

/** `groupAFK()` / `unGroupAFK(near)` reply. */
export interface GroupAfkReply {
  cid: number;
}

/**
 * H5 push `onGroupFlag`, broadcast to the map when a character's party flags change (the Flash client only learned them
 * from scene payloads and the polled getCharLeaderClient). Drives the leader flag over the entity.
 */
export interface GroupFlagPush {
  cid: number;
  inGroup: boolean;
  isLeader: boolean;
  groupAfk: boolean;
}
