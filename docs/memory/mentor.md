# Mentor / Sư đồ (M14 phase B)

Plan: `docs/plans/2026-11-04_17_SOCIAL_PVP.md` §2.2 / §3.4-3.5 / §7 B. Legacy: `E:\mcgame\docs\memory\mentor-system.md`, Go `application/mentor/*`, `handlers/mentor/*`, `domain/mentor/mentor.go`. Implemented 2026-11-12. Relationship rows (type 5) come from phase A (`social.md`).

## Contract (`packages/shared/src/mentor.ts`)
- Tables: `TEACHER_RANK_TITLES` (rank 0..6), `STUDENT_NUM` 0/5/10/15/20/25/30, `TEACHER_UPGRADE_POINTS` `[-, 2e5, 8e5, 2e7, 2e8, 1e9]` (points are not spent). Helpers `studentCap`, `rankTitle`, `upgradePoints`, `canUpgradeTeacher`, `reportGain(last, cur, levelExp)` (floor of 10 % of the exp of every level gained), `formatLl` / `parseLl`.
- Flash texts for the f codes: `FIND_TEACHER_TEXT` (IMPANEL_S[30-36]), `FIND_STUDENT_TEXT` (IMPANEL_S[38-44, 86]), `MENTOR_TEXT`.
- Login extras on `PlayerData`: `ti` ("-1" none, string), `tn`, `tl`, `tp` (numbers), `ll` ("<last level>|<exp>"). `onUPP` may carry `tl` / `tp` (`PlayerUpdate`).

