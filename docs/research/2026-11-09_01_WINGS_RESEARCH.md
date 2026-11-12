# Wings (M13 phase C, 13.3) research

Date 2026-11-09. Legacy repo path is `E:\mcgame` (read-only). Two-source rule: every binding fact below is confirmed by the Go handler/rules AND either the
legacy memory `docs/memory/wing-refine.md` or the Flash call sites (`docs/client/view/view/compDragable/WingFuncPanel.as`, `WingAdvancedPanel.as`,
`CharactorPanel.as:4167`). Go paths: `internal/presentation/rtmp/handlers/item/wing_*.go` (H), `internal/application/item/wing_*.go` (A).

## Wire contract (arg order / replies / pushes)

| RPC | Args | Reply | Sources |
|---|---|---|---|
| `wingJoin` | `mainId, {w1..w4}` | `{f:true,i,n:DTO,e,sid}` / `{f:false}` | H wing_join.go, WingFuncPanel.as:5594 |
| `wingSeniorJoin` | `mainId, [subIds]` (array may arrive `{"0":id}`) | same | H wing_join.go, WingAdvancedPanel.as:548 |
| `addWingStar` | `count 1..5, wingId, stoneId, upToNum` | `{equSlotId,itemSlotId,num,upgradeNum,flag}` | H wing_hole_star.go |
| `addWingHole` | `wingId, materialId` | `{f,i,h:code,ii,n}` | H wing_hole_star.go, WingFuncPanel.as:5019 |
| `addWingFeather` | `wingId, {"1".."10":{idx,flag}}` | inlaid count | H wing_feather.go |
| `featherDel` | `wingId, index 1..10` | bool | H wing_feather_del.go |
| `featherUpdate` | `featherRef, luckId, luckCount, once, tempBagFlag` | `{slotId,num,lSid,lnum,flag,finalNum}` | H wing_feather.go, WingFuncPanel.as:3177 |
| `featherMix` | `formulaRef, {"1":ref,"2":ref}, luckId, luckCount, luckBinded` | `{f,fid,fnum,i,lid,lnum}`, `fid -1` materials, `-2` luck | H wing_feather_mix.go, WingFuncPanel.as:4030 |
| `getFeatherData` | `wingId` | wing DTO | H wing_feather.go, WingFuncPanel.as:3394 |
| `changeWingPrefix` / `sureChangeWingPrefix` | `{e,i}` / `1\|-1` | `{f,sid,i,n:lines,ii,inum}` / `{f:"sure",i,n,e}` or `{f:"false"}` | H wing_prefix_bind.go, WingFuncPanel.as:3715 |
| `changeWingBind` / `sureChangeWingBind` | `wingId, materialId` / `1\|-1` | `{f,ii,n,b1,b2,b11,b12,mainProp1,mainProp2}` / `{f:"sure",b1,b2}` | same, as:4263 |
| `changeWingColor` + `onSureChangeWingColor` | `npcId` / `series` | push `showWingColorPanel([{color,res}x2])` / bool | H wing_dye.go (memory 2026-10-27) |
| `changeWingRes` | `index 0..2` | `{flag,newResCode}` | H wing_advance.go, as:4105 |
| `newWingAdvanced` / `showNewWingPro` / `buyCritItem` | `useCrit, mode` / - / `n` | none; push `onShowNewWingPro(state)`, `updateCritItemNum` | H wing_advance.go |
| `setWingHide` | `hide` | stored bool, `-1` on failure; pushes `onWingOff` / `onWingOn` | H wing_hide.go, CharactorPanel.as:4167 |
| `checkLimitWingEffect` | timer | dead (null) | Core.as:1669, memory 2026-10-28 |

`state` of `onShowNewWingPro` = `{num1,num2,level,curExp,nextExp,curAdd,nextAdd,basicPro,arr,curRescode,eid}`. `onWingOn {cid,resCode}` / `onWingOff {cid}`
to self + scene.

## Rules (tables in `packages/shared/src/wing.ts`)

- Join: `WING_JOIN_SUCCESS {100,80,50,30}` minus 5 per sub with another template, main colour < 4, subs unworn, same colour; VIP right 9 adds points for
  purple -> orange. Subs are consumed before the roll; success: colour+1, lines re-rolled, tid = main when all subs share it else uniform of the five.
  Light wing 1675: Go lets it fuse only with 1675/1676/1677/1678 (owner 2026-11-07, `WingJoinTIDsValid`); the plan text (1675 only with 1675) is older and
  was NOT followed.
