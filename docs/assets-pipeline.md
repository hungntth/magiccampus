# Asset pipeline: Flash SWF → H5

All tools live in `tools/swf` (TypeScript workspace package `@mc/swf-tools`, run with `tsx`, no build
step). From that folder run `pnpm <tool> [flags]`, e.g. `pnpm swfinfo -brief <md5>`; flags keep the
Go-style `-name value` form. Inputs are the md5-named blobs of the old resource CDN
(`D:\mcgame\frontend\s\res`, override with `-cache`).

Source layout: `src/swf/` (container, tags, shapes, timelines, bitmap decoding via `jpeg-js`/`pngjs`),
`src/sheet/` (atlas + animation JSON, UI symbol composer), `src/render/` (vector rasterizer), `src/png.ts` (PNG writer), `src/gojson.ts` (JSON writer that
keeps the byte-exact format of the original Go tools), `src/cli/` (one file per tool).

## What is inside the SWFs (3 822 files)

| category        | count | meaning                                                                 |
|-----------------|------:|-------------------------------------------------------------------------|
| bitmap-anim     | 1478  | JPEG3 bitmaps placed on a labeled timeline (creatures, NPCs, equipment)  |
| bitmap-static   | 1354  | one or a few bitmaps, no labels (scene items, effects, icons)            |
| bitmap-sprites  |  324  | bitmaps inside nested DefineSprite clips                                 |
| mixed           |  227  | bitmaps plus some vector shapes                                          |
| vector          |  274  | pure vector art (UI skins, some effects) — needs JPEXS export            |
| no-graphics     |  165  | `MAP_HIT_NEW.swf` walkability data (122) + loaders                       |

Creature SWFs: 24 fps, 704 frames, 64 frame labels `dir-behavior`, no vector art. The only script is
the `GameResInst` document class (extends `com.qeedoo.game.resource.GameRes`), whose constructor sets
per-resource anchor metrics: `midX, footY, bodyX, bodyY, bodyWidth, bodyHeight, headY, eyeY, mouthY,
handY, totalWidth, totalHeight`. The Flash client positions every resource at `(-midX, -footY)`
(`CreatureView.setPosSprite`), so the feet sit on the entity position.

- **Directions** (counter-clockwise from south): `0=S 1=SW 2=W 3=NW 4=N 5=NE 6=E 7=SE`.
  Left/right variants share bitmaps and differ only by a horizontal flip in the placement matrix.
