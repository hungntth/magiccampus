# Character select screen: legacy client research (2026-11-04)

Legacy root: `E:\mcgame\docs\client` (paths below are relative to it unless absolute).
Everything marked **inferred** was not proven by a direct read.

## 1. Summary

The Flash screen is `CharSelectCanvas` (900x570, centred), a two-state Flex canvas (`choose` / `create`).
`choose` shows: the login-art JPEG as background, a large static class portrait (320x320 PNG, not an
animated sprite) at the top, and a teal "CanvasLogined" panel at the bottom with a title image, a row of
3 slot cards and a teal button strip. The preview is `ClassData.largeImgMale/Female` (class art, per
gender), NOT the equipped character. Our `ClassInfo` already carries `largeImgMale/Female`, so no sprite
rendering is required.

## 2. Key files

| File | Role |
|---|---|
| `view/view/compFore/CharSelectCanvas.as` | whole screen (choose + create states), 3195 lines |
| `view/view/comp/CharactorSelectCanvas.as` | one slot card (129x67): portrait + name + "LV n" + class |
| `view/view/LoginLayer.as:116,166` | instantiates `CharSelectCanvas` (FORE_C_C layer) |
| `view/view/compDragable/DPassPanel.as:579` | "Tạo lại pass" popup; sends `setDeletePass` |
| `view/view/compFore/ClassHeadCanvas.as` | class head icons in the create state |
| `config/Language.as:1993-2008, 3181, 4139-4173, 4421` | strings |
| `predef/GamePredef.as:118-119,778-779` | `DEFAULT_IMG_LOGIN`, glow filters |

## 3. Language strings (exact)

`CHARSELECTCANVAS_U` (`config/Language.as`):
- `[0]` (4139) "Tạo lại pass" -> `button14` (top-right of panel)
- `[8]`/`[30]` (4147/4169) "Chọn nhân vật" (title; in the skin it is baked into the PNG, see §5)
- `[22]` (4161) "Tạo nhân vật" -> `button6`; `[24]` (4163) "Vào game" -> `button5`
- `[25]` (4164) "Xóa nhân vật" -> `button7`; `[26]` (4165) "Quay lại" -> `button3`
- `[28]` (4167) "Khôi phục nhân vật" -> `button4` (restore, shown instead of delete for a char pending deletion)
- `[29]` (4168) "Bạn xác nhận khôi phục nhân vật :{cname}?"
- slot text: `"LV " + cLevel` (`CharactorSelectCanvas.as:203,338`), class name from `TBL_CLASS[classId].name`.

`CHARSELECTCANVAS_S`: `[9]` (1998) "Đang đăng nhập game, vui lòng chờ."; `[10]` (1999) "Đang xóa dữ liệu nhân vật, quá trình này cần khoảng 3 giây";
`[16]` (2005) "Xóa nhân vật" (input popup title); `[17]` "Sử dụng tên đã chọn đăng nhập"; `[18]` "Vui lòng điền tên nhân vật";
`[4]` "Tên điền chứa ký tự không hợp lệ, vui lòng kiểm tra lại!"; `[5]` "Tên điền quá dài, vui lòng kiểm tra lại!";
`[6]` "Vui lòng điền tên nhân vật!"; `[19]` special-character warning. `DELETE_BY_PASS[0]` (3181) "Mã bảo vệ (Mặc định: 123456)"; `[1]` "Mở khóa".
`CHARACTOR_DELETE[0]` (4421): "Nhân vật {cname} sẽ bị xóa hoàn toàn vào {hour} giờ {minutes} phút ngày {dates} tháng {month} năm {year}".

## 4. Layout (choose state), canvas 900x570 (`CharSelectCanvas.as:166-346, 871-872`)

All coordinates are relative to the 900x570 canvas (`canvas7`, the ViewStack page is 100%x100%).

