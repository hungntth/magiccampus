---
name: activities-client-map
description: Activity strip / daily / VIP / loop-quest file cluster, decoder quirks (weekday tokens, id->class via PanelLayer awk) and non-obvious facts
metadata:
  type: reference
---

- ActivityCanvas gating is entirely `type` driven (0 flag bool, 2 level>=flag, 3 state label via flag 0/1/2, 4 expRe>0); ids 0..83 = `GamePredef.as:2695-2768`,
  style names in `ActivityCanvas.ACTIVITY_STYLE_ARR`. The Go seed `data_tbl_activity.sql` is the only list source (original server list is not in the client).
- Panel class for a ViewManager id: `awk '/_local_1 = [A-Za-z0-9_]+;/{c=$3} /_local_1 = ViewManager\.X;/{print c}' view/view/PanelLayer.as`
  (DAILY_ACTIVITY=DailyActPanel, PANEL_GAMEINTRO=GameIntroPanel, PANEL_PM=PmPanel, PANEL_JXHD=JXHD, PANEL_AWARD=AwardPanel, PANEL_AWARD_ALL=AwardPanelAll).
- Calendar weekday tokens in embedded XML (`Time="1,3,5|20:00-20:20"`): `TimeUtil.decodeTimeObj` matches `getDay() == (d+1)%7` -> 0 = Monday, 6 = Sunday.
- DailyActPanel and GameIntroPanel duplicate the diary UI; diary chest thresholds 30/60/120/210/360, one claim per day (`ad`/`f` bool).
- `checkDoubleExpTime`, `queryPlant/queryGather/queryHerb/queryFishPool`, `mountInfo`: no call sites in the decompiled client.
- Loop quests: client has zero gating; `loopInfo.d[lid].canTake` + `loopList` ("l" of initQuestManager) drive everything; repair button shows when no quest has `subType == "7-<lid>"`.
- Big `xml`/embedded config blobs (BOSS_DAILY_CONFIG, xmlActivity) make `sed -n` dumps huge: always `cut -c1-200` or grep attribute names.
- `Language.as` arrays are re-assigned in later blocks (version overrides); last assignment wins.
