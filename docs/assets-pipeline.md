# Asset pipeline: Flash SWF → H5

All tools live in `tools/swf` (TypeScript workspace package `@mc/swf-tools`, run with `tsx`, no build
step). From that folder run `pnpm <tool> [flags]`, e.g. `pnpm swfinfo -brief <md5>`; flags keep the
Go-style `-name value` form. Inputs are the md5-named blobs of the old resource CDN
(`D:\mcgame\frontend\s\res`, override with `-cache`).

Source layout: `src/swf/` (container, tags, shapes, timelines, bitmap decoding via `jpeg-js`/`pngjs`),
`src/sheet/` (atlas + animation JSON), `src/png.ts` (PNG writer), `src/gojson.ts` (JSON writer that
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

## Not covered yet

- Vector SWFs (274) and the vector parts of mixed files: export with JPEXS
  (`C:\Program Files (x86)\FFDec\ffdec-cli.exe -export shape|frame …`) then pack with the same JSON.
- UI skins (`resource/ui/*.swf`, login screens) — vector, rebuild as HTML/CSS instead.
- Sounds (`resource/sound`), fonts.
- Atlas PNGs are written with fast compression (754 MB total). Run `oxipng`/`pngquant` before shipping.
