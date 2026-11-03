---
name: swf-asset-pipeline
description: "Use when working with legacy game assets for mc-game-new: inspecting or classifying SWF files from the old md5 asset cache, (re)generating PNG atlas + JSON sheets for creatures/equipment/effects/items/tiles, extracting map walkability masks, rebuilding resmap.json, changing the tools/swf converters, or debugging a missing/wrong sprite in the client. Triggers: \"convert SWF\", \"regenerate sheets\", \"missing sprite\", \"hit mask\", \"swfinfo\", \"chuyển đổi swf\", \"thiếu hình nhân vật\"."
argument-hint: "Which assets (md5, logical path, family) and what is wrong or needed."
user-invocable: true
---

# SWF Asset Pipeline

Tools live in `tools/swf` (`@mc/swf-tools`, TypeScript run with `tsx`, no build). Full format docs:
`docs/assets-pipeline.md` — read it before changing outputs.

## Inputs

- Asset cache: `D:\mcgame\frontend\s\res` — md5-named blobs (read-only). Override with `-cache DIR`.
- `server/resmap.json` — md5 → logical path (`resource/creature/NPC_CRE_000001.swf`, …), built by
  `pnpm --filter @mc/server resmap` from resource codes found in `data_tbl_*`.
- `tools/swf/swfscan.tsv` — classification of every SWF (bitmap-anim / bitmap-static /
  bitmap-sprites / mixed / vector / no-graphics / error).
- `tools/swf/sizes.json` — map folder → `{w,h}` for hit masks.

## Commands (run inside `tools/swf`)

```powershell
pnpm swfinfo -brief <md5-or-path>                       # structure dump (JSON)
pnpm swfscan -names ../../server/resmap.json            # rewrite swfscan.tsv
pnpm swf2sheet -out <dir> [-name NAME] <md5-or-path>    # one SWF -> <name>.png + <name>.json
pnpm swfbatch -only creature,equip,effect,item,tile,scene [-workers 8]
                                                        # all convertible -> client/public/sheets + manifest.json
pnpm swfhit -sizes sizes.json -png                      # MAP_HIT_NEW.swf -> sheets/scene/<folder>/hit.{bin,json,png}
pnpm lint                                               # typecheck the tools
```

Flags keep the Go-style `-name value` form. `swfbatch` takes ~5 min for the six families
(~1 600 files) and rewrites ~700 MB under `client/public/sheets` — confirm with the user before a full
regeneration, prefer `-only <family>` or `swf2sheet` for a single asset.

## Debugging a missing / wrong sprite

1. From the entity's `resCode`: `decodeResCode(code).path` (`@mc/shared`) gives the logical path;
   md5 of `resource/<path>` is the cache file (see `resurl.ts`).
2. `client/public/sheets/manifest.json` → entry for that logical path: `error`, `skipped`
   (unsupported objects), `images`, `anims`.
3. `pnpm swfinfo <md5>` and the row in `swfscan.tsv`: `vector`/`mixed` files are only partially
   convertible (vector shapes are skipped — see the doc's "Not covered yet" section).
4. Regenerate just that file with `swf2sheet -out ../../client/public/sheets/<family> -name <NAME> <md5>`.

## Changing the converters

- Source map: `src/swf/` (reader, tags, matrix, shape, timeline, summary, images), `src/sheet/sheet.ts`
  (flatten timeline → atlas + anims), `src/png.ts` (encoder), `src/gojson.ts` (JSON writer that keeps
  the byte-exact format of the former Go tools), `src/cli/*.ts`.
- The output formats are consumed by `client/src/game/SheetAnim.ts` and `client/src/game/HitMask.ts`;
  any format change must update those readers and `docs/assets-pipeline.md` together.
- Regression check before replacing outputs: run the changed tool into a scratch directory and compare
  with the current files (JSON byte-equal; PNGs pixel-equal after decode — JPEG-sourced bitmaps
  may differ by a few levels between decoders). Report the comparison numbers.
- Windows Defender has flagged freshly built Go binaries in the past; the TS tools avoid that — do not
  reintroduce compiled helpers.

## Completion checks

- `pnpm --filter @mc/swf-tools lint` clean.
- Regenerated assets compared against the previous output, or the user approved the change.
- `docs/assets-pipeline.md` updated if formats, flags or coverage changed.