- Senior join: blue (2) 4..10 subs `{50,53,58,65,74,85,100}`, purple (3) 4..16 `{30,33,36,40,44,49,54,60,66,73,81,90,100}`, same template + colour.
- Star: item 2906 x count, rate `100,100,90,80,70,60,50,30,30,30` by star x count / 5 (= H5 forge `starRate`), max 10, `upToNum > 0` repeats.
- Hole: 2907 x `{1,5,25,125,625}[holes of that parity]` + 50 000 silver, cap code `{22,22,22,33,55}`. Hole code = tens character (odd slots) + units pet (even slots).
- Feathers: odd holes = character, even = pet; budget per parity A/B/C 1, D 2, no repeated stat, feather colour <= wing colour. Upgrade 5 -> 1 at
  `{100,90,75,55}[colour] + 5 x luck(3021)`. Mix `60 % / 30 %` by product stat count + 10 x luck(3017). Remove: `{25k,125k,700k,4.5M,40M}` silver by feather
  colour, feather returns bound, wing becomes bound.
- Prefix: bound purple/orange, 2937 x `{3:5,4:15}` + 50 000; bind: bound blue+, 2843 x 10 + 30 000; both paid at the preview, roll waits for `sure*`.
  Line roll = template x `EQUIPT_QUALITY[q-1..q]`, q = `{0,5,10,15,20}[colour]`, bind 0..round(6 x M[q]) (purple 13, orange 21); bind re-roll 1..21.
- Advance: worn + bound + purple+, Linh Vu 3627 = 10 exp, crit charm 3628 x2/x5/x10 at 70/25/5, exp per level `{100..2800}` (half for 1675), mode 2 = until
  the next level; charm price = template gold (10), unbound gold only.
- Look: `20703900SSSVVV`; 001 white/green/blue, 002 purple, 003 orange; orange series 1..4 have looks at level 5 / 10; dye palettes for series 2/3/4
  (10 x Lông Vũ Ngũ Sắc 3677, two options never the current one).
- Stats (`aggregateWingStats`): level bonus `(WING_PRO_TOTAL_ADD[L-1]-1) x line` (mains after the star), odd-hole feathers; even-hole feathers feed every
  pet (`wing_pet_feather.go`) and push `onRefreshPetProp`.

## Assets measured (2026-11-09)

`client/public/sheets/equip` has 16 wing sheets (`EQUIP_WING_001001..004003`, `005003`, `061003..063003`); `server/resmap.json` lists the same 16. The level
looks (series 006-009, 035, 041, 047, 060) and every dye palette (010-059) are NOT in the cache: `WING_SHEET_CODES` gates them (look 1 / 2 and the dye are
refused with a clear note until the sheets exist; the pure rules are tested with an all-available predicate).

## User decisions applied (2026-11-09, supersede plan section 12 where they differ)

1. Star failure is level dependent. The legacy has such a table (Go `EquipStarFailStar`, help table 2026-10-25): 0 stays 0, 1..5 stars -> one lower, 6 -> 4,
   7 -> 5, 8 and 9 -> 0. Ported as `wingStarAfterFail` (`WING_STAR_FAIL_TO`, `WING_STAR_RESET_FROM`) with a "owner to confirm the numbers" comment.
2. New wings start with all 10 holes open (5 character on odd slots, 5 pet on even slots). `addWingHole` stays registered and refuses ("all open").
3. Go-invented constants stay (silver costs, crit odds, level exp, VIP bonus).
4. Paid previews stay in memory (`RefinePending`, cleared on disconnect).
5. Kỳ Linh worn count follows Go (not enforced; phase D).

## Deviations from the plan text

- `properties.wing.holes` replaces the Go `t1..t10` keys, so wing feathers never collide with the gem / magic weapon `t*` keys of the shared stat code.
- Feather names / stats travel with the wing view (`WingView.feathers`) and fusion formulas carry `featherMix`, because the client has no item tables.
- `GameDataService.TEMPLATE_FIELDS` gained `i3, n1, n2, n3` (feather lines and formula inputs were projected out).
- NPC 1502 / 1571 menu hooks (`dye_wings_orange`, `showWingFunc`) are not wired: the panel opens from the character panel and calls `changeWingColor`
  directly. `sureChangeWingColor` / `buyCritItem` confirmation strings are client-side.
