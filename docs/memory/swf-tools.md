# SWF tools (`tools/swf`)

Usage and formats: [assets-pipeline.md](../assets-pipeline.md). This file records what is not obvious
from the code.

## Anchor metrics (2026-11-03)

Characters floated ~40 px above their shadow because the client guessed the feet at
`(width/2, height-8)` of the SWF frame. The real anchor is per resource: each creature SWF's
`GameResInst` constructor assigns `midX`/`footY` (+ body/head/eye/hand/mouth metrics), and the Flash
client places the clip at `(-midX, -footY)`. These live only in DoABC bytecode (the decompiled
`docs/client` has no definition), so `src/swf/abc.ts` parses the constructor (`push*` +
`initproperty`) and `swf2sheet`/`swfbatch` write them to the sheet JSON as `meta`.
`docs/assets-pipeline.md` called the class "empty" before — it is not.

## Go → TypeScript port (2026-11-03)

The five tools (`swfinfo`, `swfscan`, `swf2sheet`, `swfbatch`, `swfhit`) were rewritten from Go to
TypeScript (`@mc/swf-tools`, run with `tsx`) and checked against the Go binaries on the full cache:

| Output | Result |
|---|---|
| `swfscan.tsv` (3 822 SWF) | byte-identical |
| `swfinfo` JSON (50 sampled files, incl. sprites/symbols) | byte-identical |
| `swfhit` `hit.bin` / `hit.json` / `hit.png` (122 maps) | identical (PNG pixel-equal) |
| `swfbatch` JSON + `manifest.json` (1 623 sheets) | byte-identical |
| `swfbatch` PNG atlases | pixel diff ≤ 4/255 on JPEG-sourced bitmaps |

- PNG pixel differences come from `jpeg-js` vs Go `image/jpeg` IDCT/colour rounding; not visible.
- PNG files are written by `src/png.ts` at zlib level 6: total output 716 MB vs 754 MB from Go. Node
  zlib levels 1–3 produce ~50% larger files on big equipment atlases — don't lower the level for speed.
- `swfbatch` takes ~4m50s with 8 workers (Go: ~2m); fine for an offline tool.
- JSON is written by `src/gojson.ts` to keep Go `encoding/json` output byte-for-byte (sorted map keys,
  `"objs": null` for empty frames, `<`-style escapes) so regenerated files diff cleanly.
  The client tolerates `objs: null`.
- Behavior fix vs Go: JPEGTables are now per file. Go kept them in a package global shared by
  concurrent conversions (a data race); no output changed on the current cache.
- Hit-mask grid size fix (2026-11-07): the port (and Go) read only the first two ABC doubles; 35 of 122
  maps fell back to `sizes.json` (map image size) and got a wrong row stride, so their masks were sheared
  into stripes and players got stuck (reported on map 4 Thiện Tĩnh Địa). `swfhit` now picks the stride by
  row continuity (see assets-pipeline.md § Hit mask); `hit.bin` bytes unchanged, 35 `hit.json` + `hit.png`
  regenerated. Map points (`pl_battle` + NPC positions) on walkable pixels: 545 → 1050 of 1268.
- Windows Defender quarantined freshly built Go binaries (false positive), one more reason the pipeline
  stays in TypeScript.

## Trimmed, paged WebP atlases (2026-11-07)

Bosses rendered as black 512×512 boxes in battle (Bạch Hổ Cuồng Nộ, `creature/NPC_CRE_100057`): the single PNG
atlas was 1539×28727, above WebGL `MAX_TEXTURE_SIZE` (16384 on the dev GPU), so the upload failed. 166 sheets were
over 16384 and 79 more over 8192 (big creatures, evolutions, `PC_*_0000xx` bodies). Cause: every frame bitmap is a
512×512 canvas with the sprite in a corner — trimmed content is ~3% of the area on these sheets.

- `src/sheet/atlas.ts` crops each bitmap to its opaque bounds (offset folded into the obj matrices, so the client
  needs no change for placement), packs pages ≤ 2048×4096 and writes lossy WebP q82 with lossless alpha (`sharp`).
  JSON gains `pages` and per-rect `p`; `SheetAnim.loadSheet` falls back to `<name>.png` when `pages` is absent.
- Result: 1 623 sheets, 1 622 single-page (only `NPC_CRE_100056` needs 2), largest page side 4000; atlases
  ~719 MB PNG → 171 MB WebP; `client/public/sheets` 823 MB → 297 MB. Bạch Hổ: 2.6 MB → 552 KB, 2045×791.
- Not regenerated (still `.png`, loaded via the fallback): `swfanim` output (`creature/NPC_FUNC_000094`,
  `item/SITEM_SPAWN_00000[1-5]` — `000002` is `mixed`, so a full `swfbatch` overwrites it: back these up and
  restore after a batch, as `swfbatch` also rewrites `manifest.json` without the `vector-anim` entries),
  `emotion/*`, `ui/UI_LOADING_BACK`.
- Readers that draw atlas pixels themselves must pick the page per image (`sheet.textures[i].source`), not
  `textures[0]` — see `petTip.ts` `drawCreatureFrame` and the per-source alpha cache in `SheetAnim.ts`.