## Server `modules/mentor/`
- Files: `mentor-rules.ts` (pure: `checkPair`, f codes, refusal texts, NPC lock, `levelExp`), `mentor-pending.ts` (in-memory requests 5 min keyed by pair + direction, NPC drafts 60 s), `mentor.schema.ts`, `mentor-state.service.ts` (rank row + upgrade), `mentor.service.ts` (find / accept / link / dissolve), `mentor-report.service.ts` (report, initTS, login fields), `mentor-npc.service.ts` (NPC 49 menu, quest 692 hook), `mentor.rpc.ts`, `mentor.module.ts` (login extra + disconnect cleanup).
- State: `mentor_links` (unique `studentId`, `teacherId`, `lastLevel`, `exp`, `honor`, `npc`, `fb`, `since`; one row serves both sides' view) + feature row `mentor` `{tl, tp}` through `FeatureStoreService`. Tutor relationship rows (type 5, both directions) via `RelationshipService.link`.
- Locks: `withKeyLock('mentor:<teacherId>')` around link / dissolve / report / upgrade / rank changes (not reentrant: `*Locked` methods are for callers already inside). The relationship locks (`rel:<id>`) are separate. Link row is inserted first (unique index guards a double teacher), then the tutor rows (rolled back on failure); dissolve deletes the link first.
- RPCs (none quiet; mutating ones `forbidInBattle`):
  - `initTS` -> push `onInitTS([{id, name, ll, honor}])`, reply null.
  - `findTeacher(name)` -> `{t:2, f}`; `findStudent(name)` -> `{t:1, f}`. f 1 waiting, 2 offline, 3 not found, 4 level, 5 has teacher, 6 self / full / no rank / pair block, 8 (findStudent) the target is your own teacher. On f 1 the target gets `onFindTeacher {t:1, i, n}` / `onFindStudent {t:2, i, n}`.
  - `acceptStudent(studentId)` (teacher) / `acceptTeacher(teacherId)` (student): consume the live request (expired -> toast "Lời mời sư đồ đã hết hạn hoặc không tồn tại!"), re-check, link; pushes `onMakeTS {t:1|2, i, n, l}` to teacher then student, [`onUPP {tl}` + title when an NPC link promoted the teacher], `onInitViewImC` to both. Reply null.
  - `reportTS()` -> `{t:2, f, ll?}` (1 ok, 2 no teacher, 3 level not above the last report, 4 teacher offline); teacher gets `onReportTS {t:1, i, n, tp, ll}`. Honor += levels gained.
  - `delST(studentId)` / `delTeacher()`: `onDelST {t:1|2, i, n}` to both, `onInitViewImC` to both; rows go back to friend rows when the pair held a friend row in either direction before (`fb`), else are deleted.
  - `upTeacher()` -> reply `{t:1, tl, tp}`, push `onUPP {tl, tp}` + rank title (TitleService grant). Refusal toast "Điểm chức nghiệp chưa đủ để thăng cấp!".
  - `npcFuncOther(49, 1)` -> push `tutorFuncAlert {i: leaderId}`; `confirmTutor()` links the caller with the current party leader (NPC pair).
- Pairing rules (Go): no self, student has no teacher, no reverse link, teacher rank >= 1 and Lv >= 30 and >= student level (gap 0), free slot, no enemy / couple / brother / black row between them (friend / tutor rows are fine). Refusals of accepts are `RpcException.forbidden` toasts with the Go texts; `findTeacher` / `findStudent` / `reportTS` answer through the reply code.
- Rank 1: quest 692 turn-in (`QuestGates.onFinished`, outside the character lock; pushes `onUPP {tl:1}` + title 1) or the NPC 49 flow (a rank-0 leader becomes rank 1), or lazily: at login (silent, no push) and when a request names a Lv 30+ rank-0 teacher who finished 692 (`QuestService.completedToday(cid, 692)` = completed ever for this type-1 quest).
- NPC pairs (`npc: true`) are locked until the student is Lv 30 (toast "Quan hệ tiến cử tạm thời không thể giải trừ (đồ đệ cần đạt cấp 30)!" on delST / delTeacher). NPC 49 rules: leader Lv >= 30, member Lv <= 20, leader online, the member must have passed `npcFuncOther` within 60 s (draft) and the leader must be unchanged at `confirmTutor`.
- NPC 49: its data row stands on **map 100, which has no map data** (a placeholder in the legacy game too), so H5 registers a per-viewer instance NPC at `NPC_TUTOR.hub` (map 1 Xuất Vân Thôn, 1090 / 930; owner may move it). Click -> `onList` menu ("Nhiệm vụ" when it has quests, "Tiến cử thành viên nhóm" = func `tutor_recommend`) through `NpcHookRegistry`; `npcFuncOther` requires the NPC visible on the caller's map.
- Cleanup: pending requests and drafts are dropped on disconnect and character leave.

## Client
- `game/MentorController.ts` (created by `FriendController`, which got a `player` host field; registers the "Sư đồ" tab through `registerTab`, same id replaces the placeholder), `ui/im/mentorTab.ts` (teacher block with Hồi báo / Xóa sư phụ, rank block with name box + Bái sư / Nhận đồ đệ / Thăng cấp, student grid with Xóa đồ đệ), `ui/im/mentorWarn.ts` (+ `mentor.css`: request boxes with Đồng ý / Từ chối, 5 min).
- Flash local rules kept: `findStudent` is refused while `tl == 0` with IMPANEL_S[37]. Own delete actions suppress the "đã giải trừ" line; the other side gets it. The grid refreshes when stale (> 5 s) on every tab render, after `onReportTS` / `onMakeTS` / rank-up. `onTutorAlert` -> confirm "Xác nhận nhóm trưởng hiện tại là người tiến cử?" -> `confirmTutor`.

## Tests and smoke
- `packages/shared/src/mentor.test.ts` (7), `server/src/modules/mentor/mentor-rules.test.ts` (15: eligibility, codes, texts, lock, level exp, pending / draft expiry).
- ws smoke (scratchpad `m14_b_smoke.mjs`, 69 checks): both find directions, wrong-direction accept, f codes, rank 0 refusal, push orders, fb rows, initTS, report gain, upTeacher gate, delST / delTeacher, cap, enemy block, offline, NPC flow incl. lock until Lv 30, Lv 25 member refusal, quest 692 hook, login lazy promotion. Browser: warn box, tab, Hồi báo, NPC menu + refusal toast, Xóa sư phụ.

## Deferred / owner questions
- NPC 49 hub position (map 1) is a choice; no graduation (xuất sư), no report items (no award rows), no mentor achievement metric. Quiet the new RPCs after the user confirms.