- **Behaviors** (index observed in the exported data, names from the client's `AbstractGameRes`):
  `0 BREATH_SLOW (stand) · 1 RUN_FAST · 2 RUN_NORMAL · 3 ATTACK · 4 HURT · 5 DEAD · 6 DEFENCE · 7 MAGIC`.
  Index 5/6/7 are inferred; verify when combat is ported.
- Stage origin is the top-left of the frame (200×150 for PC, varies per NPC/creature). Feet are at
  `(midX, footY)` from `GameResInst` — e.g. PC_MALE_000001 `(100, 102)`, NPC_CRE_000001 `(83, 112)`;
  do not derive them from the frame size.

## Tools

| tool        | purpose |
|-------------|---------|
| `swfinfo`   | JSON structural dump of one SWF (tags, sprites, labels, symbols). |
| `swfscan`   | Classifies every SWF in the cache → `swfscan.tsv` (uses `resmap.json` for names). |
| `swf2sheet` | Converts one bitmap SWF to `<name>.png` atlas + `<name>.json`. |
| `swfbatch`  | Runs the conversion for every convertible SWF → `client/public/sheets/<family>/<name>.{png,json}` + `manifest.json` (worker threads, `-workers N`). |
| `swfhit`    | Extracts walkability masks → `client/public/sheets/scene/SCENE_FOLDER_xxxxxx/hit.{bin,json,png}`. |
| `swfui`     | Renders named UI skin symbols (vector + bitmap) of one SWF to one PNG each + `index.json`. |
| `swfanim`   | Renders a vector SWF with nested animated sprites frame by frame into one sheet (`vector-anim`). |

`resmap.json` (md5 → logical path) is produced by `pnpm --filter @mc/server exec tsx tools/resmap.ts`:
it decodes every 13-digit resource code found in the `data_tbl_*` collections, tries the known path
variants (`resource/…`, `icon/…`, `_NEW.swf`, `MAP_x_y.jpg`, `MAP_HIT_NEW.swf`) and keeps those present
in the cache. 5 990 of 9 673 blobs are named this way (1 760 SWF). Unnamed SWFs can still be converted
by md5 (`swfbatch -only unnamed`) but nothing references them yet.

## Sheet JSON

```json
{ "fps": 24, "width": 200, "height": 150, "ox": 0, "oy": 0,
  "images": [ { "x": 0, "y": 0, "w": 200, "h": 150 } ],
  "order": ["0-0", "0-1", "…"],
  "anims": { "1-2": [ { "d": 4, "objs": [ { "i": 3, "m": [1,0,0,1,0,0] } ] } ] },
  "meta": { "midX": 100, "footY": 102, "bodyY": 11, "bodyHeight": 99, "headY": 10, "…": 0 } }
```

`meta` (omitted when the SWF has no `GameResInst` metrics) is read from the DoABC bytecode by
`tools/swf/src/swf/abc.ts`; `Entity.ts` anchors the animation at `(-meta.midX, -meta.footY)`.

`d` = duration in SWF frames, `objs` = images drawn back-to-front with an affine matrix
`[a,b,c,d,tx,ty]` in pixels relative to the stage origin. Nested sprites are flattened per frame.
The client plays these with `client/src/game/SheetAnim.ts`; `Entity.ts` picks the sheet from the
creature `resCode` (`creature/PC_MALE_000001`, `creature/NPC_FUNC_000173`, …).

## Hit mask

`MAP_HIT_NEW.swf` holds one `DefineBinaryData` (zlib) and an ABC class whose first two doubles are the
grid size (e.g. `2031.45 × 1530.4` for a 2000×1500 map — the grid is slightly larger than the image).
Bit `i = y*w + x` of the inflated data, tested as `byte[i>>3] & (1 << (i&7))`, is 1 when walkable.
`client/src/game/HitMask.ts` loads it and snaps clicks to the nearest walkable pixel.

## UI skins (`swfui`)

```powershell
pnpm swfui -out <dir> -xor 1,2,0 [-match REGEX] D:/mcgame/frontend/s/6a41a5ba5c0006ab4e0c1321a2b05027.orig
```

The main client SWF is XOR-obfuscated with the repeating key `[1,2,0]`; `-xor 1,2,0` undoes it before
parsing (omit it for plain SWFs). Every `SymbolClass` name matching `-match` (default `_embed_css_`,
the Flex CSS skin classes) is rendered from frame 0 by `src/sheet/compose.ts` and written as
`<lib>/<symbol>.png`, e.g. `MainStage_SystemBarButtons/button_bag_up_mc.png`, plus `index.json`:

```json
{ "MainStage_SystemBarButtons/button_bag_up_mc": { "w": 41, "h": 46, "ox": 1, "oy": -2 } }
```

`w`/`h` are the PNG size; `ox`/`oy` is the symbol's registration point (its (0,0)) in PNG pixels, so
draw the PNG at `(-ox, -oy)` relative to where Flash placed the symbol.

The renderer (`src/swf/vector.ts`, `styles.ts`, `display.ts`, `src/render/`) parses DefineShape1–4
records into per-style edge lists and scanline-fills them (even-odd, or nonzero for DefineShape4 with
the winding flag; 5 sub-scanlines + exact horizontal coverage for anti-aliasing). Supported: solid,
linear/radial/focal gradients (pad/reflect/repeat), bitmap fills (clipped/repeating, smoothed), strokes
(approximated with round joins/caps), sprites and button up states, PlaceObject colour transforms and
clip-depth masks. Not rendered (reported as "unsupported parts"): text, morph shapes, filters, blend modes.

## Vector animations (`swfanim`)

```powershell
pnpm --filter @mc/swf-tools swfanim -cache E:/mcgame/frontend/s/res -out client/public/sheets/item `
  -name SITEM_SPAWN_000001 -manifest client/public/sheets/manifest.json `
  -key resource/item/SITEM_SPAWN_000001.swf 08de7c8d97ff775d5d6bf347ee5e2079
```

For vector SWFs whose main timeline is one frame but whose nested sprites animate (transport gates
`SITEM_SPAWN_000001..5` = resCodes 2020040000001..5). `SymbolLibrary.composeStage(frame)` renders the main
timeline with every nested sprite on frame `frame % its length` (`displayAt` in `src/swf/display.ts`); the
frame count is the longest nested loop (capped at 120) unless `-frames N`. Output is the standard sheet
format: one image per distinct frame (identical neighbours merge into `d` > 1), anim `default`, every image
placed with the matrix `[1,0,0,1,-left,-top]` so the SWF stage origin (0,0) is the sheet origin; draw it at the
item position. `meta.localizerY` is the y of the child instance named `localizer` (ground line for depth
sorting). SWFs with a `GameResInst` class (vector-drawn NPCs such as `creature/NPC_FUNC_000094`, the Vân Đài
transport NPC) also get its anchor metrics (`midX`, `footY`, …) in `meta`, so `Entity` anchors them like bitmap sheets. With `-manifest` + `-key` the entry is upserted (category `vector-anim`, file line endings kept).
Existing `swf2sheet` / `swfbatch` / `swfui` output is unchanged (`swfui` still writes 226 `MainStage_*` symbols).

## Not covered yet

- Vector SWFs (274) other than the gate sprites above, and the vector parts of mixed files for animated
  sheets (`swf2sheet` stays bitmap-only; `swfanim` covers nested-sprite loops of one-frame vector SWFs).
- Text fields inside UI skins (rare: 3 symbols), filters (glow/shadow), blend modes.
- Sounds (`resource/sound`), fonts.
- Atlas PNGs are written with fast compression (754 MB total). Run `oxipng`/`pngquant` before shipping.