| Element | x,y | size | Notes |
|---|---|---|---|
| `bgImg` | 0,0 | 900x570 | `source = ResManager.hash(DEFAULT_IMG_LOGIN)` (2559); Fade 0->1 on `complete` (1811-1815, 3042-3049) |
| `selectCharImg` | 300,0 | native (320x320), `scaleContent=false` | black round filter (`GamePredef.FILTER_BLACK_ROUND`, binding at 2132-2139); source = selected slot `cImgUrl` (1836) |
| `tileBtn` (Tile, style `CanvasLogined`) | 239,345 | 425x105 | hGap 7.5, paddingTop 32, paddingLeft 12 (206-223) |
| title `textinput1` (style `CharSelectTitle`) | 260, y=349 (state override 1722-1730) | w 114 | disabled/non-editable; the text is the skin art |
| button wrapper (style `ButtonWrapper`) | 237,467 | 430x50 | holds the 5 buttons (243-320) |
| `button5` "Vào game" | 35,11 in wrapper | w 84 | `LoginButton` skin |
| `button7` "Xóa nhân vật" | 135,11 | auto | `enabled:false` in MXML (274-276) and no code ever sets it true (only `.visible`, 1844/1851) -> it is permanently greyed out in the original |
| `button4` "Khôi phục nhân vật" | 135,11 | w 84 | `visible:false`; shown instead of button7 when selected char is pending deletion (1841-1847) |
| `button6` "Tạo nhân vật" | 235,11 | w 84 | enabled only when `charactorArr.length < 3` (2946); the screenshot's "Tạo nhân ..." is label truncation |
| `button3` "Quay lại" | 335,11 | auto | |
| `button14` "Tạo lại pass" | 560,315 | w 107 | `LoginButton` skin; the screenshot's top-right-of-panel button |
| `choos1` / `choos2` (paging arrows, `BtnLoginTurnLeft/Right`) | 200,395 / 673,395 | | hidden unless more than 3 chars (2925-2943, 1764-1779, 1533-1548) |
| empty-slot placeholders `canvas99`, `canvas100` | 203,10 / 300,10 (in tile) | 125x65 | style `RoundedGradientBorder`, added to the tile when only 1-2 slots are filled (2953-2964) = the dark rounded empty boxes |

Slot card (`CharactorSelectCanvas.as:63-145`): 129x67, style `CanvasStartBtnBack`; portrait `Image` x=12, 49x47,
`scaleContent` (source `cIconUrl = getIconUrl(char.iconCode)`, 288); three `RoundedLabel`s at x=61, w=58,
y=5 (name), y=24 ("LV n"), y=41 (class). Selected: `filters=[FILTER_CHAR_SELECTED]` = `GlowFilter(0xFFFFFF, 5, 10, 10, 3)` (`GamePredef.as:778`); deleted char: `alpha=0.5`, tooltip text from `CHARACTOR_DELETE[0]`.

## 5. Slot count / empty slots

- 3 visible slots per page; page size is the literal 3 (`onChoosTwo` 1077-1119, `onChoosOne` 1187-1245).
- Chars >3 -> paging arrows. No use of `maxCharSlots` in the view; the only cap is `button6.enabled = charactorArr.length < 3` (2946). `acountLv` (`_core.acountLv`, `aLevel`) is read but only reset to 0 on delete (1479-1480); `getAcountGold/Name` are unused here (**inferred**).
- Zero chars: `onCreate()` is called immediately (create state) (2905-2911).
- Empty slots are `RoundedGradientBorder` boxes, not buttons (not clickable).
- First slot of the page is auto-selected after a 100 ms `setTimeout(select, ...)` (2947-2951).

## 6. Flow / RPCs

`set charactorDataList` (2891) receives the char list (the `getCharList`-style list; our `CharListResponse.charList`).

- Select slot (`clickHandler`, 1461) -> `select()` (1827): swaps `selectCharImg`, enables `button5`; if `deleted` toggles `button7`/`button4` and writes HTML tips to `txtTips`.
- "Vào game" `onLogin` (1590-1602): if not deleted -> `remote.chooseCharactor(int(cid))`, wait text `S[9]`, `button5.enabled=false`. (Already ported: `chooseCharactor`.)
- "Xóa nhân vật" `onDelete` (1170) -> input popup (`PANEL_INPUT`, title `S[16]`, label `DELETE_BY_PASS[0]`) -> `delCharactor` (1403) -> `startDelete` (1473): wait text `S[10]` for 3 s, `remote.startDeleteChar(int(cid), MD5.hash(pass))`, `acountLv = 0`. Unreachable in practice (button disabled, see §4).
- "Khôi phục nhân vật" `reChar` (993-1008): Alert YES/NO with `U[29]`; YES -> `remote.restoreChar(guid, cid)`. Note the decompiled function shows the Alert even if `func` is unset; **inferred** decompiler artifact.
- "Tạo nhân vật" `onCreate` (2986-3003): `currentState = "create"`, focuses the name box, loads map 1 (TBL_MAP[1]) hit layer behind (map preview). Create state: footRing effect `ANI_CHAR_CRE`, `charImg` (190,30, 383x494), class head list `canvas6` (630,102, 165x380, 6 class heads at y=30..305 step 55, `CharCreBorder`), name input `inputNameCvs` (280,450, 165x28, maxChars 12) with dice `randName` (145,2), `enterGameBtn` (305,495, style `CharCreEnter`) -> `createNewCharactor` (2780-2805) validates (special chars `S[19]`, len>12 `S[5]`, empty `S[6]`, bad words) then `remote.newChar(_newChar)` (`_newChar` holds gender/class + name; built by `changeResAndDes`, line 2740 region).
- "Quay lại" `onReturn` (3064-3073): `_core.logout()`, show `FORE_L_R` (login/line screen), hide `FORE_C_C`, hide D_PASS panel, `remote.close()` (closes the socket!).
- "Tạo lại pass" `showDPass` (2613-2621) -> opens `D_PASS_PANEL.showPwdAgainCanvas()`; the panel sends `remote.call("setDeletePass", Responder, MD5(newPass), MD5(oldPass))` (`DPassPanel.as:579`). It is the *delete-protection code* ("Mã bảo vệ", default 123456), not the login password.
- Server RPCs already in our repo: `logout`, `newChar`, `chooseCharactor` (`server/src/modules/character/character.rpc.ts:43,60,68`). **Not present**: `startDeleteChar`, `restoreChar`, `setDeletePass` (grep of `server/src` for those names found nothing).
- Character list delivery path (callback name) was not traced here.

