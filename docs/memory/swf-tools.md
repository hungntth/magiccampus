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
- Windows Defender quarantined freshly built Go binaries (false positive), one more reason the pipeline
  stays in TypeScript.
