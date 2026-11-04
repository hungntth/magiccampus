// Achievements (M7 phase B): login snapshot, live progress push, claim push and the H5 catalog RPC. Pure helpers only.
// Flash: AchievementPanel.updateView(type, id, obj) (type 1 = achievement `id` finished, obj.done = ms timestamp; type 2 = requirement
// `id` progress changed, obj {progress, done}); getAchieveAward(aid) is fire-and-forget. Push names are not in the decompiled
// CallBack, so the Go names are used: onUpdateAchieve(type, id, obj), updateAchieveAwardLog({aid, num}), onAchieveTitle(name).

/** An achievement is finished iff `achieveLog[aid] > ACHIEVE_DONE_MIN` (AchievementPanel `_MAX_ACH_CHECK_VERSION`). */
export const ACHIEVE_DONE_MIN = 999_999;

/** Panel tabs (kind 1..6, ACHI_KIND_TYPE parents). */
export const ACHIEVE_KINDS: readonly { kind: number; label: string }[] = [
  { kind: 1, label: 'Cá nhân' },
  { kind: 2, label: 'Pet' },
  { kind: 3, label: 'Giao lưu' },
  { kind: 4, label: 'PVP' },
  { kind: 5, label: 'PVE' },
  { kind: 6, label: 'Sinh hoạt' },
];

/** `achieveReqLog[requirementId]` (keyed by REQUIREMENT id, as the client reads it). */
export interface AchieveReqProgress {
  /** 0 while open, the completion timestamp (ms) once the requirement is met. */
  done: number;
  progress: number;
}

/** Login payload fields (PlayerData.achieveLog / achieveReqLog / takeAchieveAwardLog / achPnt). */
export interface AchieveSnapshot {
  achPnt: number;
  achieveLog: Record<string, number>;
  achieveReqLog: Record<string, AchieveReqProgress>;
  takeAchieveAwardLog: Record<string, number>;
}

/** `onUpdateAchieve(type, id, obj)` arguments. */
export interface UpdateAchieveArgs {
  type: 1 | 2;
  id: number;
  obj: { done?: number; progress?: number };
}

/** `updateAchieveAwardLog` push: the reward of `aid` was claimed (`num` > 0). */
export interface AchieveAwardLog {
  aid: number;
  num: number;
}

export interface AchieveReqEntry {
  id: number;
  /** Requirement label (show_type 1 checklist / show_type 2 progress bar caption). */
  name: string;
  /** Threshold: the resolved target for tracked requirements, else the raw `num`. */
  num: number;
  showType: number;
}

/** One row of the panel (data_tbl_achievement joined with its requirements). */
export interface AchieveEntry {
  id: number;
  name: string;
  description: string;
  detail: string;
  /** Reward text (tooltip of the claim button). */
  desc: string;
  /** Achievement points. */
  award: number;
  color: number;
  kind: number;
  type: number;
  /** 0 = no reward, 1 / 2 = claimable (2 = title). */
  isAward: number;
  /** False when H5 has no event source for the requirement: it can never complete. */
  tracked: boolean;
  reqs: AchieveReqEntry[];
}

/** `getAchieveList` reply (H5 RPC: the client has no static tables). */
export interface AchieveCatalog {
  entries: AchieveEntry[];
}

/** True when `log[aid]` marks the achievement finished. */
export function isAchieveDone(log: Readonly<Record<string, number>> | undefined, aid: number): boolean {
  return (log?.[String(aid)] ?? 0) > ACHIEVE_DONE_MIN;
}

/** Display text of a requirement progress bar: `done/num`. */
export function reqProgressText(progress: number, num: number): string {
  return `${Math.min(progress, num)}/${num}`;
}