## 7. Assets

### 7.1 Background
- Source: `GamePredef.DEFAULT_IMG_LOGIN = "resource/ui/login.swf"` (`predef/GamePredef.as:118`); login screen uses `login1.swf` (119). Loaded by md5 of the path (`ResManager.hash`, **inferred** from the existing `hashPath = md5(logicalPath)` in `packages/shared/src/resurl.ts`).
- md5("resource/ui/login.swf") = `b911c53a10f1f1e643a1403efbe4d049`, md5("resource/ui/login1.swf") = `e54a86e5b08a07f85cff82d40353eebd`; both exist in `E:\mcgame\frontend\s\res\`, both 55141 bytes (**same art**).
- The already-extracted JPEG: `E:\mcgame\h5\public\img\login-bg.jpg` (55167 bytes, 900x570). Viewed: exactly the screenshot (sky, mountains, houses, robot rabbit at left). This is the file to copy. It is not in `E:\magiccampus\client\public` yet (no `img/` dir there).
- Mechanism: one DefineBitsJPEG2 inside the SWF (per `E:\mcgame\docs\memory\h5-client.md:78`).

### 7.2 Preview portrait
- `CharactorSelectCanvas.update` (255-290): `cImgUrl = getIconUrl(gender<=0 ? TBL_CLASS[classId].largeImgMale : largeImgFemale)`.
- Example class 1 (seed `data_tbl_class`): `large_img_male 4050070200001` -> `icon/creature/PC_MALE_200001.png` (md5 `16b660379c083d96e9bbb529f89d1e50`, 320x320 RGBA PNG, 66727 B); female `4050080200001` -> `icon/creature/PC_FEMALE_200001.png` (md5 `34e3e95de82dac415f4e96b4c1852b2e`). Verified present in `E:\mcgame\frontend\s\res`. Served by our server at `/res/<md5>` through `iconUrl(code)` (`client/src/assets.ts:7`). Class 4's `100001` variant decodes to `.jpg` (`3050080100001`) - extension varies, `iconUrl` already handles it.
- So "full-body character preview with weapon and idle animation" in the screenshot is a static class illustration (**the screenshot's idle animation is not in the code**: `selectCharImg` is an `Image`, no animation). Only the create state has the `ANI_CHAR_CRE` footRing effect and a `charImg` (same kind of image via `getIconUrl`, line 2755).

### 7.3 Skin symbols (Flex CSS skins in the main SWF)
Style name -> symbol: the CSS declarations were not decompiled, so this mapping is **inferred** from names, sizes and rendered look (all verified visually except where noted).

| styleName (MXML) | Symbol (after extraction) | Size | Note |
|---|---|---|---|
| `CanvasLogined` | `LoginStage_LoginStage/LoginPanel` | 90x86 | teal frame with corner ornaments; needs 9-slice (scale grid not decompiled) |
| `CharSelectTitle` | `LoginStage_LoginStage/ChooseCharacterTitle` | 128x21, ox/oy 2 | contains the "Chọn nhân vật" text art |
| `ButtonWrapper` | `LoginStage_LoginStage/ButtonWrapper` | 57x50 | button strip, 9-slice |
| `LoginButton` | `LoginButtonUp/Over/Down/Disabled` | 58x29 | disabled variant = the greyed "Xóa nhân vật" |
| `CanvasStartBtnBack` (slot) | `LoginStage_LoginStage/AvatarCanvas` | 116x61 | teal plate with 4 rivets; slot is 129x67 so 9-slice/stretch |
| `RoundedGradientBorder` (empty slot) | not extracted; use a CSS dark rounded box (**inferred** vendor of generic style, also used by AutoTaskBox) | | |
| `BtnLoginTurnLeft/Right` | `L1..L4` / `R1..R4` | 22x20 | up/over/down/disabled order **inferred** |
| `RoleName`, `CreateCharacterCanvas`, `StripeButton`, `ChannelButton*`, `Character{Red,Blue,Yellow}*` | present in same lib | | other login-stage skins |
| create state: `CharCreBorder`, `CharCreTitle`, `CharCreNameInput`, `CharCreEnter`, `Dice` | `LoginStage_CHA_CRE/*` (`_2544` 381x337, `title` 114x32, `1..4`, `nor/down/dis/pass` 20x21) and `LoginStage_CHA_CRE_new/*` | | names are numeric/inferred, check visually when needed |

Existing skins in `E:\magiccampus\client\public\ui\index.json` (1460 lines, 11 dirs): `MainStage_CharInfo`, `MainStage_ChatArea`, `MainStage_Emotions`, `MainStage_LocationBar`, `MainStage_ShortcutCanvas`, `MainStage_SystemBarButtons`, `MainStage_SystemBarButtons2`, `MainStage_TopRightButtonTray`, `MainStage_fuli`, `Panels_BagPanel`. **No `LoginStage_*` entries** -> all of §7.3 must be extracted.

### 7.4 Extraction (tested)
`swfui` always rewrites `<out>/index.json` with only the symbols it just rendered (`tools/swf/src/cli/swfui.ts:46`), so running it directly on `client/public/ui` would drop the existing 1460 lines of index. Safe options: render into a scratch dir and merge the index by hand/with a tsx one-off, or re-run with one combined `-match` that also includes the existing prefixes.

```powershell
# from E:\magiccampus
pnpm --filter @mc/swf-tools swfui -out <scratch-dir> -xor 1,2,0 -match '_embed_css_.*LoginStage_' E:/mcgame/frontend/s/6a41a5ba5c0006ab4e0c1321a2b05027.orig
```
I ran the equivalent with `-match '_embed_css_.*(Login|Char|Start|Canvas|Tab|Turn|Button)'` into a scratchpad: 313 symbols, 0 partial, 1 empty; the LoginStage_* output is the table above. Copy `LoginStage_LoginStage`, `LoginStage_CHA_CRE`, `LoginStage_CHA_CRE_new` plus merge their index entries into `client/public/ui/index.json`. Reference with `std('LoginStage_LoginStage/LoginPanel')` style keys (`skinUrl` = `/ui/<key>.png`, `client/src/ui/hud/skin.ts:25`). The background JPEG is not part of this (copy it from h5, §7.1).

## 8. Preview rendering and our data

- Flash: no sprite; just a PNG per class/gender. Our side: `ClassInfo.largeImgMale/largeImgFemale` already exist (`packages/shared/src/protocol.ts:66-67`, filled in `server/src/modules/character/character.rpc.ts:40-41`), and `screens.ts` already receives `classes: ClassInfo[]`.
- `CharListEntry` (`protocol.ts:41-51`): `id, name, level, classId, gender, deleted, createTime, iconCode, portraitCode`. Everything the card needs is there (portrait = `iconCode`, text = name / level / class lookup, preview = class art via `classId` + `gender`; Flash uses gender <= 0 as male, matching our `gender === 1` -> female in `character.service.ts:179`).
- Missing vs Flash: `delTime` (Flash reads `_arg_1.delTime` seconds; we only have `deleted: boolean`, so the "sẽ bị xóa hoàn toàn vào ..." tooltip cannot be drawn), and the server RPCs `startDeleteChar` / `restoreChar` / `setDeletePass`.
- `maxCharSlots` is unused by Flash (cap of 3 is a literal); showing `maxCharSlots` empty boxes is an H5 decision. Suggest: render `max(3, ...)` slots as Flash does and keep paging for more than 3.
- If a true animated equipped sprite is ever wanted: `client/src/game/Entity.ts` / `SheetAnim.ts` could draw `creature/PC_*` sheets, but equipment layers would need extra fields on `CharListEntry` (not present). Not needed for Flash parity.

## 9. Open questions

1. CSS style -> skin symbol mapping and 9-slice insets (CSS not decompiled); pick insets visually.
2. Is button7 ("Xóa nhân vật") really always disabled in the shipped client, or enabled by a patched client? The decompile shows no enabling path; the user's screenshot also shows it greyed, which agrees.
3. Callback/RPC that delivers the char list to `charactorDataList` was not traced.
4. `LoginStage_CHA_CRE` numeric symbol names (create screen) need visual identification if the create state is restyled.
5. `RoundedGradientBorder` and the `BasicGlowButton` glow-hover behaviour are not extracted.
